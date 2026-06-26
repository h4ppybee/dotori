<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# finote (dotori) 프로젝트 가이드

토스 스타일 **로컬 퍼스트 PWA 주식 포트폴리오 앱**. 토스인베스트 Open API로 보유 종목·시세·환율을 가져와 직접 추가 종목과 합쳐 보여준다. 모든 데이터는 브라우저 IndexedDB에 저장되고, 민감정보는 패스프레이즈 파생 키로 암호화한다. **서버 DB 없음.** (패키지명 `dotori`, 통칭 finote)

전체 구조·데이터 흐름·보안 모델은 **[docs/architecture.md](docs/architecture.md)** 를 먼저 읽는다.

## 기술 스택

- **Next.js 16.2.9** (App Router) — 위 경고 준수
- React 19 · TypeScript 5 · Tailwind CSS v4
- `@tanstack/react-query` 5 (포트폴리오 쿼리/갱신)
- `dexie` 4 (IndexedDB) · `zustand` 5 (잠금·세션 키, 인메모리)
- `vitest` 4 + Testing Library + `fake-indexeddb`

## 명령어

```bash
npm run dev        # 개발 서버
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

코드 변경 후 `npm run typecheck && npm run lint && npm test` 통과를 기본으로 한다.

## 디렉토리 요약

- `app/` — App Router 라우트(모두 `"use client"`): `page`(홈), `holdings/new`(추가), `holdings/[id]`(상세·수정·삭제), `settings` + `api/toss/*` 서버 프록시
- `components/` — `ui/`(디자인 프리미티브), `portfolio/`(대시보드 위젯), `holdings/`, `settings/`
- `lib/` — `toss/`·`sync/`(동기화), `db/`(Dexie·CRUD), `portfolio/`(순수 계산), `sector/`, `crypto/`, `snapshot/`, `backup/`, `query/`
- `stores/app-store.ts` — zustand(잠금·세션 키·마지막 갱신)
- `test/` — 모듈 구조를 미러링한 테스트

## 핵심 규칙

- 🎨 **디자인/UI (필수)**: 컴포넌트·페이지·화면을 만들거나 수정할 때는 **반드시 [DESIGN.md](DESIGN.md)를 먼저 읽고** 그 토큰·규칙을 따른다.
  - 색(브랜드·서피스·텍스트), **증시 시맨틱**(상승/수익=빨강 `up`, 하락/손실=파랑 `down`, 한국 관례), 타이포그래피 계층, 스페이싱/그리드/엘리베이션, 컴포넌트 규격, **UX 라이팅(토스 라이팅 규칙)**까지 포함한다.
  - 임의의 색·폰트·간격·radius를 새로 만들지 말고 DESIGN.md에 정의된 토큰과 Tailwind 클래스(`text-up`, `bg-surface-soft` 등)를 사용한다.
  - 기존 `components/ui/` 프리미티브를 우선 재사용한다.
  - **새 디자인 토큰/규칙을 추가하거나 기존 규칙을 바꿀 때는 [DESIGN.md](DESIGN.md)도 함께 수정**해 코드와 문서를 항상 일치시킨다. 새 색·간격·컴포넌트 규격·UX 카피 규칙이 생기면 먼저(또는 함께) DESIGN.md에 반영한다.
- **보안**: 패스프레이즈/세션 키(CryptoKey)는 절대 영속화하지 않는다(메모리 한정). 토스 시크릿·토큰은 `app/api/toss/*` 프록시 경유. 암호화는 `lib/crypto`.
- **순수 계산**: `lib/portfolio/`의 함수는 DB·비동기·`Date` 없이 입력만으로 결과를 낸다. 계산 로직은 여기에 두고 테스트한다.
- **섹터**: 화면 표시는 항상 `resolveSector(symbol, sectorOverrides)` 기반(우선순위 overrides > seed > "미분류"). `sectorOverrides`는 symbol을 키로 저장해 AUTO·MANUAL 모두에 적용된다. 기본 목록은 `KNOWN_SECTORS`(테마형).
- **Next 16**: 동적 라우트 `params`는 Promise → 클라이언트에서 `use(params)`. 네비게이션은 `next/navigation`. IndexedDB는 서버/SSR에서 접근 금지.

## 코딩 스타일

- `if/else` 본문은 한 줄이어도 중괄호로 감싼다.
- 중첩 대신 early return/throw.
- 기존 컴포넌트의 톤(주석 밀도·네이밍·Tailwind 사용)을 따른다.
