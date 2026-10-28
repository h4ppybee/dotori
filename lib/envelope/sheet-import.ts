import type { EnvelopeProfile } from "@/lib/types";

/** 시트 금액 단위(만원) → 원. */
export const SHEET_AMOUNT_UNIT_KRW = 10_000;

/** 은행·위치 칸이 비어 있을 때 쓰는 통장 이름. */
export const FALLBACK_ACCOUNT = "기타";

export const SHEET_TABLE_NOT_FOUND = "통장쪼개기 표를 찾지 못했어요.";

/** 시트 블록 순서 → 프로필. 위 블록이 아내, 아래 블록이 남편. */
const BLOCK_PROFILES: readonly EnvelopeProfile[] = ["wife", "husband"];

export interface ImportedEnvelopeItem {
  profile: EnvelopeProfile;
  tag: string;
  account: string;
  name: string;
  amountKrw: number;
  note?: string;
}

export type EnvelopeSheetParse =
  | { ok: true; items: ImportedEnvelopeItem[] }
  | { ok: false; message: string };

interface Columns {
  tag: number;
  account: number;
  name: number;
  amount: number;
  note: number;
}

const text = (v: unknown): string => (v == null ? "" : String(v).trim());

/** 숫자 또는 콤마가 섞인 숫자 문자열 → 유한한 숫자. 그 외 null. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  const s = text(v).replace(/,/g, "");
  if (s === "") {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 같은 행에 "태그"·"금액"이 있으면 헤더로 보고 라벨 위치로 열을 정한다. */
function headerColumns(row: unknown[]): Columns | null {
  const labels = row.map(text);
  const tag = labels.indexOf("태그");
  const amount = labels.indexOf("금액");
  if (tag < 0 || amount < 0) {
    return null;
  }
  const bank = labels.indexOf("은행");
  return {
    tag,
    amount,
    account: bank >= 0 ? bank : labels.indexOf("위치"),
    name: labels.indexOf("항목"),
    note: labels.indexOf("비고"),
  };
}

/**
 * 시트 `통장쪼개기` 탭 그리드를 통장 쪼개기 항목으로 바꾼다(순수).
 * 헤더 행마다 블록이 시작되고 다음 헤더 직전까지 이어진다. 블록 순서대로 아내·남편.
 * 태그·항목이 있고 금액이 0 이상 숫자인 행만 항목이다 — 빈 행·합계 행·요약 칸은 건너뛴다.
 */
export function parseEnvelopeSheet(values: unknown[][]): EnvelopeSheetParse {
  const headers: { index: number; cols: Columns }[] = [];
  values.forEach((row, index) => {
    const cols = Array.isArray(row) ? headerColumns(row) : null;
    if (cols) {
      headers.push({ index, cols });
    }
  });
  if (headers.length < BLOCK_PROFILES.length) {
    return { ok: false, message: SHEET_TABLE_NOT_FOUND };
  }

  const items: ImportedEnvelopeItem[] = [];
  BLOCK_PROFILES.forEach((profile, b) => {
    const { index, cols } = headers[b];
    const end = headers[b + 1]?.index ?? values.length;
    for (let r = index + 1; r < end; r++) {
      const row = values[r];
      if (!Array.isArray(row)) {
        continue;
      }
      const tag = text(row[cols.tag]);
      const name = cols.name >= 0 ? text(row[cols.name]) : "";
      const amount = toNumber(row[cols.amount]);
      if (tag === "" || name === "" || amount == null || amount < 0) {
        continue;
      }
      const note = cols.note >= 0 ? text(row[cols.note]) : "";
      items.push({
        profile,
        tag,
        account: (cols.account >= 0 ? text(row[cols.account]) : "") || FALLBACK_ACCOUNT,
        name,
        amountKrw: Math.round(amount * SHEET_AMOUNT_UNIT_KRW),
        ...(note ? { note } : {}),
      });
    }
  });
  return { ok: true, items };
}
