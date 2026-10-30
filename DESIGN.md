---
version: alpha
name: Toss-style-design-analysis
description: A Korean fintech aesthetic modeled on Toss — calm, trustworthy, and number-forward. The base canvas is a soft warm-cream floor (`#FCFBF8`) carrying pure-white cards with generous radii; a warm acorn brown (`#A87342`) is the single brand voltage, reserved for primary CTAs, active states, and key emphasis. Type runs Pretendard (the open substitute for Toss Product Sans) at a tight greyscale hierarchy — large bold numerals dominate, body text stays calm at weight 400. Korean stock-market semantics apply: gains/up are RED (`#F04452`), losses/down are BLUE (`#3182F6`) — the inverse of Western convention. All copy follows Toss UX-writing: 해요체, active voice, positive framing. Depth comes from card-on-grey layering and soft shadows, never heavy borders.

colors:
  primary: "#A87342"
  primary-active: "#8E5E34"
  primary-pressed: "#774C28"
  primary-disabled: "#E4D3BF"
  primary-surface: "#F3E9DD"
  ink: "#2B2B2B"
  body: "#4B4742"
  body-soft: "#6F6A63"
  muted: "#8C8C8C"
  muted-soft: "#B5AEA4"
  hairline: "#F1ECE4"
  hairline-soft: "#F7F3EC"
  canvas: "#FCFBF8"
  surface-card: "#FFFFFF"
  surface-soft: "#FAF7F1"
  surface-strong: "#EDE7DD"
  on-primary: "#FFFFFF"
  on-ink: "#FFFFFF"
  semantic-up: "#F04452"
  semantic-up-surface: "#FDECEE"
  semantic-down: "#3182F6"
  semantic-down-surface: "#E8F3FF"
  semantic-flat: "#8C8C8C"
  semantic-warning: "#FF9800"
  semantic-success: "#15803D"

typography:
  display-lg:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Apple SD Gothic Neo', sans-serif"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.5px
  display-md:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.4px
  title-lg:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: -0.3px
  title-md:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 19px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.2px
  title-sm:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: -0.2px
  body-lg:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.2px
  body-md:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.1px
  body-strong:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: -0.1px
  caption:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  caption-strong:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  number-hero:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.5px
    fontVariantNumeric: tabular-nums
  number-lg:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.2px
    fontVariantNumeric: tabular-nums
  number-md:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
    fontVariantNumeric: tabular-nums
  button:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.2px
  nav-link:
    fontFamily: "Pretendard, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.1px

rounded:
  none: 0px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 28px
  pill: 100px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  base: 16px
  md: 20px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 64px

shadows:
  card: "0 1px 4px rgba(0, 23, 51, 0.04), 0 2px 12px rgba(0, 23, 51, 0.04)"
  card-hover: "0 4px 16px rgba(0, 23, 51, 0.08)"
  floating: "0 8px 24px rgba(0, 23, 51, 0.12)"

components:
  top-nav:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    height: 56px
  bottom-tab-bar:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.muted}"
    activeTextColor: "{colors.ink}"
    typography: "{typography.caption-strong}"
    height: 56px
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: 20px
    shadow: "{shadows.card}"
  card-flat:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: 20px
    border: "1px solid {colors.hairline}"
  summary-hero-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xxl}"
    padding: 24px
    shadow: "{shadows.card}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 15px 20px
    height: 52px
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-disabled:
    backgroundColor: "{colors.primary-disabled}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.primary-surface}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 15px 20px
    height: 52px
  button-weak:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.body}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 15px 20px
    height: 52px
  button-text:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.button}"
  list-row:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    padding: 16px 20px
    minHeight: 60px
  holding-row-name:
    textColor: "{colors.ink}"
    typography: "{typography.title-sm}"
  holding-row-sub:
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
  amount-cell:
    textColor: "{colors.ink}"
    typography: "{typography.number-md}"
  return-up-cell:
    backgroundColor: transparent
    textColor: "{colors.semantic-up}"
    typography: "{typography.number-md}"
  return-down-cell:
    backgroundColor: transparent
    textColor: "{colors.semantic-down}"
    typography: "{typography.number-md}"
  return-badge-up:
    backgroundColor: "{colors.semantic-up-surface}"
    textColor: "{colors.semantic-up}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.sm}"
    padding: 3px 8px
  return-badge-down:
    backgroundColor: "{colors.semantic-down-surface}"
    textColor: "{colors.semantic-down}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.sm}"
    padding: 3px 8px
  text-input:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 56px
    border: "1px solid {colors.hairline}"
  text-input-focus:
    backgroundColor: "{colors.surface-card}"
    border: "1.5px solid {colors.primary}"
  number-pad:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    fontSize: 22px
    fontWeight: 600
    cellHeight: 56px
    rounded: "{rounded.lg}"
    activeBackgroundColor: "{colors.surface-soft}"
  pin-dots:
    size: 12px
    gap: 12px
    filledColor: "{colors.primary}"
    emptyColor: "{colors.surface-strong}"
  chip:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.body}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.pill}"
    padding: 6px 14px
  chip-selected:
    backgroundColor: "{colors.primary-surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: 6px 14px
  source-badge:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.body-soft}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  dialog:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xxl}"
    padding: 24px
    shadow: "{shadows.floating}"
  banner-warning:
    backgroundColor: "#FFF7E6"
    textColor: "#9A6700"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 14px 16px
  donut-chart:
    trackColor: "{colors.hairline}"
    palette: ["#A87342", "#F04452", "#15803D", "#FF9800", "#8B5CF6", "#6B7684"]
---

## Overview

