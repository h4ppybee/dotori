"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Chip } from "@/components/ui/Chip";
import {
  listConnections,
  listMembers,
  upsertConnection,
  upsertManualHolding,
} from "@/lib/db/local-store";
import { resolveSector } from "@/lib/sector/sector-map";
import type { Holding, Connection, Member, Currency } from "@/lib/types";

interface HoldingFormProps {
  initial?: Partial<Holding>;
  onSave: (h: Holding) => void;
  onCancel: () => void;
}

interface FormErrors {
  connection?: string;
  newLabel?: string;
  name?: string;
  symbol?: string;
  market?: string;
  quantity?: string;
  avgBuyPrice?: string;
}

export function HoldingForm({ initial, onSave, onCancel }: HoldingFormProps) {
  // ── 연결 목록 / 멤버 목록 ──────────────────────────────────────
  const [manualConnections, setManualConnections] = useState<Connection[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [hasTossApi, setHasTossApi] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // ── 폼 상태 ──────────────────────────────────────────────────
  const [connectionId, setConnectionId] = useState(initial?.connectionId ?? "");
  const [newLabel, setNewLabel] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [market, setMarket] = useState(initial?.market ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "KRW");
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? "");
  const [avgBuyPrice, setAvgBuyPrice] = useState(initial?.avgBuyPrice?.toString() ?? "");
  const [manualPrice, setManualPrice] = useState(initial?.manualPrice?.toString() ?? "");

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // ── 초기 데이터 로드 ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [connections, memberList] = await Promise.all([
        listConnections(),
        listMembers(),
      ]);

      if (cancelled) {
        return;
      }

      const manual = connections.filter((c) => c.type === "MANUAL");
      const tossExists = connections.some((c) => c.type === "TOSS_API");

      setManualConnections(manual);
      setMembers(memberList);
      setHasTossApi(tossExists);
      setLoadingConnections(false);

      // 기본 멤버 선택
      if (memberList.length > 0 && !selectedMemberId) {
        setSelectedMemberId(memberList[0].id);
      }

      // 편집 시 connectionId가 이미 설정되어 있으면 그대로 유지
      if (!initial?.connectionId && manual.length > 0) {
        setConnectionId(manual[0].id);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isNewConnection = connectionId === "__new__";

  // ── 유효성 검사 ──────────────────────────────────────────────
  function validate(): boolean {
    const next: FormErrors = {};

    if (!connectionId) {
      next.connection = "증권사를 선택해 주세요.";
    } else if (isNewConnection && !newLabel.trim()) {
      next.newLabel = "증권사 이름을 입력해 주세요.";
    }

    if (!name.trim()) {
      next.name = "종목명을 입력해 주세요.";
    }
    if (!symbol.trim()) {
      next.symbol = "종목 코드를 입력해 주세요.";
    }
    if (!market.trim()) {
      next.market = "시장을 입력해 주세요.";
    }
    if (!quantity || Number(quantity) < 1) {
      next.quantity = "수량을 1 이상으로 입력해 주세요.";
    }
    if (!avgBuyPrice || Number(avgBuyPrice) <= 0) {
      next.avgBuyPrice = "평균 매수가를 입력해 주세요.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ── 저장 ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      let resolvedConnectionId = connectionId;

      if (isNewConnection) {
        const memberId =
          selectedMemberId ||
          (members.length > 0 ? members[0].id : "default");

        const conn = await upsertConnection({
          memberId,
          type: "MANUAL",
          label: newLabel.trim(),
        });
        resolvedConnectionId = conn.id;
      }

      const sector = resolveSector(symbol.trim(), {});
      const holding = await upsertManualHolding({
        id: initial?.id,
        connectionId: resolvedConnectionId,
        market: market.trim(),
        name: name.trim(),
        symbol: symbol.trim(),
        sector,
        currency,
        quantity: Number(quantity),
        avgBuyPrice: Number(avgBuyPrice),
        ...(manualPrice && Number(manualPrice) > 0
          ? { manualPrice: Number(manualPrice), manualPriceAsOf: Date.now() }
          : {}),
      });

      onSave(holding);
    } catch {
      // 저장 실패 시 버튼 상태만 복구
      setSaving(false);
    }
  }

  if (loadingConnections) {
    return (
      <div className="flex items-center justify-center py-8 text-[15px] text-muted">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 증권사 선택 */}
      <div className="flex flex-col gap-[6px]">
        <label
          htmlFor="holding-connection"
          className="text-[13px] font-semibold leading-[1.45] text-body-soft"
        >
          증권사
        </label>
        <select
          id="holding-connection"
          value={connectionId}
          onChange={(e) => {
            setConnectionId(e.target.value);
            setErrors((prev) => ({ ...prev, connection: undefined }));
          }}
          className="
            h-[56px] px-4 rounded-[12px]
            bg-surface-soft text-ink
            text-[17px] font-normal leading-[1.5] tracking-[-0.2px]
            border border-hairline
            outline-none
            focus:bg-surface-card focus:border-[1.5px] focus:border-primary
            transition-colors duration-150
            appearance-none cursor-pointer
          "
        >
          <option value="">증권사를 선택해 주세요</option>
          {manualConnections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value="__new__">+ 새 증권사 추가</option>
        </select>
        {errors.connection != null && (
          <span className="text-[13px] text-up">{errors.connection}</span>
        )}
      </div>

      {/* 새 증권사 추가 필드 */}
      {isNewConnection && (
        <div className="flex flex-col gap-4 pl-4 border-l-2 border-primary-surface">
          <TextInput
            inputId="holding-new-label"
            label="증권사 이름"
            value={newLabel}
            onChange={(v) => {
              setNewLabel(v);
              setErrors((prev) => ({ ...prev, newLabel: undefined }));
            }}
            placeholder="예: 직접 보유"
          />
          {errors.newLabel != null && (
            <span className="text-[13px] text-up -mt-3">{errors.newLabel}</span>
          )}

          {members.length > 1 && (
            <div className="flex flex-col gap-[6px]">
              <label
                htmlFor="holding-member"
                className="text-[13px] font-semibold leading-[1.45] text-body-soft"
              >
                멤버
              </label>
              <select
                id="holding-member"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="
                  h-[56px] px-4 rounded-[12px]
                  bg-surface-soft text-ink
                  text-[17px] font-normal leading-[1.5] tracking-[-0.2px]
                  border border-hairline
                  outline-none
                  focus:bg-surface-card focus:border-[1.5px] focus:border-primary
                  transition-colors duration-150
                  appearance-none cursor-pointer
                "
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* 시장 */}
      <div className="flex flex-col gap-[6px]">
        <TextInput
          inputId="holding-market"
          label="시장"
          value={market}
          onChange={(v) => {
            setMarket(v);
            setErrors((prev) => ({ ...prev, market: undefined }));
          }}
          placeholder="예: KOSPI, NASDAQ"
        />
        {errors.market != null && (
          <span className="text-[13px] text-up -mt-1">{errors.market}</span>
        )}
      </div>

      {/* 종목명 */}
      <div className="flex flex-col gap-[6px]">
        <TextInput
          inputId="holding-name"
          label="종목명"
          value={name}
          onChange={(v) => {
            setName(v);
            setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="예: 삼성전자"
        />
        {errors.name != null && (
          <span className="text-[13px] text-up -mt-1">{errors.name}</span>
        )}
      </div>

      {/* 종목 코드 */}
      <div className="flex flex-col gap-[6px]">
        <TextInput
          inputId="holding-symbol"
          label="종목 코드"
          value={symbol}
          onChange={(v) => {
            setSymbol(v);
            setErrors((prev) => ({ ...prev, symbol: undefined }));
          }}
          placeholder="예: 005930"
        />
        {errors.symbol != null && (
          <span className="text-[13px] text-up -mt-1">{errors.symbol}</span>
        )}
      </div>

      {/* 통화 */}
      <div className="flex flex-col gap-[6px]">
        <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">
          통화
        </span>
        <div className="flex gap-2">
          <Chip
            selected={currency === "KRW"}
            onClick={() => setCurrency("KRW")}
          >
            KRW
          </Chip>
          <Chip
            selected={currency === "USD"}
            onClick={() => setCurrency("USD")}
          >
            USD
          </Chip>
        </div>
      </div>

      {/* 수량 */}
      <div className="flex flex-col gap-[6px]">
        <TextInput
          inputId="holding-quantity"
          label="수량"
          value={quantity}
          onChange={(v) => {
            setQuantity(v);
            setErrors((prev) => ({ ...prev, quantity: undefined }));
          }}
          type="number"
          placeholder="0"
        />
        {errors.quantity != null && (
          <span className="text-[13px] text-up -mt-1">{errors.quantity}</span>
        )}
      </div>

      {/* 평균 매수가 */}
      <div className="flex flex-col gap-[6px]">
        <TextInput
          inputId="holding-avg-buy-price"
          label="평균 매수가"
          value={avgBuyPrice}
          onChange={(v) => {
            setAvgBuyPrice(v);
            setErrors((prev) => ({ ...prev, avgBuyPrice: undefined }));
          }}
          type="number"
          placeholder="0"
        />
        {errors.avgBuyPrice != null && (
          <span className="text-[13px] text-up -mt-1">{errors.avgBuyPrice}</span>
        )}
      </div>

      {/* 현재가 직접 입력 (토스 API 없을 때만 표시) */}
      {!hasTossApi && (
        <TextInput
          inputId="holding-manual-price"
          label="현재가 (직접 입력)"
          value={manualPrice}
          onChange={setManualPrice}
          type="number"
          placeholder="0"
        />
      )}

      {/* 버튼 */}
      <div className="flex flex-col gap-3 pt-2">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
          className="w-full"
        >
          {saving ? "저장 중..." : "저장하기"}
        </Button>
        <Button
          variant="weak"
          onClick={onCancel}
          disabled={saving}
          className="w-full"
        >
          취소
        </Button>
      </div>
    </div>
  );
}
