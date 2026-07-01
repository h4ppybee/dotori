# 대출(부채) 관리 + 순자산 — 설계

작성일: 2026-07-01

## 배경 / 문제

dotori는 현재 **주식·저축·연금·코인** 4종 자산만 다루며, `app/assets/page.tsx`에서
`총자산 = 주식 + 저축 + 연금 + 코인`으로 단순 합산한다. 부채/대출 개념이 전혀 없어
(코드 전반에 debt/loan/liability 없음) 순자산 ≈ 총자산 상태다.

사용자는 대출 잔액을 반영해 **순자산("내 진짜 돈")** 을 보고 싶어 한다.

## 목표

- 대출(부채)을 입력·관리하고, `순자산 = 총자산 − 부채총액`을 요약 화면에 노출한다.
- 대출은 **자산이 아닌 부채**로 명확히 구분한다(자산 합산에 섞지 않는다).

## 비목표 (YAGNI)

- **스냅샷 미포함**: 일별 스냅샷(`snapshots`)에는 부채를 넣지 않는다. v1은 순자산을 **실시간 계산**만 한다. 순자산 히스토리 추이 그래프는 향후 별도 요청 시 확장.
- 외화 대출(부채는 KRW 고정), 상환 스케줄/이자 시뮬레이션.
- 별도 대출 서브탭(자산 pill에 탭을 추가하지 않는다).
- API 연동(대출은 항상 수동 입력, AUTO 없음).

## 사용자 결정 사항 (브레인스토밍)

1. **핵심 목적**: 순자산 보기 (대출은 마이너스 항목).
2. **배치**: 자산 요약 페이지(`/assets`) 하단 '부채' 섹션에서 인라인 편집(별도 서브탭/라우트 없음).
3. **저장 필드**: 상세 (금리·월상환·만기 포함).
4. **히어로 표시**: 순자산을 메인(큰 금액)으로. 부채 0원이면 기존과 동일하게 보임.

## 접근법

- **A. 새 `debts` 테이블 + `LoanAccount` 타입 (채택)** — 저축·연금·코인과 동일 패턴으로
  테이블/서비스/쿼리 훅을 미러링. 부채와 자산의 의미가 완전히 다르므로 분리가 깔끔하고
  계산·백업·테스트가 기존 구조를 그대로 따른다.
- B. `savings` 테이블 재사용 + 부채 플래그 — 저축 의미 오염, 합산 로직 예외. 기각.
- C. 설정값 하나(부채 총액 숫자)로만 저장 — 상세 필드 불가. 요구와 불일치. 기각.

## 상세 설계

### 1) 데이터 모델 — `lib/types.ts`

저축 항목(`SavingsAccount`)과 대칭. 통화는 KRW 고정(외화 대출 YAGNI).

```typescript
export type LoanCategory = "MORTGAGE" | "CREDIT" | "JEONSE" | "CAR" | "STUDENT" | "ETC";
// 주택담보 / 신용 / 전세자금 / 자동차 / 학자금 / 기타

export interface LoanAccount {
  id: string;
  category: LoanCategory;
  name: string;            // 대출명 — 예: "주택담보대출"
  lender?: string;         // 금융기관 — 예: "국민은행"
  balance: number;         // 현재 잔액 (KRW, 양수로 저장)
  interestRate?: number;   // 연 금리 (%)
  monthlyPayment?: number; // 월 상환액 (KRW)
  maturityDate?: string;   // 만기 "YYYY-MM-DD"
  note?: string;           // 비고
  sortOrder: number;       // 표시 순서
  updatedAt: number;
}
```

연동(AUTO)이 없으므로 `source`/`connectionId`는 두지 않는다.

### 2) DB — `lib/db/schema.ts`

- 스키마 버전 v5 → **v6** 추가.
- `debts!: Table<LoanAccount, string>;` 선언.
- `this.version(6).stores({ debts: "id, category, sortOrder" });`

### 3) 백업 — `lib/backup/backup.ts`

- `BackupData`에 `debts: LoanAccount[]` 추가.
- `exportAll()`/`importAll()`에 `debts` 처리 추가(없으면 빈 배열로 폴백해 구버전 호환).
- `SCHEMA_VERSION` bump.
- (프로젝트 규칙: 새 Dexie 테이블 추가 시 `lib/backup` 동반 갱신.)

### 4) 순수 계산 — `lib/debt/debt-service.ts`

- `buildDebtVM({ debts }: { debts: LoanAccount[] }) => DebtVM`
- `DebtVM = { items: LoanAccount[]; totalKrw: number }` (정렬 포함, `totalKrw = Σ balance`).
- DB·비동기·`Date` 없이 입력만으로 결과. 만기까지 남은 기간 등 Date 의존 표시는 컴포넌트에서 처리.
- 테스트: `test/debt/debt-service.test.ts` (빈 목록·합산·정렬).

### 5) 쿼리 훅 — `lib/query/use-debt.ts`

`lib/query/use-savings.ts`를 미러링:
- `useDebt()` — `debts` 조회 + `buildDebtVM`.
- add / update / delete 뮤테이션(쿼리 무효화 포함).

### 6) 순자산 집계 — `app/assets/page.tsx`

```
자산총액 = 주식 + 저축 + 연금 + 코인   (기존 그대로)
부채총액 = debtVM.totalKrw
순자산   = 자산총액 − 부채총액
```

### 7) UI — `/assets` 요약 페이지

- **히어로**: 큰 금액 = **순자산**. 바로 아래 보조 라인 `자산 O원 · 부채 O원`.
  부채 0원이면 순자산=자산총액이라 기존 화면과 동일하게 보인다.
- **기존 자산 분해 리스트**(주식/저축/연금/코인)는 유지.
- **하단 '부채' 섹션**: 대출 카드 목록(이름 · 종류 배지 · 기관 · 잔액; 접힌 상세로 금리·월상환·만기).
  `+ 대출 추가` 버튼 → 바텀시트/모달 폼으로 인라인 추가·수정·삭제. 별도 `/manage` 라우트 없음.
- **색 규칙**: 부채 금액은 증시 시맨틱(up=빨강/down=파랑)을 쓰지 않고 **중립/muted 텍스트**.
  UI 착수 전 `DESIGN.md`를 읽고 토큰(색·간격·radius·UX 라이팅) 준수. 기존 `components/ui/` 프리미티브 우선 재사용.

## 영향 파일 요약

| 구분 | 파일 | 작업 |
|---|---|---|
| 타입 | `lib/types.ts` | `LoanCategory` / `LoanAccount` 추가 |
| DB | `lib/db/schema.ts` | v6 + `debts` 스토어 |
| 백업 | `lib/backup/backup.ts` | `debts` 포함, `SCHEMA_VERSION` bump |
| 계산 | `lib/debt/debt-service.ts` | `buildDebtVM` (순수) |
| 쿼리 | `lib/query/use-debt.ts` | 조회 + CRUD 뮤테이션 |
| 집계 | `app/assets/page.tsx` | 순자산 계산·히어로 |
| UI | `components/` (부채 섹션·폼 컴포넌트) | 목록·인라인 편집 |
| 테스트 | `test/debt/debt-service.test.ts` 등 | 순수 계산·백업 커버리지 |

## 검증

- `npm run typecheck && npm run lint && npm test` 통과.
- 부채 0원 시 기존 총자산 화면과 동일하게 렌더.
- 백업 내보내기/가져오기에 `debts` 왕복 보존.
