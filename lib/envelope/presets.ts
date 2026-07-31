export const TAG_PRESETS = ["고정지출", "저축", "투자", "생활비", "비상금"] as const;
export const ACCOUNT_PRESETS = ["신한", "토스", "케이뱅크", "하나당근", "국민", "신용카드(현대)", "신용카드(삼성)"] as const;

/** 프리셋 ∪ 커스텀(중복 제거, 프리셋 우선 순서). */
export function mergePresets(presets: readonly string[], custom: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...presets, ...custom]) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
