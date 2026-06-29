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
- **Surface Soft** (`{colors.surface-soft}` — #F9FAFB): 입력 필드 기본 배경.
- **Surface Strong** (`{colors.surface-strong}` — #E5E8EB): 약한 버튼·칩 배경.

### Text (그레이스케일)
- **Ink** (`{colors.ink}` — #191F28): 제목·금액·강조 본문.
- **Body** (`{colors.body}` — #4E5968): 기본 본문.
- **Body Soft** (`{colors.body-soft}` — #6B7684): 보조 본문.
- **Muted** (`{colors.muted}` — #8B95A1): 캡션·서브텍스트·플레이스홀더.
- **Muted Soft** (`{colors.muted-soft}` — #B0B8C1): 비활성 텍스트.
- **Hairline** (`{colors.hairline}` — #E5E8EB): 1px 구분선.

### 증시 시맨틱 (한국 관례)
- **Up / 수익** (`{colors.semantic-up}` — #F04452): 상승·플러스 수익률. 텍스트 색 + `{colors.semantic-up-surface}`(#FDECEE) 배지.
- **Down / 손실** (`{colors.semantic-down}` — #3182F6): 하락·마이너스 수익률. 텍스트 색 + `{colors.semantic-down-surface}`(#E8F3FF) 배지.
- **Flat** (`{colors.semantic-flat}` — #8B95A1): 보합(0%).

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

## Components (요약)

- **요약 히어로 카드** (`{component.summary-hero-card}`): 총평가금(`{typography.number-hero}`) + 총수익률 배지 + 일간손익. 화면 최상단 시선 집중점.
- **보유 종목 리스트** (`{component.list-row}`): 종목명(`{component.holding-row-name}`) + 시장·증권사 서브(`{component.holding-row-sub}`), 우측에 평가금(`{component.amount-cell}`) + 수익률(`{component.return-up-cell}` / `{component.return-down-cell}`).
- **수익률 배지** (`{component.return-badge-up}` / `down`): 연한 surface 배경 + 부호(+/-) + 색.
- **도넛 차트** (`{component.donut-chart}`): 섹터/종목 비율. palette 순서대로 배정, track은 hairline.
- **버튼**: primary(갈색) / secondary(brown-surface) / weak(grey) / text. radius `{rounded.md}`, height 52px.
- **스위치(Switch)**: on/off 환경설정 토글.
  - 크기: 트랙 48×28, 노브 22, radius `{rounded.full}`.
  - 색: ON `{colors.primary}`(#A87342), OFF `{colors.surface-strong}`(#EDE7DD). 노브는 `{colors.surface-card}`(흰색) + soft shadow.
  - 접근성: `role="switch"` + `aria-checked`, disabled 시 opacity 40%.
  - 용도: 설정 화면의 on/off 환경설정 토글.
- **프라이버시 금액 마스킹(PrivacyAmount)**: "금액 숨기기"가 켜진 동안 금액을 가리는 패턴.
  - 가려진 금액은 `filter: blur(7px)`(`blur-[7px]`) + `select-none` + 포인터 커서로 표시한다.
  - 탭/클릭하면 선명해진다. 노출 상태는 비영속이라 화면 재진입(리마운트) 시 다시 마스킹된다.
  - 접근성: 가려진 상태는 `aria-label`을 가진 button으로 감싼다.
  - 한계: DOM에 실제 값이 그대로 남으므로 "어깨너머 시선 차단" 용도이며 완전한 비밀 보장은 아니다.
- **입력 필드** (`{component.text-input}`): 연한 배경, focus 시 갈색 1.5px 테두리.
- **다이얼로그** (`{component.dialog}`): radius `{rounded.xxl}`, 왼쪽 버튼은 항상 "닫기"(아래 UX Writing).

## UX Writing (토스 라이팅 규칙)

모든 화면 문구는 토스 UX writing 원칙을 따른다.

- **해요체 통일** — 모든 문구는 해요체. 과도한 경어(`~시겠어요?`, `~께`)는 쓰지 않는다.
- **능동형 우선** — "조회됐어요" → "조회했어요". 과거 연결어 `~었`을 최소화한다.
- **긍정형** — "안 돼요" 대신 "~하면 할 수 있어요". 부정형은 정책상 불가 등 꼭 필요할 때만.
- **에러 메시지** — 문제 + 해결 방법을 긍정형으로. 예) "토스 연동에 실패했어요. 설정에서 API 키를 다시 확인해 주세요."
- **다이얼로그 버튼** — 왼쪽(보조) 버튼은 "취소"가 아니라 **"닫기"**로 통일.
- **표기** — `되어요`→`돼요`. `{명사}+{명사}` 나열 구조를 피한다.
- **용어** — 사용자에게 보이는 잠금 보안 키는 **"비밀번호"**로 쓴다. "패스프레이즈"는 UI에 노출하지 않는다(코드 식별자는 무관).
- **금액/숫자** — 천 단위 콤마, 통화 기호 명시(`₩`, `$`). 수익률은 `+`/`-` 부호와 색(상승=빨강/하락=파랑)으로 강조.

### 예시 카피
- 빈 상태: "아직 보유 종목이 없어요. 토스를 연동하거나 직접 추가해 보세요."
- 갱신 완료: "방금 새로고침했어요."
- 갱신 실패 배너: "토스 동기화에 실패했어요. 마지막 갱신: 10:32 · 다시 시도하기"
- 저장 버튼: "저장하기" / 추가 버튼: "종목 추가하기"
- 삭제 확인 다이얼로그: 제목 "이 종목을 삭제할까요?" · 왼쪽 "닫기" · 오른쪽 "삭제하기"
