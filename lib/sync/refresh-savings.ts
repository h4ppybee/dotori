import { db } from "@/lib/db/schema";
import { accrueDeposit } from "@/lib/savings/deposit-accrual";

/**
 * 예적금 월 불입액 자동 증가. 수동(MANUAL) 저축 행 중 금액 기준일 이후 납입일이 지난
 * 예적금을 today 기준으로 갱신한다(lib/savings/deposit-accrual). 외부 API 호출은 없다.
 * 읽기·계산·쓰기를 savings 단일 트랜잭션으로 묶고 amount·balanceAsOf·updatedAt만 쓴다 —
 * 기기 동기화 적용과 겹쳐도 다른 필드를 덮지 않는다(docs/device-sync.md "갱신 쓰기").
 * @returns 갱신한 행 수
 */
export async function refreshSavingsAccrual(opts: { today: string }): Promise<number> {
  return db.transaction("rw", db.savings, async () => {
    const rows = await db.savings.where("source").equals("MANUAL").toArray();
    const now = Date.now();
    let changed = 0;
    for (const r of rows) {
      const next = accrueDeposit(r, opts.today);
      if (!next) {
        continue;
      }
      await db.savings.update(r.id, { amount: next.amount, balanceAsOf: next.balanceAsOf, updatedAt: now });
      changed += 1;
    }
    return changed;
  });
}
