/**
 * 가계부 카테고리 트리(코드 상수). 순수 모듈 — DB·Date 없음.
 * 금액은 잎 노드에만 입력하고, 위 노드는 아래 잎의 합이다.
 * ID는 저장 데이터의 키라 바꾸지 않는다(표시 이름만 바꿀 수 있음). 트리 순서가 곧 화면·칩 순서다.
 */

export type LedgerKind = "income" | "expense" | "saving";

export interface LedgerNode {
  id: string;
  label: string;
  children?: LedgerNode[];
}

export const LEDGER_TREE: LedgerNode[] = [
  {
    id: "income",
    label: "수입",
    children: [
      { id: "income.salary", label: "월급" },
      { id: "income.side", label: "부수입" },
      { id: "income.financial", label: "금융수입" },
    ],
  },
  {
    id: "expense",
    label: "지출",
    children: [
      {
        id: "expense.fixed",
        label: "고정지출",
        children: [
          { id: "expense.fixed.housing", label: "주거비" },
          { id: "expense.fixed.allowance", label: "용돈" },
          { id: "expense.fixed.transport", label: "교통" },
          { id: "expense.fixed.insurance", label: "보험" },
          { id: "expense.fixed.telecom", label: "통신" },
          { id: "expense.fixed.subscription", label: "구독" },
        ],
      },
      {
        id: "expense.variable",
        label: "변동지출",
        children: [
          {
            id: "expense.variable.food",
            label: "식비",
            children: [
              { id: "expense.variable.food.delivery", label: "배달" },
              { id: "expense.variable.food.dining", label: "외식" },
              { id: "expense.variable.food.groceries", label: "식재료" },
            ],
          },
          { id: "expense.variable.social", label: "약속" },
          { id: "expense.variable.beauty", label: "꾸밈비" },
          { id: "expense.variable.selfdev", label: "자기개발" },
          { id: "expense.variable.leisure", label: "여가" },
          { id: "expense.variable.household", label: "생활용품" },
          { id: "expense.variable.gifts", label: "선물/경조" },
          { id: "expense.variable.health", label: "건강" },
          { id: "expense.variable.travel", label: "여행" },
          { id: "expense.variable.etc", label: "기타" },
        ],
      },
    ],
  },
  {
    id: "saving",
    label: "저축",
    children: [
      { id: "saving.invest", label: "투자" },
      { id: "saving.deposit", label: "예적금" },
      { id: "saving.etc", label: "기타" },
    ],
  },
];

/** 지난달에서 가져오기 대상(수입·고정지출·저축). */
export const CARRY_OVER_ROOTS = ["income", "expense.fixed", "saving"] as const;

// 깊이 우선으로 펼친 전체 노드와 각 노드의 최상위(수입·지출·저축) 노드.
const ORDERED: { node: LedgerNode; root: LedgerNode }[] = [];
function walk(node: LedgerNode, root: LedgerNode): void {
  ORDERED.push({ node, root });
  node.children?.forEach((c) => walk(c, root));
}
LEDGER_TREE.forEach((root) => walk(root, root));

const BY_ID = new Map(ORDERED.map((e) => [e.node.id, e]));

/** 금액을 입력하는 잎 ID(트리 순서). */
export const LEAF_IDS: string[] = ORDERED.filter((e) => !e.node.children?.length).map((e) => e.node.id);

const LEAF_SET = new Set(LEAF_IDS);

/** 현재 트리의 잎인지. 과거 버전 데이터의 알 수 없는 ID는 false. */
export function isLeafId(id: string): boolean {
  return LEAF_SET.has(id);
}

export function findNode(id: string): LedgerNode | undefined {
  return BY_ID.get(id)?.node;
}

/** 깊이 우선 전체 노드(칩 목록 순서). */
export function allNodesInOrder(): LedgerNode[] {
  return ORDERED.map((e) => e.node);
}

/** 노드 아래 잎 ID(잎이면 자기 자신). 없는 ID는 빈 배열. */
export function leavesUnder(id: string): string[] {
  const node = findNode(id);
  if (!node) {
    return [];
  }
  if (!node.children?.length) {
    return [node.id];
  }
  return node.children.flatMap((c) => leavesUnder(c.id));
}

// 같은 표시 이름을 가진 노드가 둘 이상인 라벨(예: "기타").
const DUP_LABELS = (() => {
  const counts = new Map<string, number>();
  ORDERED.forEach((e) => counts.set(e.node.label, (counts.get(e.node.label) ?? 0) + 1));
  return new Set([...counts].filter(([, n]) => n > 1).map(([label]) => label));
})();

/** 필터 칩 라벨. 이름이 겹치면 소속을 붙인다("기타(지출)"·"기타(저축)"). */
export function chipLabel(id: string): string {
  const entry = BY_ID.get(id);
  if (!entry) {
    return id;
  }
  if (!DUP_LABELS.has(entry.node.label)) {
    return entry.node.label;
  }
  return `${entry.node.label}(${entry.root.label})`;
}
