# 토스 릴레이 서버 설계 (Toss Relay Server)

- 작성일: 2026-06-26
- 상태: 설계 승인됨 (구현 계획 작성 대기)

## 1. 배경 / 문제

dotori는 토스인베스트 Open API로 보유 종목·시세·환율을 가져온다. 토스는 **IP 화이트리스트**(정책상 해제 불가)를 요구하며, 현재는 개발자 로컬 PC의 IP만 등록돼 있다.

프로덕션은 Vercel에 배포되는데, Vercel 서버리스 함수의 아웃바운드 IP는 AWS Lambda 풀에서 동적으로 잡혀 **고정되지 않고 수시로 바뀐다.** 따라서 Vercel에서 직접 토스를 호출하면 화이트리스트를 통과할 수 없다.

핵심 제약을 다시 확인한 사실:
- 토스 IP 제한은 **아웃바운드(나가는) IP** 기준이다.
- 토스 자격증명(`clientId`/`clientSecret`)과 토큰은 **서버에 저장되지 않고** 사용자 브라우저 IndexedDB에 암호화 저장되며, 호출 시마다 요청 body로 전달된다. 즉 기존 `app/api/toss/*` 프록시는 시크릿을 보관하지 않는 얇은 릴레이다.

## 2. 목표 / 비목표

### 목표
- 토스로 나가는 모든 호출이 **고정 공인 IP 1개**를 거치게 해서, 그 IP만 토스에 등록하면 프로덕션에서 동작하게 한다.
- Vercel은 프론트(정적 PWA) 호스팅으로 **계속 사용**한다.
- 릴레이 서버의 보안을 1급으로 다룬다(앱 레벨 + OS 레벨).
- **dev 환경에서 릴레이 연결을 먼저 end-to-end로 검증**한 뒤에 프로덕션 배포로 넘어간다.

### 비목표
- 릴레이가 토스 자격증명을 저장하거나 사용자 인증을 관리하지 않는다(여전히 무상태 릴레이).
- 토스 API 응답 스키마 변경 대응은 범위 밖(기존 `toss-client` 정규화 로직 그대로 사용).
- 다중 사용자/멀티테넌시는 범위 밖(단일 사용자 토이).

## 3. 아키텍처

### 배포 토폴로지

```
브라우저 ──(프론트 정적)──────────────→ Vercel
   └──(POST /token 등 + X-Relay-Secret)──→ Oracle Cloud Free Tier VM
                                              ├ Caddy   : HTTPS 종단 (nip.io 자동 인증서)
                                              └ Fastify : 릴레이 (systemd, 저권한 유저)
                                                   └──(Bearer / client_credentials)──→ 토스 API
                                              ▲ 이 VM의 고정 공인 IP 1개만 토스에 등록
```

- 호스트: Oracle Cloud Free Tier(영구 무료, 단일 VM이라 아웃바운드 IP가 그 VM 공인 IP로 고정).
- TLS: 도메인이 없으므로 `nip.io` wildcard DNS(`1-2-3-4.nip.io`)로 Let's Encrypt 인증서를 Caddy가 자동 발급/갱신.

### 코드 구조 (같은 dotori 레포 내)

```
relay/                      ← 새 디렉토리, Oracle VM에 독립 배포
  package.json              fastify, @fastify/cors, @fastify/rate-limit, @fastify/helmet
  tsconfig.json
  src/server.ts             부팅 · 플러그인 등록 · 보안 미들웨어
  src/routes.ts             5개 엔드포인트 핸들러 + JSON 스키마
  src/config.ts             env 로드/검증 (PORT, ALLOWED_ORIGINS, RELAY_SECRET, TOSS_API_BASE …)
lib/toss/toss-client.ts     ← 수정 없이 relay가 상대경로로 import (토스 파싱 단일 소스)
```

`toss-client.ts`는 `fetch`/`process.env`만 쓰는 프레임워크 독립 코드라 릴레이가 그대로 재사용한다. 토스 응답 정규화 로직이 한 곳에만 존재하므로 Next 라우트와 릴레이가 어긋날 일이 없다.

> Vercel 빌드가 `relay/`를 빌드 대상에 넣지 않도록 분리한다(예: `.vercelignore` 또는 빌드 설정). 릴레이는 Vercel에 배포되지 않는다.

## 4. 릴레이 엔드포인트

