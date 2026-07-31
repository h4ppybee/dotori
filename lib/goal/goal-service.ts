/** 순자산 목표 상태 */
export type GoalStatus = "active" | "achieved" | "overdue";

/** buildGoalProgress 반환 타입 */
export interface GoalProgress {
  targetKrw: number;
  currentKrw: number;
  /** max(0, target - current) */
  remainingKrw: number;
  /** current / target * 100. target ≤ 0이면 0. 음수·초과는 그대로 — 표시 측에서 클램프 */
  progressPct: number;
  /** 남은 개월(올림, 최소 1). overdue/파싱 불가면 0 */
  monthsRemaining: number;
  /** ceil(remaining / months). months=0이면 remaining 전액 */
  monthlyRequiredKrw: number;
  status: GoalStatus;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

/** "YYYY-MM-DD" 형식만 통과. 형식·범위 위반이면 null. */
function parseYmd(iso: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) {
    return null;
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  return { y, m, d };
}

/**
 * 순자산 목표 진척 계산. DB·Date·비동기 없이 입력만으로 결과를 낸다.
 * `todayIso`는 호출측(컴포넌트)이 로컬 날짜로 계산해 주입한다.
 */
export function buildGoalProgress(input: {
  currentNetWorthKrw: number;
  targetNetWorthKrw: number;
  targetDate: string;
  todayIso: string;
}): GoalProgress {
  const current = input.currentNetWorthKrw;
  const target = input.targetNetWorthKrw;

  const remainingKrw = Math.max(0, target - current);
  const progressPct = target > 0 ? (current / target) * 100 : 0;

  const achieved = current >= target;
  const targetYmd = parseYmd(input.targetDate);
  const todayYmd = parseYmd(input.todayIso);

  // 미달성 상태에서 목표일 파싱 불가 또는 이미 지났으면 overdue
  const overdue =
    !achieved &&
    (targetYmd === null || todayYmd === null || input.targetDate < input.todayIso);

  let status: GoalStatus;
  if (achieved) {
    status = "achieved";
  } else if (overdue) {
    status = "overdue";
  } else {
    status = "active";
  }

  let monthsRemaining: number;
  if (overdue || targetYmd === null || todayYmd === null) {
    monthsRemaining = 0;
  } else {
    // 연·월 차이 기반. 일이 더 남아 있으면 +1개월 올림
    const baseMonths =
      (targetYmd.y - todayYmd.y) * 12 + (targetYmd.m - todayYmd.m);
    monthsRemaining = Math.max(1, baseMonths + (targetYmd.d > todayYmd.d ? 1 : 0));
  }

  const monthlyRequiredKrw =
    monthsRemaining > 0
      ? Math.ceil(remainingKrw / monthsRemaining)
      : remainingKrw;

  return {
    targetKrw: target,
    currentKrw: current,
    remainingKrw,
    progressPct,
    monthsRemaining,
    monthlyRequiredKrw,
    status,
  };
}
