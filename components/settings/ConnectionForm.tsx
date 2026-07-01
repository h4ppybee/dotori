"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Dialog } from "@/components/ui/Dialog";
import { Chip } from "@/components/ui/Chip";
import { listConnections, upsertConnection, deleteConnection, listMembers, upsertMember } from "@/lib/db/local-store";
import { encrypt } from "@/lib/crypto/crypto";
import { useAppStore } from "@/stores/app-store";
import type { Connection, ConnectionType, Member } from "@/lib/types";

type ProviderType = "TOSS_API" | "UPBIT_API";

interface EditState {
  id?: string;
  type: ProviderType;
  label: string;
  memberId: string;
  clientId: string;
  clientSecret: string; // 입력 중 평문 — 저장 전 암호화, 상태에서는 비워두거나 임시 보관
}

const EMPTY_EDIT: EditState = {
  type: "TOSS_API",
  label: "",
  memberId: "",
  clientId: "",
  clientSecret: "",
};

/** 연동 타입별 UI 문구 — 토스는 Client ID/Secret, 업비트는 Access Key/Secret Key */
const TYPE_COPY: Record<ProviderType, {
  name: string;
  labelPlaceholder: string;
  clientIdLabel: string;
  clientIdPlaceholder: string;
  secretLabel: string;
  secretPlaceholder: string;
  clientIdError: string;
  secretError: string;
}> = {
  TOSS_API: {
    name: "토스",
    labelPlaceholder: "예: 내 토스 계정",
    clientIdLabel: "Client ID",
    clientIdPlaceholder: "토스 개발자센터에서 발급받은 Client ID",
    secretLabel: "Client Secret",
    secretPlaceholder: "Client Secret 입력",
    clientIdError: "Client ID를 입력해 주세요.",
    secretError: "Client Secret을 입력해 주세요.",
  },
  UPBIT_API: {
    name: "업비트",
    labelPlaceholder: "예: 내 업비트 계정",
    clientIdLabel: "Access Key",
    clientIdPlaceholder: "업비트에서 발급받은 Access Key",
    secretLabel: "Secret Key",
    secretPlaceholder: "Secret Key 입력",
    clientIdError: "Access Key를 입력해 주세요.",
    secretError: "Secret Key를 입력해 주세요.",
  },
};

function maskClientId(clientId: string | undefined): string {
  if (!clientId || clientId.length <= 8) {
    return clientId ?? "";
  }
  return `${clientId.slice(0, 4)}••••${clientId.slice(-4)}`;
}

/** 목록 항목의 타입 배지 (DESIGN.md chip 규격 — pill, caption-strong). */
function TypeBadge({ type }: { type: ProviderType }) {
  return (
    <span className="inline-flex items-center px-[10px] py-[3px] rounded-full bg-primary-surface text-primary text-[12px] font-semibold leading-[1.4]">
      {TYPE_COPY[type].name}
    </span>
  );
}

/**
 * API 연동(Connection) 관리 섹션 — 토스·업비트.
 * 목록 + 추가/수정 폼 + 삭제 확인 다이얼로그.
 */
