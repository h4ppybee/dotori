import { db } from "@/lib/db/schema";
import { accrueDeposit } from "@/lib/savings/deposit-accrual";

/**
 * 예적금 월 불입액 자동 증가. 수동(MANUAL) 저축 행 중 금액 기준일 이후 납입일이 지난
 * 예적금을 today 기준으로 갱신한다(lib/savings/deposit-accrual). 외부 API 호출은 없다.
 * @returns 갱신한 행 수
 */
export async function refreshSavingsAccrual(opts: { today: string }): Promise<number> {
  const rows = await db.savings.where("source").equals("MANUAL").toArray();
  const now = Date.now();
  const changed = rows.flatMap((r) => {
    const next = accrueDeposit(r, opts.today);
    if (!next) {
      return [];
    }
    return [{ ...r, ...next, updatedAt: now }];
  });
  if (changed.length > 0) {
    await db.savings.bulkPut(changed);
  }
  return changed.length;
}