기존 [app/api/toss/*](../../../app/api/toss/) 라우트와 **요청/응답 형태를 동일하게** 맞춰 클라 변경을 최소화한다.

| 엔드포인트 | 요청 body | 응답 | 위임 함수 |
|---|---|---|---|
| `POST /token` | `{clientId, clientSecret}` | `{accessToken, expiresIn}` | `exchangeToken` |
| `POST /accounts` | `{token}` | `{accounts: string[]}` | `fetchAccounts` |
| `POST /holdings` | `{token, accountSeq}` | `{holdings}` | `fetchHoldings` |
| `POST /prices` | `{token, symbols}` | `{prices}` | `fetchPrices` |
| `POST /exchange-rate` | `{token}` | `{rate}` | `fetchExchangeRate` |

헬스체크용 `GET /healthz`(인증 불필요, 의존성 없는 200)를 추가해 systemd/모니터링·배포 검증에 사용한다.

## 5. 클라이언트 변경 (env 분기)

토스를 호출하는 지점은 두 파일의 `fetch` 3곳뿐이다:
- [lib/toss/toss-token.ts:16](../../../lib/toss/toss-token.ts) — `/api/toss/token`
- [lib/sync/refresh.ts](../../../lib/sync/refresh.ts) — `proxyPost`, `proxyPostWithTokenRetry`

여기에 base URL 결정 + 헤더 주입을 하는 작은 헬퍼를 둔다.

```
tossEndpoint(path): { url, headers }
  base   = process.env.NEXT_PUBLIC_RELAY_URL   // 있으면 릴레이, 없으면 ""(상대경로)
  url    = base ? `${base}${path}` : `/api/toss${path}`
  secret = process.env.NEXT_PUBLIC_RELAY_SECRET
  headers= { "Content-Type": "application/json",
             ...(secret ? { "X-Relay-Secret": secret } : {}) }
```

- `NEXT_PUBLIC_RELAY_URL` **미설정** → 기존 상대경로(`/api/toss/*`) → 로컬 Next 라우트 → 로컬 IP(화이트리스트됨)로 토스. (현행 동작 유지)
- `NEXT_PUBLIC_RELAY_URL` **설정** → 릴레이로 호출.

따라서 기존 `app/api/toss/*` 라우트는 **삭제하지 않고 유지**한다(로컬 dev 폴백 경로).

### dev 우선 검증 흐름 (요구사항)

1. `relay`를 로컬에서 `localhost:8787`로 실행(`npm run dev`, tsx watch).
2. 프론트 `.env.local`에 다음을 설정:
   - `NEXT_PUBLIC_RELAY_URL=http://localhost:8787`
   - `NEXT_PUBLIC_RELAY_SECRET=<dev용 시크릿>`
3. `npm run dev`로 앱을 띄워 실제 토스 동기화를 수행하며 다음을 확인:
   - 정상 흐름(토큰→보유→시세→환율) 동작
   - `X-Relay-Secret` 누락 시 401
   - 잘못된 body 시 입력검증 400
   - 과다 호출 시 rate-limit 429
   - CORS: `http://localhost:3000` Origin 허용
4. dev 검증 통과 후에만 Oracle 배포 단계로 진행.

> 로컬 릴레이가 토스로 나가는 IP는 개발자 로컬 IP라 이미 화이트리스트되어 있어 dev 검증이 가능하다.

## 6. 보안 설계

### 6.1 앱 레벨 (Fastify)

| 항목 | 구현 | 이유 |
|---|---|---|
| HTTPS 종단 | Caddy 리버스 프록시(nip.io + Let's Encrypt) | 토큰 평문 전송 방지, PWA mixed-content 회피 |
| CORS allowlist | `@fastify/cors`, 허용 Origin 다중(`http://localhost:3000` + Vercel 도메인) | 타 웹사이트의 브라우저발 호출 차단 |
| 공유 시크릿 인증 | `X-Relay-Secret` 검증(불일치 401) | 무차별 스캐너/봇 1차 필터 |
| Rate limit | `@fastify/rate-limit`, IP당 분당 제한 | 남용·DoS 완화, 토스 쿼터 보호 |
| 입력 검증 | 엔드포인트별 JSON 스키마(타입/필수/길이) | 잘못된·악의적 body 차단 |
| 본문 크기 제한 | `bodyLimit` (예: 64KB) | 메모리 고갈 방지 |
| 보안 헤더 | `@fastify/helmet` | 표준 방어 헤더 일괄 |
| 에러 마스킹 | 토스 원문/내부 에러 미노출, 코드화된 에러만 | 정보 노출 방지 |
| 로깅 위생 | `token`·`clientSecret`·`X-Relay-Secret` 절대 미기록 | 디스크/로그 유출 방지 |
| fetch 타임아웃 | 토스 호출에 AbortSignal 타임아웃 | 행(hang)·소켓 고갈 방지 |

#### 공유 시크릿의 한계 (명시)
클라이언트가 브라우저라 `NEXT_PUBLIC_RELAY_SECRET`은 번들에 박혀 **공개된다.** 따라서 이는 "진짜 비밀"이 아니라 무차별 봇을 거르는 1차 필터다. 진짜 비밀(토스 `clientSecret`/`token`)은 릴레이를 거쳐도 저장되지 않고 사용자 브라우저에만 암호화 저장되므로 영향받지 않는다. 릴레이의 실질 방어는 **CORS + rate-limit + 입력검증 + OS 하드닝** 조합이다.

### 6.2 OS / 인프라 레벨 (Oracle VM)

| 항목 | 구현 | 이유 |
|---|---|---|
| 클라우드 방화벽 | Oracle NSG/Security List: 인바운드 22(내 IP만)·80·443만 | 클라우드 레벨 1차 차단 |
| OS 방화벽 | iptables/firewalld 동일 규칙 (Oracle Linux는 iptables 기본 차단이라 주의) | 2차 방어 |
| SSH 하드닝 | 키 인증만, 비번 로그인·root 로그인 금지 | 무차별 침입 차단 |
| fail2ban | SSH 반복 실패 IP 자동 차단 | 봇 차단 |
| 자동 보안 패치 | unattended-upgrades | 알려진 취약점 노출 최소화 |
| 저권한 실행 | 릴레이를 non-root 전용 유저 + systemd 서비스로 | 침해 시 피해 최소화 |

## 7. 인프라 런북 (구현 계획에서 상세화)

1. Oracle Free Tier VM 생성 + 고정 공인 IP 확보
2. Node 22 설치, 전용 유저 생성
3. 릴레이 빌드 → systemd 서비스 등록 → 부팅 자동 시작
4. Caddy 설치 → `nip.io` 도메인으로 자동 TLS, Fastify로 리버스 프록시
5. 방화벽(NSG + iptables) · SSH 하드닝 · fail2ban · unattended-upgrades
6. 토스 콘솔에 VM 공인 IP 등록
7. Vercel 환경변수(`NEXT_PUBLIC_RELAY_URL`, `NEXT_PUBLIC_RELAY_SECRET`) 설정 후 재배포, 프로덕션 동기화 검증

## 8. 테스트 전략

- **릴레이 라우트**: Fastify `inject`로 핸들러 단위 테스트 — 정상 응답, 입력검증 실패(400), 시크릿 누락/불일치(401), rate-limit 초과(429), CORS preflight. 토스 호출은 모킹.
- **toss-client**: 기존 테스트 그대로 유효(공유 단일 소스).
- **클라 분기 헬퍼**: `NEXT_PUBLIC_RELAY_URL` 유무에 따른 URL·헤더 생성 단위 테스트.
- 검증 게이트: `npm run typecheck && npm run lint && npm test` 통과(릴레이 포함).

## 9. 구현 순서

1. `relay/` 스캐폴딩(package.json, tsconfig, config) + `toss-client` 공유 import
2. 5개 엔드포인트 + JSON 스키마 + 보안 미들웨어(CORS/secret/rate-limit/helmet/bodyLimit)
3. 릴레이 라우트 테스트
4. 클라 분기 헬퍼 + 3개 호출 지점 적용 + 헬퍼 테스트
5. **dev end-to-end 연결 검증** (5절 흐름)
6. Oracle VM 인프라 셋업(런북) — 사용자와 함께 단계별 진행
7. 토스 IP 등록 + Vercel env 설정 + 프로덕션 검증

## 10. 확정값 / 확인 필요

### CORS allowlist (확정)
- 프로덕션: `https://dotori-h4ppy-bee.vercel.app`
- 프리뷰(와일드카드): `https://dotori-*-h4ppy-bee.vercel.app` → 정규식으로 매칭
  (`/^https:\/\/dotori-[a-z0-9-]+-h4ppy-bee\.vercel\.app$/`)
- dev: `http://localhost:3000` (+ 필요 시 `http://<PC-LAN-IP>:3000`)
- Vercel 스코프명은 `h4ppy-bee`로 확정.

### dev 검증용 IP
- 이 PC의 공인 IP는 이미 토스 화이트리스트에 등록됨 → 로컬 릴레이가 토스를 호출하는 dev 검증 가능. (유동 IP면 변경 시 재등록 필요)

### 여전히 확인 필요
- Oracle 리전/VM shape 선택(Free Tier 한도 내) — VM 생성하면서 함께 결정.
- 릴레이 배포 방식: 빌드된 JS를 git pull로 가져올지, 산출물만 전송할지(런북에서 확정).