export function ConnectionForm() {
  const sessionKey = useAppStore((s) => s.sessionKey)!;

  const [connections, setConnections] = useState<Connection[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newMemberName, setNewMemberName] = useState("");
  const [showNewMember, setShowNewMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [conns, mems] = await Promise.all([listConnections(), listMembers()]);
    setConnections(conns.filter((c) => c.type === "TOSS_API" || c.type === "UPBIT_API"));
    setMembers(mems);
  }, []);

  useEffect(() => {
    // 마운트 시 초기 데이터 로드 — setState는 reload() 내 비동기 resolve 후 호출됨
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload().catch(() => undefined);
  }, [reload]);

  function openAdd() {
    const defaultMember = members[0]?.id ?? "";
    setEditing({ ...EMPTY_EDIT, memberId: defaultMember });
    setError(null);
  }

  function openEdit(conn: Connection) {
    setEditing({
      id: conn.id,
      type: conn.type === "UPBIT_API" ? "UPBIT_API" : "TOSS_API",
      label: conn.label,
      memberId: conn.memberId,
      clientId: conn.clientId ?? "",
      clientSecret: "", // 기존 시크릿은 표시하지 않음
    });
    setError(null);
  }

  function closeForm() {
    setEditing(null);
    setError(null);
    setNewMemberName("");
    setShowNewMember(false);
  }

  async function handleAddMember() {
    if (!newMemberName.trim()) {
      return;
    }
    const id = crypto.randomUUID();
    const member: Member = { id, name: newMemberName.trim() };
    await upsertMember(member);
    await reload();
    setEditing((prev) => prev ? { ...prev, memberId: id } : prev);
    setNewMemberName("");
    setShowNewMember(false);
  }

  async function handleSave() {
    if (!editing) {
      return;
    }
    if (!editing.label.trim()) {
      setError("연동 이름을 입력해 주세요.");
      return;
    }
    if (!editing.memberId) {
      setError("멤버를 선택해 주세요.");
      return;
    }
    const copy = TYPE_COPY[editing.type];
    if (!editing.clientId.trim()) {
      setError(copy.clientIdError);
      return;
    }
    // 신규 등록이거나 시크릿 필드가 비어 있지 않을 때만 시크릿 필수 체크
    if (!editing.id && !editing.clientSecret.trim()) {
      setError(copy.secretError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let clientSecretEnc: string | undefined;
      if (editing.clientSecret.trim()) {
        // 평문을 암호화 — 평문은 이 스코프에서만 존재하고 저장하지 않는다
        clientSecretEnc = await encrypt(sessionKey, editing.clientSecret);
      }

      // 기존 행의 clientSecretEnc 유지 (시크릿 미입력 시 기존 값 보존)
      const existing = editing.id
        ? connections.find((c) => c.id === editing.id)
        : undefined;

      await upsertConnection({
        id: editing.id,
        memberId: editing.memberId,
        type: editing.type as ConnectionType,
        label: editing.label.trim(),
        clientId: editing.clientId.trim(),
        clientSecretEnc: clientSecretEnc ?? existing?.clientSecretEnc,
      });
      await reload();
      closeForm();
    } catch {
      setError("저장하는 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }
    await deleteConnection(deleteTarget);
    setDeleteTarget(null);
    await reload();
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
          API 연동
        </h2>
        {editing == null && (
          <Button variant="secondary" onClick={openAdd} className="h-[38px] px-4 text-[15px]">
            추가하기
          </Button>
        )}
      </div>

      {/* 커넥션 목록 */}
      {connections.length === 0 && editing == null && (
        <p className="text-[15px] text-muted leading-[1.5] py-2">
          아직 연동이 없어요. 추가하기를 눌러 토스나 업비트를 연결해 보세요.
        </p>
      )}

      {connections.length > 0 && editing == null && (
        <ul className="flex flex-col gap-2">
          {connections.map((conn) => {
            const member = members.find((m) => m.id === conn.memberId);
            return (
              <li
                key={conn.id}
                className="flex items-center justify-between py-3 border-b border-hairline last:border-0"
              >
                <div className="flex flex-col gap-[2px]">
                  <span className="flex items-center gap-2">
                    <span className="text-[17px] font-semibold leading-[1.45] text-ink tracking-[-0.2px]">
                      {conn.label}
                    </span>
                    <TypeBadge type={conn.type === "UPBIT_API" ? "UPBIT_API" : "TOSS_API"} />
                  </span>
                  <span className="text-[13px] text-muted leading-[1.45]">
                    {member?.name ?? "알 수 없는 멤버"} · {maskClientId(conn.clientId)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="weak" onClick={() => openEdit(conn)} className="h-[36px] px-3 text-[13px]">
                    수정
                  </Button>
                  <Button
                    variant="weak"
                    onClick={() => setDeleteTarget(conn.id)}
                    className="h-[36px] px-3 text-[13px] text-[#F04452]"
                  >
                    삭제
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 추가/수정 폼 */}
      {editing != null && (
        <div className="flex flex-col gap-4 pt-1">
          {/* 연동 타입 선택 — 신규 등록에서만. 기존 연동은 타입을 바꾸지 않는다. */}
          {editing.id == null && (
            <div className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">
                연동 타입
              </span>
              <div className="flex gap-2">
                <Chip
                  selected={editing.type === "TOSS_API"}
                  onClick={() => setEditing((p) => p ? { ...p, type: "TOSS_API" } : p)}
                >
                  토스
                </Chip>
                <Chip
                  selected={editing.type === "UPBIT_API"}
                  onClick={() => setEditing((p) => p ? { ...p, type: "UPBIT_API" } : p)}
                >
                  업비트
                </Chip>
              </div>
            </div>
          )}

          <TextInput
            inputId="conn-label"
            label="연동 이름"
            value={editing.label}
            onChange={(v) => setEditing((p) => p ? { ...p, label: v } : p)}
            placeholder={TYPE_COPY[editing.type].labelPlaceholder}
          />

          {/* 멤버 선택 */}
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="conn-member" className="text-[13px] font-semibold leading-[1.45] text-body-soft">
              멤버
            </label>
            <div className="flex gap-2">
              <select
                id="conn-member"
                value={editing.memberId}
                onChange={(e) => setEditing((p) => p ? { ...p, memberId: e.target.value } : p)}
                className="
                  flex-1 h-[56px] px-4 rounded-[12px]
                  bg-surface-soft text-ink
                  text-[17px] font-normal leading-[1.5] tracking-[-0.2px]
                  border border-hairline
                  outline-none
                  focus:bg-surface-card focus:border-[1.5px] focus:border-primary
                  transition-colors duration-150
                "
              >
                <option value="">멤버 선택</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Button
                variant="weak"
                onClick={() => setShowNewMember((v) => !v)}
                className="h-[56px] px-4 text-[13px] shrink-0"
              >
                + 새 멤버
              </Button>
            </div>
          </div>

          {/* 신규 멤버 입력 */}
          {showNewMember && (
            <div className="flex gap-2 pl-1">
              <TextInput
                inputId="new-member-name"
                label="새 멤버 이름"
                value={newMemberName}
                onChange={setNewMemberName}
                placeholder="예: 홍길동"
                className="flex-1"
              />
              <div className="flex items-end pb-0">
                <Button variant="secondary" onClick={handleAddMember} className="h-[52px] px-4 text-[15px]">
                  추가
                </Button>
              </div>
            </div>
          )}

          <TextInput
            inputId="conn-client-id"
            label={TYPE_COPY[editing.type].clientIdLabel}
            value={editing.clientId}
            onChange={(v) => setEditing((p) => p ? { ...p, clientId: v } : p)}
            placeholder={TYPE_COPY[editing.type].clientIdPlaceholder}
          />

          <TextInput
            inputId="conn-client-secret"
            label={editing.id ? `${TYPE_COPY[editing.type].secretLabel} (변경 시에만 입력)` : TYPE_COPY[editing.type].secretLabel}
            value={editing.clientSecret}
            onChange={(v) => setEditing((p) => p ? { ...p, clientSecret: v } : p)}
            masked
            placeholder={editing.id ? "변경하지 않으려면 비워두세요" : TYPE_COPY[editing.type].secretPlaceholder}
          />

          {error != null && (
            <p className="text-[13px] leading-[1.45]" style={{ color: "#F04452" }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="weak" onClick={closeForm} className="flex-1">
              닫기
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "저장 중..." : "저장하기"}
            </Button>
          </div>
        </div>
      )}

      {/* 삭제 확인 다이얼로그 */}
      <Dialog
        open={deleteTarget != null}
        title="이 연동을 삭제할까요?"
        onClose={() => setDeleteTarget(null)}
        actionLabel="삭제하기"
        onAction={handleDelete}
        actionVariant="primary"
      >
        삭제하면 이 프리셋의 API 설정이 모두 지워져요. 연동된 보유 종목 데이터는 유지돼요.
      </Dialog>
    </Card>
  );
}
