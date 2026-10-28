<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# dotori 프로젝트 가이드

토스 스타일 **로컬 퍼스트 PWA 개인 자산 관리 앱**. 주식·저축/현금성·연금·코인 자산과 부채를 합쳐 **순자산**을 보여준다. 토스인베스트 Open API(주식·연금 시세·환율)와 업비트 API(코인·예수금)로 시세를 가져와 직접 입력한 자산과 합친다. 계획(`plan`) 탭은 **통장 쪼개기(envelope budgeting)** 화면이다(하위 부동산 탭은 플레이스홀더). 가계부(`ledger`)는 탭만 있고 아직 플레이스홀더(`DummyPage`)다. 모든 데이터는 브라우저 IndexedDB에 저장되고, 민감정보는 비밀번호 파생 키로 암호화한다. **서버 DB 없음.** (패키지명 `dotori`)

홈 탭(`app/page.tsx`)은 **순자산**과 **목표 자산** 섹션을 보여준다. 목표 자산 섹션에서 목표 금액·목표일을 설정하면 월 필요 저축액·잔여 금액·달성률 진행 링을 표시한다.

전체 구조·데이터 흐름·보안 모델은 **[docs/architecture.md](docs/architecture.md)** 를 먼저 읽는다. 주제별 서비스 구조 문서는 **[docs/](docs/README.md)** 카탈로그 참고 — 백업은 [docs/backup.md](docs/backup.md), 외부 OpenAPI 연동은 [docs/external-api.md](docs/external-api.md).

## 기술 스택

- **Next.js 16.2.9** (App Router) — 위 경고 준수
- React 19 · TypeScript 5 · Tailwind CSS v4
- `@tanstack/react-query` 5 (자산별 쿼리/갱신)
- `dexie` 4 (IndexedDB) · `zustand` 5 (잠금·세션 키·네비, 인메모리)
- `vitest` 4 + Testing Library + `fake-indexeddb`

## 명령어