dotori는 토스(Toss)의 디자인 언어를 따른다 — 차분하고, 신뢰감 있고, **숫자가 주인공**인 한국형 핀테크 미감. 바탕은 부드러운 연크림 floor(`{colors.canvas}` — #FCFBF8)이고 그 위에 **둥근 흰색 카드**(`{component.card}`)가 떠 있다. 브랜드 색은 **갈색(도토리색)**(`{colors.primary}` — #A87342) 하나로, 주요 CTA·활성 상태·핵심 강조에만 아껴 쓴다.

타이포는 **Pretendard**(토스 Product Sans의 오픈 대체 폰트)로 통일하고, **큰 굵은 숫자**가 화면을 지배한다. 본문은 weight 400으로 차분하게 유지하고, 금액·수익률만 weight 700으로 키운다.

**한국 증시 색 관례를 따른다 (서구와 반대):**
- **상승 / 수익 = 빨강** (`{colors.semantic-up}` — #F04452)
- **하락 / 손실 = 파랑** (`{colors.semantic-down}` — #3182F6)

깊이감은 카드-온-그레이 레이어링과 **부드러운 그림자**(`{shadows.card}`)에서 나온다. 두꺼운 테두리·장식적 그림자는 쓰지 않는다.

**핵심 특징**
- 단일 브랜드 색: `{colors.primary}`를 CTA·활성 상태·강조에만 아껴 사용
- 연크림 캔버스 + 흰색 카드 + 부드러운 그림자의 토스 시그니처 레이어링
- 숫자 우선: 자산·수익률은 `{typography.number-hero}` / `{typography.number-lg}`로 크고 굵게, tabular-nums
- 넉넉한 radius: 카드 `{rounded.xl}`(20px)~`{rounded.xxl}`(28px), 버튼 `{rounded.md}`(12px)
- 증시 색: 상승=빨강 / 하락=파랑, 텍스트 색 + 연한 surface 배지로만 표현
- 해요체·능동형·긍정형 UX 라이팅 (아래 UX Writing 섹션)

## Colors

### Brand & Accent
- **Acorn Brown** (`{colors.primary}` — #A87342): 단일 브랜드 색. 주요 CTA, 활성 상태, 선택 칩, 핵심 링크.
- **Brown Active / Pressed** (`{colors.primary-active}` #8E5E34 / `{colors.primary-pressed}` #774C28): hover·press 상태.
- **Brown Surface** (`{colors.primary-surface}` — #F3E9DD): 보조 버튼·선택 칩의 연한 갈색 배경.
- **Brown Disabled** (`{colors.primary-disabled}` — #E4D3BF): 비활성 CTA.

### Surface
- **Canvas** (`{colors.canvas}` — #FCFBF8): 기본 페이지 바닥(연크림).
- **Surface Card** (`{colors.surface-card}` — #FFFFFF): 카드·리스트·내비 등 콘텐츠 표면.
- **Surface Soft** (`{colors.surface-soft}` — #FAF7F1): 입력 필드 기본 배경.
- **Surface Strong** (`{colors.surface-strong}` — #EDE7DD): 약한 버튼·칩 배경.

### Text (따뜻한 그레이스케일)
- **Ink** (`{colors.ink}` — #2B2B2B): 제목·금액·강조 본문.
- **Body** (`{colors.body}` — #4B4742): 기본 본문.
- **Body Soft** (`{colors.body-soft}` — #6F6A63): 보조 본문.
- **Muted** (`{colors.muted}` — #8C8C8C): 캡션·서브텍스트·플레이스홀더.
- **Muted Soft** (`{colors.muted-soft}` — #B5AEA4): 비활성 텍스트.
- **Hairline** (`{colors.hairline}` — #F1ECE4): 1px 구분선.

### 증시 시맨틱 (한국 관례)
- **Up / 수익** (`{colors.semantic-up}` — #F04452): 상승·플러스 수익률. 텍스트 색 + `{colors.semantic-up-surface}`(#FDECEE) 배지.
- **Down / 손실** (`{colors.semantic-down}` — #3182F6): 하락·마이너스 수익률. 텍스트 색 + `{colors.semantic-down-surface}`(#E8F3FF) 배지.
- **Flat** (`{colors.semantic-flat}` — #8C8C8C): 보합(0%).

## Typography

### Font Family
시스템 전체가 **Pretendard** 단일 폰트로 동작한다. Fallback: `-apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', Roboto, sans-serif`. 별도 영문/숫자 전용 폰트를 쓰지 않고, 숫자는 Pretendard + `font-variant-numeric: tabular-nums`로 정렬을 맞춘다.

### Hierarchy

| Token | Size | Weight | Use |
|---|---|---|---|
| `{typography.display-lg}` | 40px | 700 | 온보딩·큰 타이틀 |
| `{typography.display-md}` | 32px | 700 | 페이지 헤드 |
| `{typography.title-lg}` | 24px | 700 | 섹션 제목 |
| `{typography.title-md}` | 19px | 700 | 카드 제목 |
| `{typography.title-sm}` | 17px | 600 | 리스트 항목명(종목명) |
| `{typography.body-lg}` | 17px | 400 | 기본 본문·입력값 |
| `{typography.body-md}` | 15px | 400 | 보조 본문 |
| `{typography.body-strong}` | 15px | 600 | 강조 본문 |
| `{typography.caption}` | 13px | 400 | 캡션·서브텍스트 |
| `{typography.caption-strong}` | 12px | 600 | 배지·라벨 |
| `{typography.number-hero}` | 36px | 700 | 총자산·총평가금 (tabular-nums) |
| `{typography.number-lg}` | 22px | 700 | 카드 단위 금액 (tabular-nums) |
| `{typography.number-md}` | 15px | 600 | 표 안 금액·수익률 (tabular-nums) |
| `{typography.button}` | 17px | 600 | CTA 버튼 |
| `{typography.nav-link}` | 15px | 600 | 내비·탭 |

### Principles
- **숫자가 주인공.** 자산·수익률은 항상 가장 크고 굵게. 모든 숫자는 tabular-nums로 자릿수 정렬.
- **본문은 차분하게.** 제목/숫자만 700, 본문은 400 — 위계를 무게로 만든다.
- **음수 letter-spacing.** 한글 가독성을 위해 제목·숫자에 -0.2~-0.5px 적용.

### Note on Font Substitutes
토스 Product Sans는 라이선스 폰트라 사용 불가. **Pretendard**(SIL OFL, 한글+라틴 지원)를 표준 대체로 사용한다. 영문 전용이 필요하면 **Inter**로 폴백.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4 · `{spacing.xs}` 8 · `{spacing.sm}` 12 · `{spacing.base}` 16 · `{spacing.md}` 20 · `{spacing.lg}` 24 · `{spacing.xl}` 32 · `{spacing.xxl}` 48 · `{spacing.section}` 64.
- **카드 내부 패딩:** `{spacing.md}`(20px) 기본, 요약 히어로 카드는 `{spacing.lg}`(24px).
- **카드 간 간격:** `{spacing.sm}`~`{spacing.base}` (12~16px).

### Grid & Container
- **모바일 우선.** 단일 컬럼, 좌우 패딩 `{spacing.base}`(16px). 콘텐츠 최대폭 ~480px(모바일) / 카드 그리드는 데스크톱에서 최대 ~960px 센터.
- **PWA 세이프에어리어** 고려 — 하단 탭바 위 콘텐츠는 safe-area-inset 패딩.

### Elevation
- 카드는 테두리 대신 `{shadows.card}`로 띄운다. hover 시 `{shadows.card-hover}`, 모달·플로팅은 `{shadows.floating}`.

### Motion
- **하단 바 순차 전환(`{motion.nested-bar-slide}`)**: 메인 탭 바와 플로팅 중첩 바(자산·계획·가계부)는 진입/이탈 시 **순차로** 교대한다(동시 교차 아님). 진입: 메인 바가 지연 없이 내려가고(`translate-y-full opacity-0`, 140ms ease-in) → ← 버튼만 담긴 56px 원이 떠오르고(160ms, 지연 60ms) → pill이 **왼쪽에서 오른쪽으로 펼쳐진다**(260ms, 지연 120ms, `cubic-bezier(0.22,1,0.36,1)`). 이탈은 역순: pill이 오→왼으로 원까지 접히고(160ms, 지연 0, `cubic-bezier(0.4,0,1,1)`) → 원이 내려가고(120ms, 지연 110ms) → 메인 바가 올라온다(200ms, 지연 150ms). 전체 0.4초 안쪽으로 빠릿하게 유지한다. 펼침은 배경 레이어 `width`(둥근 모서리·`{shadows.floating}` 유지) + 내용물 `clip-path`를 같은 타이밍으로 맞춘다. 세로 이동은 `transition-[translate,opacity]`로 건다(Tailwind v4의 `translate-y-*`는 `transform`이 아닌 `translate` 속성을 쓰므로 `transition-[transform,…]`로는 이동이 애니메이션되지 않는다). ← 복귀는 누르는 즉시 접기 시작하고 140ms 뒤 이동한다 — `width`·`clip-path`는 메인 스레드 애니메이션이라 경로 변경과 동시에 시작하면 새 화면 렌더에 프레임을 빼앗겨 접힘이 보이지 않는다. 숨김/노출 상태마다 duration·delay 클래스를 달리 붙여 방향별 타이밍을 만들고, `motion-reduce:transition-none`으로 모션 감소 설정을 존중한다. 신규 애니메이션 의존성 없이 CSS transition만 쓴다.
- **화면 전환 텐션(`{motion.page-enter}`)**: 탭·서브탭 이동으로 경로가 바뀌면 콘텐츠가 즉시 바뀌되, 살짝 밀려 들어오며 선명해진다. **방향**: 오른쪽 탭으로 가면 왼쪽에서(`translateX(-8px)`), 왼쪽 탭으로 가면 오른쪽에서(`translateX(8px)`) 들어온다 — 메인 탭 순서 우선, 같은 메인 탭이면 서브탭 순서로 판단(`lib/nav/direction`의 `resolveNavDirection`), 같은 위치(하위 화면 진입)·판단 불가 경로는 왼쪽에서. `opacity 0.4 → 제자리 opacity 1`, 220ms, `cubic-bezier(0.22,1,0.36,1)`. `components/nav/AppNav`가 콘텐츠 래퍼에 Web Animations API로 페인트 전(`useLayoutEffect`)에 건다. key 리마운트를 쓰지 않아 페이지 상태가 보존되고, 끝나면 transform이 남지 않아 내부 `fixed` 요소에 영향이 없다. 모션 감소 설정이면 생략한다. 이동량·시간을 키우지 않는다("아주 살짝"이 기준).

## Components (요약)

- **요약 히어로 카드** (`{component.summary-hero-card}`): 총평가금(`{typography.number-hero}`) + 총수익률 배지 + 일간손익. 화면 최상단 시선 집중점.
- **보유 종목 리스트** (`{component.list-row}`, `components/portfolio/HoldingsTable`): **계좌(연동) 라벨별 그룹**으로 나눈다 — 그룹 제목(`h3`, `text-[15px] font-semibold text-body`) 오른쪽에 그룹 평가금(`text-[13px] text-muted`), 그룹·그룹 안 행 모두 평가금 내림차순. 그룹 제목 행 아래에 구분선(`border-b border-hairline pb-2`)을 두고, 그룹 사이는 `gap-6`으로 띄운다(그룹 사이 선은 두지 않는다). 행 왼쪽은 섹터 칩 + 종목명(`{component.holding-row-name}`)만 두고 종목코드·시장·계좌는 표시하지 않는다. 우측은 위에서부터 평가금(`{component.amount-cell}`, USD는 원통화 보조 금액) → `N주 · 현재 가격`(`text-[13px] text-body-soft`, 수량은 소수 첫째 자리까지) → 맨 아래 수익(`{component.return-up-cell}` / `{component.return-down-cell}`).
- **주식 탭 카드 제목 생략**: 섹터 비중 도넛·종목별 비중 막대·보유 종목 카드는 카드 제목(`h2`) 없이 내용만 둔다(이름은 `aria-label`로). 보유 종목 카드는 오른쪽 위 "종목 추가"(+) 아이콘 버튼만 남긴다.
- **종목별 비중 막대** (`components/portfolio/HoldingWeightBars`): 막대 안을 손익으로 나눈다 — 수익 종목은 `[매수금액 primary | 수익 bg-up]`(막대 길이 = 평가금), 손실 종목은 `[평가금 primary | 잃은 금액 bg-down]`(막대 길이 = 매수금액). 막대 길이 기준은 총평가금이되 손실 구간이 100%를 넘지 않도록 max(평가금, 매수금액)을 반영한다. 막대 아래 오른쪽에 종목 손익 금액·수익률(`PnlText`, `text-[13px] font-semibold`).
- **수익률 배지** (`{component.return-badge-up}` / `down`): 연한 surface 배경 + 부호(+/-) + 색.
- **도넛 차트** (`{component.donut-chart}`): 섹터/종목/저축 카테고리 비율. 기본은 palette 순서대로 배정, track은 hairline. 공용 표현형 프리미티브 `components/ui/DonutChart`로 구현하고(도넛+범례+가운데 라벨/값), 카드·헤딩은 소비자(`SectorDonut`/`SavingsDonut`/`NetWorthDonut` 등)가 감싼다. 여러 자산 탭에서 재사용한다.
  - **의미색이 필요할 때**: `DonutSegment.color`로 조각별 색을 직접 지정한다(미지정 시 palette 순번). **순자산 vs 부채**(`NetWorthDonut`)는 순자산 = `{colors.primary}`(#A87342), 부채 = 뉴트럴 #6B7684로 배정한다. 순자산·부채는 손익이 아니므로 손익 색(up=빨강/down=파랑)을 쓰지 않는다.
- **진행률 링** (`components/goal/GoalProgressRing`): 목표 순자산 대비 진행률을 나타내는 단일 호 SVG 링. 지름 168px 기본, stroke 16px. 진행 호는 `{colors.primary}`(`stroke-primary`, `strokeLinecap="round"`), 트랙은 `{colors.hairline}`(`stroke-hairline`). 12시 방향에서 시작하도록 -90도 회전, 진행률은 0~100으로 클램프한다. 가운데에 작은 라벨(`{colors.muted}`)/큰 값(`{colors.ink}`, `{typography.number-lg}` 계열, tabular-nums)을 오버레이한다. 다중 세그먼트+범례가 필요하면 `DonutChart`를 쓴다(이건 단일 호 전용).
- **버튼**: primary(갈색) / secondary(brown-surface) / weak(grey) / text. radius `{rounded.md}`, height 52px.
- **아이콘 버튼**: 부가 동작은 라벨 없는 원형 아이콘 버튼으로 심플하게 둔다. 규격: `h-9~10 w-9~10`, `{rounded.full}`, 아이콘 20~24px 단순 stroke, 평상시 `text-muted`, hover `bg-surface-soft`/`text-body`, active `surface-strong`, disabled opacity 60%. 반드시 `aria-label`을 준다. 예: 보유 종목 "종목 추가"(+), 갱신 바 **새로고침**(회전 화살표 — 진행 중이면 `animate-spin` + `aria-busy`, `aria-label`은 "새로고침"/"새로고침 중…").
- **스위치(Switch)**: on/off 환경설정 토글.
  - 크기: 트랙 48×28, 노브 22, radius `{rounded.full}`.
  - 색: ON `{colors.primary}`(#A87342), OFF `{colors.surface-strong}`(#EDE7DD). 노브는 `{colors.surface-card}`(흰색) + soft shadow.
  - 접근성: `role="switch"` + `aria-checked`, disabled 시 opacity 40%.
  - 용도: 설정 화면의 on/off 환경설정 토글.
- **프라이버시 금액 마스킹(PrivacyAmount)**: "금액 숨기기"가 켜진 동안 금액을 가리는 패턴.
  - 가려진 금액은 `filter: blur(14px)`(`blur-[14px]`) + `select-none` + 포인터 커서로 표시한다(읽기 불가 수준으로 강하게).
  - 탭/클릭하면 선명해진다. **노출은 전역 상태**라 한 곳을 탭하면 화면의 모든 금액이 함께 보인다. 잠금 또는 새로고침 시 다시 마스킹된다(세션 한정, 비영속).
  - 요약 히어로에서는 총평가금과 총수익(수익률 배지 + 총손익)을 각각 마스킹한다. "총수익" 라벨은 노출해 무엇이 가려졌는지 알린다.
  - 접근성: 가려진 상태는 `aria-label`을 가진 button으로 감싼다.
  - 한계: DOM에 실제 값이 그대로 남으므로 "어깨너머 시선 차단" 용도이며 완전한 비밀 보장은 아니다.
- **입력 필드** (`{component.text-input}`): 연한 배경, focus 시 갈색 1.5px 테두리.
- **넘버패드** (`{component.number-pad}`, `components/ui/NumberPad`): 잠금 화면 전용 3×4 고정 배열 키패드(1~9 / 빈칸·0·지우기). 셀은 투명 배경 + `text-ink` 22px 숫자, 높이 56px, radius `{rounded.lg}`, 탭 시 `{colors.surface-soft}` 하이라이트. 지우기 키는 단순 stroke 아이콘(24px) + `aria-label="지우기"`. 배열은 섞지 않는다(근육 기억 우선).
- **PIN 점 인디케이터** (`{component.pin-dots}`, `components/ui/PinDots`): 6자리 PIN 진행 표시. 점 12px 원형, 입력된 자리 `{colors.primary}`, 빈 자리 `{colors.surface-strong}`, 간격 12px. 값은 렌더링하지 않고 개수만 표시하며 `role="status"` + "6자리 중 n자리 입력" aria-label로 알린다. 오류는 점이 아니라 인라인 에러 메시지로 전달한다.
- **다이얼로그** (`{component.dialog}`): radius `{rounded.xxl}`, 왼쪽 버튼은 항상 "닫기"(아래 UX Writing).
- **메인 탭 바** (`{component.main-tab-bar}`): 화면 하단 고정 5탭(홈·자산·계획·가계부·설정). 높이 56px, 배경 `{colors.surface-card}`, 상단 `border-hairline`. 활성 탭은 `text-ink`, 비활성은 `text-muted`. 하단은 `env(safe-area-inset-bottom)` 패딩으로 PWA 세이프에어리어를 확보한다. 활성 탭은 `aria-current="page"`. **자산(`/assets/*`) 진입 시에는 아래로 슬라이드되어 사라지고**(그 자리에 플로팅 중첩 바가 뜬다), 이탈하면 다시 올라온다. z-order `z-40`.
- **자산·계획·가계부 공용 플로팅 중첩 바** (`{component.asset-sub-tab-bar}`, `components/nav/NestedTabBar`): 자산(`/assets/*`)·계획(`/plan/*`)·가계부(`/ledger/*`) 진입 시 메인 바를 **대체하여** 떠오르는 둥근 플로팅 바(pill). 토스 증권의 nested 플로팅 UX와 동일하다. 자산은 ← + 자산 카테고리 서브탭(자산·주식·저축·연금·코인), 계획은 ← + 계획 서브탭(통장 쪼개기·부동산), 가계부는 ← + 가계부 서브탭(월별·분석). 어느 섹션(자산·계획·가계부)에서 뜰지는 `lib/nav/nav-config.tsx`의 `nestedSections` 목록(경로 매칭 → 서브탭·활성 키)으로 정한다. 각 서브탭은 **아이콘(24px, 단순 stroke) + 라벨(`text-[11px]`)을 세로로 쌓아** 표시한다(라벨은 2글자로 통일 — "저축/현금성"은 "저축"으로 축약). 화면 좌우 16px 여백(`px-4`, `max-w-[480px]` 중앙)을 두고, 화면 하단에서 `bottom: calc(env(safe-area-inset-bottom) + 12px)`만큼 띄운다. 높이 56px, `{rounded.pill}`(100px), 배경 `{colors.surface-card}`, **테두리 없이 `{shadows.floating}`로 띄운다**(엣지투엣지 바가 아니라 떠 있는 알약 형태). ←는 좌측 원형 버튼(`{rounded.full}`, 탭 시 `surface-soft`). z-order는 메인 바 위(`z-50`)라 교차 슬라이드 시 위에 뜬다. 등장/사라짐 모션은 `{motion.nested-bar-slide}`. 활성 서브탭은 `font-bold text-ink`/`aria-current="page"`, 비활성은 `font-semibold text-muted`. ← 또는 카테고리 이탈로만 빠져나오며, 자산 안에서는 다른 메인 탭으로 직접 이동하지 않는다(메인 바가 숨겨져 있으므로). **하단 페이드**: 떠 있는 pill 뒤로 스크롤 컨텐츠가 비치므로, pill 바로 아래(z-40, pill은 z-50)에 화면 하단 고정 그라데이션(`bg-gradient-to-t from-canvas via-canvas/85 to-transparent`)을 깔아 아래쪽 컨텐츠를 캔버스 색으로 위로 갈수록 자연스럽게 가린다. 높이는 **pill 상단까지만** 덮도록 safe-area를 반영해 `calc(env(safe-area-inset-bottom) + 72px)`로 둔다(pill 띄움 12px + 높이 56px 기준, 기기별 하단 인셋 자동 반영). `pointer-events-none`·`aria-hidden`이며 pill과 함께 `visible`에 맞춰 opacity로 페이드한다.
- **연동 출처 배지** (`{component.source-badge}`): 외부 연동(업비트 등)에서 자동으로 가져온 행(`source === "AUTO"`)임을 알리는 중립 pill 배지. 항목명 옆에 연동명(예: "업비트")을 `{colors.surface-strong}` 배경 + `{colors.body-soft}` 텍스트로 표시한다. 브랜드색·증시색을 쓰지 않아 눈에 튀지 않게 정보만 전달한다. **AUTO 행은 다음 새로고침에 덮어써지므로 편집·삭제를 잠근다** — 편집 모드에서 인라인 입력과 X 삭제 버튼을 숨기고(현재 값을 `text-muted`로 읽기 전용 표기) 잠금 사유를 한 줄로 안내한다(예: "업비트에서 자동으로 가져와요"). 보기 모드 행 탭도 비활성(편집 다이얼로그를 열지 않음)한다.
- **더미 페이지** (`{component.dummy-page}`): 아직 구현되지 않은 화면. 제목 `text-[22px] font-bold text-ink` + 보조문구 `text-muted`를 중앙 정렬로 표시한다.
- **저축/현금성 화면**: 손익 개념이 없으므로 금액은 모두 `text-ink`로만 표기하고 증시 색(up/down)을 쓰지 않는다. 카테고리(예적금·입출금·채권·기타) 요약 카드는 `bg-primary-surface` 타일에 `text-primary` 단순 stroke 아이콘(`SavingsCategoryIcon`, 24px)을 얹는다. 관리 화면은 카테고리 필터 칩 + 접이식 섹션 + 행으로 구성하며, **편집 모드**에선 금액을 인라인 입력(`bg-surface-soft`, radius 10px, 우측 정렬 `tabular-nums`)으로 일괄 수정하고 X로 삭제한다(저장 시 일괄 반영). 통화는 모든 카테고리에서 KRW/USD 선택 가능(기본 KRW), USD는 금액 아래 `≈ ₩…` 환산을 `text-muted`로 보조 표기한다.
- **프로필 세그먼트** (`components/envelope/ProfileSegment`): 통장 쪼개기 화면 상단 통합/아내/남편 전환 세그먼트 컨트롤.
  - 배경 트랙: `bg-surface-soft` + `{rounded.pill}`. 활성 세그먼트: `bg-surface-card` + `{rounded.pill}` + `{shadows.card}`. 비활성 텍스트: `text-muted`, 활성: `text-ink font-semibold`.
  - 3개 옵션 고정(통합·아내·남편), 동일 너비로 가득 채운다. 탭 전환 시 `transition-all duration-150`으로 슬라이드.
  - 접근성: `role="tablist"` + 각 버튼에 `role="tab"` + `aria-selected`.
- **태그 색 매핑 규칙** (`lib/envelope/tag-color.ts`): 통장 쪼개기 태그에 팔레트 색을 배정하는 규칙.
  - 프리셋 태그(고정 목록)는 `{component.donut-chart}` palette와 동일한 순서로 고정 색을 배정한다(`["#A87342", "#F04452", "#15803D", "#FF9800", "#8B5CF6", "#6B7684"]`).
  - 사용자 추가 커스텀 태그는 동일 palette를 인덱스 해시(`name.length % palette.length` 등)로 순환 배정한다.
  - 새 palette 색을 추가하거나 순서를 바꾸면 이 문서와 `tag-color.ts`를 함께 수정한다.
- **통장 쪼개기 도넛 위치**: 태그별 `DonutChart`는 **통합 뷰에만** 표시한다(중앙에 combined 총액). 아내/남편 프로필 뷰에는 도넛 없음.
- **EnvelopeItemRow 편집 변형**: 일괄 편집 모드(저축 탭 `SavingsManageList` 패턴 동일) 진입 시 행이 편집 변형으로 전환된다.
  - 금액: `TextInput`(numeric) 인라인 표시(`bg-surface-soft`, radius 10px, 우측 정렬, `tabular-nums`).
  - 우측: X 삭제 버튼(`{colors.semantic-down}` 또는 `text-muted`, `aria-label="삭제"`).
  - 편집 확정: "저장하기" 버튼 탭 → `bulkUpdateEnvelope`로 일괄 반영.
  - 항목명·태그·통장은 편집 모드에서 읽기 전용(변경은 개별 Dialog에서).
- **스냅샷 추이 콤보 차트** (`{component.snapshot-trend-chart}`, `components/snapshot/SnapshotTrendChart`): 자산 탭 스냅샷 섹션에서 최신 20건을 보여주는 SVG 콤보 차트. 축 라벨 없는 **상대 스케일**(구간 내 min~max로 정규화)이며 절대 수치는 옆의 목록·상세에서 확인한다.
  - **두 밴드 구성**: 하나의 `viewBox` 안에서 상단 밴드(순자산 선)와 하단 밴드(변화량 막대)가 겹치지 않게 x좌표만 공유한다.
  - **상단 밴드 — 순자산 선**: `stroke = {colors.primary}`(#A87342), 두께 2px, 각 지점에 반지름 3px 포인트 마커(같은 색 채움). 전 구간 값이 동일하면 밴드 세로 중앙 수평선으로 표시한다.
  - **하단 밴드 — 변화량 막대**: 직전 스냅샷 대비 순자산 변화량을 0 기준선(hairline)에서 위/아래로 뻗는 막대로 그린다. 증가는 `{colors.semantic-up}`(#F04452, 빨강), 감소는 `{colors.semantic-down}`(#3182F6, 파랑) — 손익 색 시맨틱과 동일 규칙. 변화량이 없거나(구간 첫 기록) 0이면 막대를 그리지 않는다. 막대 높이는 구간 내 변화량 절대값 최대치 기준 독립 스케일(선 스케일과 무관).
  - **표시 개수**: 기록이 2건 미만이면 차트를 렌더하지 않는다(추이를 보여줄 수 없음). 순수 데이터 가공은 `lib/snapshot/trend.ts`의 `buildTrendData`.
- **밑줄형 금액 입력칸** (`{component.underline-amount-input}`, `components/ledger/UnderlineAmountInput`): 가계부 편집 모드에서 카테고리 잎마다 쓰는 입력칸. 테두리 상자 없이 **아랫줄만** 둔다 — `border-0 border-b-[1.5px] border-surface-strong`, 포커스 시 `focus:border-primary`(`transition-colors duration-150`). 높이 `h-11`(44px, 터치 영역)·너비 `w-[128px]`·`rounded-none`·배경 투명·우측 정렬·`text-[15px] font-semibold tabular-nums text-ink`. `inputMode="numeric"`, `aria-label`은 칩 라벨과 같은 겹치지 않는 카테고리 이름(예: "기타(지출)"). **포커스 중에는 쉼표 없이 숫자만**(iOS에서 caret이 튀지 않게) 보여 주고, blur 때 천 단위 쉼표로 포맷한다. 값 0은 빈칸(placeholder 없음). 행 전체를 `<label>`로 감싸 카테고리 이름을 눌러도 입력칸에 포커스되게 한다.
- **가계부 차트** (`{component.ledger-chart}`, `components/ledger/{LedgerFlowChart,LedgerCategoryChart,MonthChartFrame,ChartDetail,SeriesLine}`, `lib/ledger/chart-geometry.ts`): 기존 `SnapshotTrendChart`처럼 라이브러리 없이 SVG를 직접 그린다. viewBox `0 0 320 180`(반응형은 `width="100%"`), 좌우 여백 `PAD_X=16`, 그림 영역 위 끝 `PLOT_TOP=16`·바닥(0 기준선) `PLOT_BOTTOM=150`, 월 라벨 기준선 `LABEL_Y=170`.
  - **색**: 수입 = `{colors.primary}`(#A87342), 저축 = `{colors.semantic-success}`(#15803D), 지출 = `{colors.semantic-warning}`(#FF9800). **손익이 아니므로 증시 색(up=빨강/down=파랑)을 쓰지 않는다** — 남은 돈(수입 − 지출 − 저축)이 음수여도 `text-ink`로 중립 표기. 계열 순서는 범례·상세 줄 모두 **수입·지출·저축**.
  - **수입·지출·저축 차트**: 달마다 수입(왼쪽)·저축(오른쪽) 막대를 슬롯 중심 양옆에 `BAR_GAP=1px` 띄워 나란히 그리고, 지출은 점이 있는 선(`strokeWidth 2`)으로 겹친다. 막대 폭 = `min(BAR_MAX=10, 슬롯 폭 × BAR_RATIO=0.3)`, 0원 막대는 그리지 않는다. 세 계열이 같은 0 기준 세로 스케일(`makeYScale` — NaN·Infinity 제외, 값은 [0, 최댓값]으로 클램프, 모두 0이면 바닥선)을 공유한다. 축 눈금은 두지 않는다(값은 상세 줄로 본다). 점 반지름은 `min(3, 슬롯 폭 × 0.25)`. 아래에 범례(막대는 `h-2.5 w-2.5 rounded-[2px]`, 선은 `h-0.5 w-3 rounded-full`).
  - **기록 없는 달**: 행이 없거나 금액이 하나도 없는 달(메모만 있는 달 포함)은 시계열에서 `null`이다 — 0으로 그리지 않는다(양 끝이 바닥으로 꺼지는 착시 방지). 막대는 그리지 않고, 선은 그 달에서 끊어 구간마다 따로 그린다(`lineSegments`). 따로 떨어진 한 달은 점만 찍는다. 기록한 달에 어떤 카테고리가 0이면 그건 0으로 그린다.
  - **카테고리별 선 차트**: 고른 노드마다 슬롯 색 선 하나(최대 4개), 같은 0 기준 스케일 공유. 그림 아래에 고른 노드의 범례(슬롯 색 `h-0.5 w-3` 선 + `chipLabel`)를 둬 어떤 선인지 보이게 한다.
  - **카테고리 선 슬롯 팔레트**: 도넛 팔레트 앞 4색을 슬롯 0~3에 **고정 배정**한다 — `["#A87342", "#F04452", "#15803D", "#FF9800"]`(`SLOT_COLORS`). 칩을 빼도 남은 선의 색은 바뀌지 않는다.
  - **월 축 라벨**(`axisLabels`): 최대 6개, `step = ceil(n / 6)`으로 건너뛰되 끝 달 기준으로 맞춰 마지막 달은 항상 표시한다. 라벨은 평소 "10월", 축이 해를 넘으면 첫 라벨과 직전 라벨에서 해가 바뀐 라벨에 연도를 붙여 `'25.10`처럼 쓴다(1월이 라벨에서 빠져도 해가 바뀐 것이 보이게). `fontSize 13`(viewBox 단위, `LABEL_FONT_SIZE` — 카드 안 288px 폭에서 약 12px), `{colors.muted}`.
  - **고른 달 상세 줄(ChartDetail)**: 떠 있는 말풍선 대신, 카드 제목(카테고리 차트는 칩 줄)과 그림 사이에 **늘 자리를 잡아 두는 고정 줄**을 둔다 — 고른 칩 수가 바뀌어도 높이가 흔들리지 않게 줄 수를 미리 잡는다(수입·지출·저축 3열 1줄, 카테고리 2열 2줄, 한 칸 40px·줄 간격 8px). 위에 월 제목(`text-[13px] font-semibold text-muted`), 아래 격자 칸마다 라벨(색 점 + `text-[12px] font-semibold text-body-soft`) 위에 금액(`text-[14px] font-semibold tabular-nums text-ink`)을 쌓고, 라벨·금액 모두 `whitespace-nowrap`(360px 폭에서 한 글자씩 줄바꿈되지 않게). 금액은 `PrivacyAmount`로 감싸 **금액 숨기기가 켜져 있으면 가려진다**(차트 모양·막대·선 자체는 그대로). 그 달 기록이 없으면 "기록 없음"(`text-muted`). `role="status"` + `aria-live="polite"`이고, 고른 달 버튼의 `aria-describedby`가 이 줄을 가리킨다.
  - **선택**: 늘 한 달이 골라져 있다. 기본은 축 안에서 **기록이 있는 가장 최근 달**(없으면 마지막 달, `latestRecordedIndex`)이고, 같은 달을 다시 누르거나 바깥을 눌러도 선택은 유지된다(닫기 없음). 고른 달은 슬롯 폭 `{colors.hairline}` 하이라이트 배경. 기간을 바꿔 고른 달이 축 밖으로 나가면 기본 달로 돌아간다.
  - **문지르기**: 그림 전체를 덮는 투명 오버레이 하나(`touch-action: pan-y`)가 포인터를 받아, 이벤트 시점의 `getBoundingClientRect`로 clientX → viewBox x → 달(`indexAtX`)을 찾는다(달이 많아 슬롯이 몇 px이어도 고를 수 있다). 마우스·펜은 누르는 즉시 고르고 누른 채 움직이면 따라간다. **터치는 누르는 순간 고르지 않는다** — 거의 움직이지 않고(가로·세로 6px 이하) 떼면 탭으로 그 달을 고르고, 가로로 6px 넘게 그리고 세로보다 크게 움직였을 때만(`isHorizontalDrag`) 문지르기를 시작한다. 세로 스크롤 등으로 `pointercancel`되면 이전 선택으로 되돌린다.
  - **달 버튼(키보드·보조기기)**: 달마다 슬롯 폭 × 그림 높이의 `<button>`(`aria-label` "2026년 10월", `aria-pressed`)을 둔다. 포인터는 오버레이가 받으므로 `pointer-events-none`이고 포커스 링 위치용이다. 탭 순서에는 한 달만 두고(roving tabindex, 자체 상태 — 첫 달로 되돌아가지 않음) ←/→로 한 달씩, Home/End로 처음·끝 달로 옮긴다(포커스와 선택이 함께 이동). 차트 전체 요약은 금액 없이 `role="img"` + `aria-label`(예: "수입·지출·저축 차트, 2026년 5월부터 2026년 10월까지")로 SVG 바깥에 둔다.
- **카테고리 칩** (`{component.category-chips}`, `components/ledger/CategoryChips`): 가계부 분석 화면에서 카테고리 트리 전 단계(수입·지출·고정지출·식비·배달 …)를 트리 순서로 보여주는 가로 스크롤 칩 목록(`overflow-x-auto`, 스크롤바 숨김). 최소 1개는 선택 상태로 남고(마지막 칩은 해제되지 않음), 4개가 선택된 상태에서 새 칩을 고르면 가장 먼저 고른 것이 빠진다(`stores/ledger-store.ts`의 `toggleSelection`). 고른 칩에는 그 슬롯의 선 색 점(`h-2 w-2 rounded-full`)을 라벨 앞에 붙인다 — 칩을 빼도 남은 칩의 색은 바뀌지 않는다(슬롯 고정 배정). 라벨은 `chipLabel`로 만들고 같은 이름이 겹치면 소속을 붙인다("기타(지출)"·"기타(저축)"). 처음 그릴 때 고른 칩 중 맨 앞 칩이 보이도록 칩 줄을 스크롤한다(`scrollIntoView({ inline: "nearest", block: "nearest" })` — 기본 "식비"가 첫 화면 밖이라). 이후 선택이 바뀔 때는 스크롤하지 않는다(방금 누른 칩은 이미 보이고, 다른 칩으로 튀면 누르던 자리를 잃는다).

## UX Writing (토스 라이팅 규칙)

모든 화면 문구는 토스 UX writing 원칙을 따른다.

- **해요체 통일** — 모든 문구는 해요체. 과도한 경어(`~시겠어요?`, `~께`)는 쓰지 않는다.
- **능동형 우선** — "조회됐어요" → "조회했어요". 과거 연결어 `~었`을 최소화한다.
- **긍정형** — "안 돼요" 대신 "~하면 할 수 있어요". 부정형은 정책상 불가 등 꼭 필요할 때만.
- **에러 메시지** — 문제 + 해결 방법을 긍정형으로. 예) "토스 연동에 실패했어요. 설정에서 API 키를 다시 확인해 주세요."
- **다이얼로그 버튼** — 왼쪽(보조) 버튼은 "취소"가 아니라 **"닫기"**로 통일.
- **표기** — `되어요`→`돼요`. `{명사}+{명사}` 나열 구조를 피한다.
- **용어** — 숫자 잠금은 **"PIN"**, 기존 문자 잠금은 **"비밀번호"**로 쓴다. "패스프레이즈"는 UI에 노출하지 않는다(코드 식별자는 무관).
- **금액/숫자** — 천 단위 콤마, 통화 기호 명시(`₩`, `$`). 수익률은 `+`/`-` 부호와 색(상승=빨강/하락=파랑)으로 강조.

### 예시 카피
- 빈 상태: "아직 보유 종목이 없어요. 토스를 연동하거나 직접 추가해 보세요."
- 갱신 완료: "방금 새로고침했어요."
- 갱신 실패 배너: "동기화에 실패한 항목이 2개 있어요. 마지막 갱신 10:32 · 다시 시도하면 불러올 수 있어요." (아래에 실패 항목별 `이름 · 사유` 나열)
- 저장 버튼: "저장하기" / 추가 버튼: "종목 추가하기"
- Face ID 등록 제안: "다음부터 Face ID로 열까요?" / 버튼 "Face ID 켜기" · "괜찮아요"
- Face ID 잠금 해제 버튼(텍스트형): "Face ID로 열기"
- 설정 즉시 잠금 버튼: "지금 잠그기"
- Face ID 오류: "Face ID로 열지 못했어요. PIN을 입력해 주세요." / "Face ID를 다시 켜 주세요. 지금은 PIN으로 열어 주세요."
- 삭제 확인 다이얼로그: 제목 "이 종목을 삭제할까요?" · 왼쪽 "닫기" · 오른쪽 "삭제하기"
- 가계부 편집 툴바: 평소 "편집" → 편집 중 "취소"·"저장하기"
- 가계부 지난달 가져오기 버튼: "지난달에서 가져오기"
- 가계부 회고 placeholder: "이번 달은 어땠나요?"
- 가계부 회고 저장 안내(2초 노출): "저장했어요"
- 가계부 분석 데이터 부족 안내: "두 달 이상 기록하면 흐름을 볼 수 있어요"
- 가계부 분석 기록 없는 달 상세: "기록 없음"
- 가계부 분석 불러오기 실패: "가계부를 불러오지 못했어요. 다시 열어 주세요."
- 가계부 저장 실패 안내: "저장하지 못했어요. 다시 시도해 주세요."
