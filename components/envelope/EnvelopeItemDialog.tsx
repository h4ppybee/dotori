"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/TextInput";
import { Chip } from "@/components/ui/Chip";
import { tagColor } from "@/lib/envelope/tag-color";
import type { EnvelopeProfile } from "@/lib/types";

interface EnvelopeItemValue {
  tag: string;
  account: string;
  name: string;
  amountKrw: number;
  note?: string;
}

interface EnvelopeItemDialogProps {
  open: boolean;
  /** 저장 대상 프로필(라벨 표시용으로도 쓸 수 있음). */
  profile: EnvelopeProfile;
  /** 있으면 수정 모드 — 기존 값으로 폼을 채운다. */
  initial?: EnvelopeItemValue;
  /** 선택 가능한 태그(프리셋 ∪ 커스텀). 실시간 prop. */
  tags: string[];
  /** 선택 가능한 통장(프리셋 ∪ 커스텀). 실시간 prop. */
  accounts: string[];
  onClose: () => void;
  onSubmit: (v: EnvelopeItemValue) => void;
  /** 있으면(수정 모드) 삭제 버튼을 노출한다. */
  onDelete?: () => void;
  /** 커스텀 태그 추가. */
  onAddTag: (value: string) => void;
  /** 커스텀 통장 추가. */
  onAddAccount: (value: string) => void;
  submitting?: boolean;
}

/** 숫자 이외 문자를 제거한다. */
function sanitizeDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/**
 * 통장 쪼개기 항목 추가·수정 다이얼로그.
 *
 * 상태는 마운트 시 initial에서 한 번만 초기화한다(effect 동기화 없음). 부모가 open·편집 대상
 * 변경 시 key로 리마운트해 재초기화한다(GoalForm과 동일 계약).
 *
 * CRITICAL: 커스텀 태그/통장 추가(onAddTag/onAddAccount)는 tags/accounts를 실시간 prop으로
 * 갱신할 뿐 key를 바꾸지 않는다. 따라서 이 컴포넌트는 tags/accounts를 key로 삼지 않으며,
 * 커스텀 추가 중에도 입력 중인 폼 상태(항목명·금액·비고 등)를 잃지 않는다.
 */
export function EnvelopeItemDialog({
  open,
  initial,
  tags,
  accounts,
  onClose,
  onSubmit,
  onDelete,
  onAddTag,
  onAddAccount,
  submitting = false,
}: EnvelopeItemDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(
    initial != null ? String(initial.amountKrw) : "",
  );
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [account, setAccount] = useState(initial?.account ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  // 커스텀 태그/통장 입력 노출 토글 + 입력값(폼 상태와 독립).
  const [tagAdding, setTagAdding] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [accountAdding, setAccountAdding] = useState(false);
  const [accountDraft, setAccountDraft] = useState("");

  const isEdit = initial != null;
  const trimmedName = name.trim();
  const amountNum = Number(amount === "" ? "0" : amount);
  const canSubmit =
    trimmedName.length > 0 &&
    Number.isFinite(amountNum) &&
    amountNum >= 0 &&
    tag !== "" &&
    account !== "" &&
    !submitting;

  function handleAction() {
    if (!canSubmit) {
      return;
    }
    onSubmit({
      tag,
      account,
      name: trimmedName,
      amountKrw: amountNum,
      note: note.trim() || undefined,
    });
  }

  function commitTag() {
    const value = tagDraft.trim();
    if (value === "") {
      return;
    }
    // 신규면 부모에 추가 요청(실시간 prop으로 반영), 이미 있으면 선택만.
    if (!tags.includes(value)) {
      onAddTag(value);
    }
    setTag(value);
    setTagDraft("");
    setTagAdding(false);
  }

  function commitAccount() {
    const value = accountDraft.trim();
    if (value === "") {
      return;
    }
    if (!accounts.includes(value)) {
      onAddAccount(value);
    }
    setAccount(value);
    setAccountDraft("");
    setAccountAdding(false);
  }

  return (
    <Dialog
      open={open}
      title={isEdit ? "항목 수정하기" : "항목 추가하기"}
      onClose={onClose}
      actionLabel={submitting ? "저장 중..." : "저장하기"}
      onAction={canSubmit ? handleAction : undefined}
      actionVariant="primary"
    >
      <div className="flex flex-col gap-4 pb-1 text-left">
        <TextInput
          label="항목명"
          inputId="envelope-name"
          value={name}
          onChange={setName}
          placeholder="예: 월세"
        />

        <TextInput
          label="금액 (원)"
          inputId="envelope-amount"
          value={amount}
          onChange={(v) => setAmount(sanitizeDigits(v))}
          inputMode="numeric"
          placeholder="0"
        />

        {/* 태그 */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">태그</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const selected = tag === t;
              return (
                <Chip key={t} selected={selected} onClick={() => setTag(t)}>
                  <span
                    className="mr-1.5 inline-block size-[8px] rounded-full align-middle"
                    style={{ backgroundColor: tagColor(t) }}
                    aria-hidden="true"
                  />
                  {t}
                </Chip>
              );
            })}
            {!tagAdding && (
              <Chip onClick={() => setTagAdding(true)}>+ 직접 추가</Chip>
            )}
          </div>
          {tagAdding && (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTag();
                  }
                }}
                placeholder="새 태그"
                className="h-[44px] flex-1 rounded-[12px] border border-hairline bg-surface-soft px-3 text-[15px] text-ink outline-none focus:border-[1.5px] focus:border-primary focus:bg-surface-card"
              />
              <button
                type="button"
                onClick={commitTag}
                className="shrink-0 px-3 py-2 text-[15px] font-semibold text-primary"
              >
                추가
              </button>
            </div>
          )}
        </div>

        {/* 통장 */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">통장</span>
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((a) => (
              <Chip key={a} selected={account === a} onClick={() => setAccount(a)}>
                {a}
              </Chip>
            ))}
            {!accountAdding && (
              <Chip onClick={() => setAccountAdding(true)}>+ 직접 추가</Chip>
            )}
          </div>
          {accountAdding && (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={accountDraft}
                onChange={(e) => setAccountDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitAccount();
                  }
                }}
                placeholder="새 통장"
                className="h-[44px] flex-1 rounded-[12px] border border-hairline bg-surface-soft px-3 text-[15px] text-ink outline-none focus:border-[1.5px] focus:border-primary focus:bg-surface-card"
              />
              <button
                type="button"
                onClick={commitAccount}
                className="shrink-0 px-3 py-2 text-[15px] font-semibold text-primary"
              >
                추가
              </button>
            </div>
          )}
        </div>

        <TextInput
          label="비고"
          inputId="envelope-note"
          value={note}
          onChange={setNote}
          placeholder="메모 (선택)"
        />

        {onDelete != null && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-1 self-center px-4 py-2 text-[15px] font-semibold text-up underline-offset-2 hover:underline"
          >
            이 항목 삭제하기
          </button>
        )}
      </div>
    </Dialog>
  );
}