```bash
npm run dev        # 개발 서버
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

코드 변경 후 `npm run typecheck && npm run lint && npm test` 통과를 기본으로 한다. 로컬 Node 버전은 **22**로 고정한다(`.nvmrc`, `package.json` `engines`).

## 배포 / CI·CD

GitHub `h4ppybee/dotori` ↔ Vercel 프로젝트가 **Git 연동**되어 있다.

- `main` push → **프로덕션 자동배포**
- 그 외 브랜치 push / PR → **프리뷰 자동배포** (PR에 Preview URL 코멘트)
- 모든 push에서 GitHub Actions(`.github/workflows/ci.yml`)가 `typecheck · lint · test`를 Node 22로 검증

**배포 흐름은 `dtr-deploy` 스킬을 따른다.** 요약:

- **큰 작업**: `superpowers:using-git-worktrees`로 worktree에서 작업 → 검증 통과 → 커밋(`dtr-git-commit-convention`) → 브랜치 push → `gh pr create`로 PR → Vercel 프리뷰로 검토 → 머지 시 프로덕션 배포.
- **즉시 배포(사용자가 명시적으로 원할 때만)**: 검증 통과 후 `main`에 직접 커밋·push → 프로덕션 자동배포.
- 통합 방식(PR 프리뷰 vs 즉시 배포)은 작업 전에 사용자에게 확인한다. 기본은 PR 프리뷰.
- **UI·모션 변경은 배포 전에 웹에서 사용자 확인을 먼저 받는다.** "배포해줘"라고 해도 UI 변경이면 로컬 dev 서버(`npm run dev`, 같은 Wi-Fi 휴대폰용 LAN 주소 포함) 또는 PR Vercel 프리뷰 URL을 먼저 보여주고, 확인을 받은 뒤에만 `main`에 push한다. 가능하면 브라우저로 동작(애니메이션 프레임 등)도 직접 검증한다 — 테스트·타입체크 통과만으로는 시각적 결함을 잡지 못한다.

## 디렉토리 요약

- `app/` — App Router 라우트(모두 `"use client"`). 메인 5탭: `page`(홈 — 순자산 + 목표 자산), `assets`(자산 개요), `plan`(통장 쪼개기), `ledger`(플레이스홀더), `settings`
  - `assets/{stocks,savings,pension,crypto}` — 자산별 화면, 각 `manage/`에 추가·수정 화면(주식은 `holdings/new`·`holdings/[id]` 사용)
  - `assets/snapshots`(전체 목록)·`assets/snapshots/[id]`(상세 표+삭제) — 수동 전체 자산 스냅샷 화면
  - `plan/realty` — 부동산 조달계획(플레이스홀더)
  - `api/toss/*`·`api/upbit/*` — 서버 프록시(토스·업비트)
- `components/` — `ui/`(디자인 프리미티브·`DonutChart` 등), `portfolio/`, `holdings/`, `savings/`, `pension/`, `coin/`, `debt/`, `snapshot/`(스냅샷 섹션·목록 행·추이 콤보 차트), `goal/`(목표 카드·폼·빈상태·진행률 링), `envelope/`(통장 쪼개기: `ProfileSegment`·`RollupCard`·`EnvelopeItemRow`·`EnvelopeItemDialog`·`EnvelopeSheetImport`), `nav/`(탭 바, `NestedTabBar` — 자산·계획 공용), `settings/`(연동 폼·백업 패널·`SheetExportPanel` — 구글 시트 내보내기 연결/해제/지금 내보내기, `BiometricPanel` — Face ID 잠금 해제 켜기/끄기)
- `lib/` — 자산 소스: `toss/`·`upbit/`·`sync/`(동기화 — 토스·업비트·예적금 자동 증가). 도메인 서비스(순수 계산): `portfolio/`·`savings/`·`pension/`·`coin/`·`debt/`·`goal/`(순자산 목표 진척 순수 계산)·`envelope/`(통장 쪼개기 집계·태그색·프리셋·시트 가져오기 파서 `sheet-import`, 조립 `import-from-sheet`). 공통: `db/`(Dexie·CRUD), `sector/`, `crypto/`, `biometric/`(Face ID 잠금 해제 — WebAuthn PRF 래퍼 `webauthn`·키 파생 `prf-key`·등록/해제 서비스 `biometric-unlock`), `snapshot/`(수동 전체 자산 스냅샷 — 캡처·순수 빌더·추이 헬퍼), `sheet-export/`(구글 시트 내보내기 — 순수 빌더·웹앱 클라이언트), `backup/`, `nav/`(활성 탭 판정·탭 정의·전환 방향 `direction`), `query/`(자산별 훅, `use-asset-snapshots`·`use-goal`·`use-net-worth`·`use-envelope`·`use-sheet-export`·`use-biometric` 포함)
- `stores/` — `app-store.ts`(잠금·세션 키·마지막 갱신·`lastSheetExport`), `nav-store.ts`(탭 복귀 지점)
- `integrations/apps-script/` — 구글 시트 내보내기 Apps Script 원본(`sheet-export.gs`)과 설치 안내(`README.md`)
- `test/` — 모듈 구조를 미러링한 테스트

## 핵심 규칙

- 🎨 **디자인/UI (필수)**: 컴포넌트·페이지·화면을 만들거나 수정할 때는 **반드시 [DESIGN.md](DESIGN.md)를 먼저 읽고** 그 토큰·규칙을 따른다.
  - 색(브랜드·서피스·텍스트), **증시 시맨틱**(상승/수익=빨강 `up`, 하락/손실=파랑 `down`, 한국 관례), 타이포그래피 계층, 스페이싱/그리드/엘리베이션, 컴포넌트 규격, **UX 라이팅(토스 라이팅 규칙)**까지 포함한다.
  - 임의의 색·폰트·간격·radius를 새로 만들지 말고 DESIGN.md에 정의된 토큰과 Tailwind 클래스(`text-up`, `bg-surface-soft` 등)를 사용한다.
  - 기존 `components/ui/` 프리미티브를 우선 재사용한다.
  - **새 디자인 토큰/규칙을 추가하거나 기존 규칙을 바꿀 때는 [DESIGN.md](DESIGN.md)도 함께 수정**해 코드와 문서를 항상 일치시킨다. 새 색·간격·컴포넌트 규격·UX 카피 규칙이 생기면 먼저(또는 함께) DESIGN.md에 반영한다.
- **보안**: 비밀번호는 절대 저장하지 않는다(`salt` + `verifier`만 저장). 세션 키(CryptoKey)는 비추출 키로 파생하고, 자동 잠금(10분 유휴 슬라이딩)을 위해서만 비추출 핸들 + 만료시각을 세션 볼트(`lib/db/session-vault`, IndexedDB)에 둔다 — 만료/잠금 시 폐기되며 원본 키 바이트는 영속화되지 않는다. 토스·업비트 시크릿·토큰은 `app/api/toss/*`·`app/api/upbit/*` 프록시 경유. 암호화는 `lib/crypto`. Face ID 잠금 해제(보조 수단)는 WebAuthn PRF 파생 키로 PIN/비밀번호 자체를 암호화해 둘 뿐, 새 키 체계를 들이지 않는다 — 상세는 `lib/biometric/`와 아래 **biometric 테이블** 항목.
- **순수 계산**: `lib/portfolio/`(및 `savings/`·`pension/`·`coin/`·`debt/`·`goal/`·`envelope/`)의 서비스 함수는 DB·비동기·`Date` 없이 입력만으로 결과를 낸다. 계산 로직은 여기에 두고 테스트한다.
- **예적금 자동 증가**: 저축 `DEPOSIT` 계좌는 금액 기준일 `balanceAsOf` 이후 지난 납입일(만기일 다음 날의 일자)마다 월 불입액만큼 늘어난다. 계산은 `lib/savings/deposit-accrual`(순수), 실행은 통합 갱신(`useAssetsRefresh` → `lib/sync/refresh-savings`). 기준일은 금액이 바뀔 때만 갱신한다.
- **goal 테이블**: Dexie v8에서 추가된 `goal` 테이블(스키마: `{ id:"goal", targetNetWorthKrw, targetDate, createdAt }`)은 단일 행으로 순자산 목표를 저장한다. 사용자가 직접 입력하는 수동 데이터이므로 백업(payload v6)에 포함된다.
- **통장 쪼개기 원본 = 구글 시트**: 사용자 시트의 `통장쪼개기` 탭이 원본이다. 화면의 "시트에서 가져오기"가 시트 내보내기와 같은 Apps Script 웹앱(`action: "readEnvelope"`)으로 읽어 앱 항목을 통째로 덮어쓴다(확인 후). 위 블록 = 아내, 아래 블록 = 남편, 금액은 만원 단위. 상세는 [docs/external-api.md](docs/external-api.md).
- **envelope 테이블**: Dexie v9에서 추가된 `envelopeItems`(통장 쪼개기 항목: 프로필·태그·은행·금액)·`envelopeConfig`(커스텀 태그·은행 프리셋) 테이블은 수동 데이터이므로 백업(payload v7)에 포함된다.
- **sheetExport 테이블**: Dexie v10, 웹앱 URL·암호화된 비밀키 단일 행. 기기별 민감 설정이므로 백업 제외, PIN·비밀번호 변경 시 `rekeyVault`가 재암호화한다.
- **biometric 테이블**: Dexie v11, 패스키 ID·PRF salt·PRF 키로 암호화한 PIN 단일 행. 기기·도메인 종속이라 백업 제외, PIN 변경 시 `rekeyVault` 전에 삭제한다(삭제 실패 시 변경 자체를 중단).
- **섹터**: 화면 표시는 항상 `resolveSector(symbol, sectorOverrides)` 기반(우선순위 overrides > seed > "미분류"). `sectorOverrides`는 symbol을 키로 저장해 AUTO·MANUAL 모두에 적용된다. 기본 목록은 `KNOWN_SECTORS`(테마형).
- **Next 16**: 동적 라우트 `params`는 Promise → 클라이언트에서 `use(params)`. 네비게이션은 `next/navigation`. IndexedDB는 서버/SSR에서 접근 금지.
- 🔒 **개인정보 금지 (필수, 공개 저장소)**: 이 저장소는 **공개(PUBLIC)** 다. 코드·주석·placeholder·테스트 데이터·문서(`docs/`)·커밋 메시지·PR 본문에 **사용자의 실제 데이터를 넣지 않는다.**
  - 금지: 실명·별명(가족 호칭 포함), 실제 계좌명·잔액·매수가·수량·만기일·금리, 계좌번호, 이메일·전화번호, 구글 시트 ID·Apps Script 웹앱 URL·비밀키, 릴레이 주소·시크릿 등 실제 값.
  - 예시가 필요하면 **일반 예시**를 쓴다: 계좌명 `청년도약적금`·`파킹통장`, 금액은 `1,200만`·`500만`처럼 둥근 가상 값, 날짜도 가상 값.
  - 사용자가 대화에서 공유한 실제 값(시트 내용, 스크린샷, 금액)을 테스트·문서 예시로 옮기지 않는다. 설계·계획 같은 개인 작업 노트는 저장소 밖(개인 문서)에 둔다.
  - 시크릿이 필요한 설정 예시(`.env.example` 등)는 `change-me` 같은 자리표시자만 쓴다.
- 📄 **문서 동기화 (필수)**: 기능을 추가·변경할 때는 관련 문서를 **코드와 같은 작업에서 함께 갱신**한다. 문서가 코드와 어긋난 채로 남기지 않는다. 무엇을 만졌는지에 따라:
  - **서비스 구조**(새 라우트/탭·`lib` 모듈·`components` 디렉토리·데이터 흐름·자산 종류) → 이 **AGENTS.md**와 **[docs/architecture.md](docs/architecture.md)**.
  - **백업**(`lib/backup`, 새 Dexie 테이블/영속 데이터) → **[docs/backup.md](docs/backup.md)** + `lib/backup`의 export/import.
  - **외부 OpenAPI 연동**(`lib/{toss,upbit,sync}`, `app/api/*`, 프록시·릴레이·토큰) → **[docs/external-api.md](docs/external-api.md)**.
  - **디자인 토큰·UI 규칙** → [DESIGN.md](DESIGN.md)(위 디자인 규칙 참조).
  - 새 주제 영역이 생기면 `docs/`에 문서를 추가하고 [docs/README.md](docs/README.md) 카탈로그에 등록한다.

## 코딩 스타일

- `if/else` 본문은 한 줄이어도 중괄호로 감싼다.
- 중첩 대신 early return/throw.
- 기존 컴포넌트의 톤(주석 밀도·네이밍·Tailwind 사용)을 따른다.
