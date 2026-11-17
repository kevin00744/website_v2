'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * 結帳時調整金額：快速選單（打折 / 折價券 / 折抵）會同時算好實收金額並帶入備註，
 * 也可以直接改實收金額。備註選填。
 *
 * 計算方式：實收 = 原價 × 折數 − 折價券 − 折抵（最低 0）。折數只能選一個，折價券和折抵可以疊加。
 * 直接改「實收金額」欄位後，以手動輸入為準，直到再次點選快速選單。
 */

type Pick =
  | { id: string; kind: 'percent'; value: number }
  | { id: string; kind: 'coupon'; value: number }
  | { id: string; kind: 'deduct'; value: number };

interface Props {
  listPrice: number;
  /** 實收（或實扣）金額 */
  amount: number;
  onAmountChange: (amount: number) => void;
  /** 合成後的備註 */
  onNoteChange: (note: string) => void;
  /** 由父層自動產生、要放進備註的字串（例如方案堂數調整「臉部保養 +2 堂」） */
  autoTokens?: string[];
  /** 金額欄位的標籤，預設「實收金額」 */
  amountLabel?: string;
  /** 重設用：值改變時清空選擇（例如換了品項） */
  resetKey?: string | number;
}

const PERCENTS = [9.5, 9, 8.5, 8];
const COUPONS = [100, 200, 500];

function pickLabel(p: Pick): string {
  if (p.kind === 'coupon') return `折價券 −$${p.value.toLocaleString()}`;
  return `折抵 $${p.value.toLocaleString()}`;
}

function percentText(v: number): string {
  // 9 → 9 折；8.5 → 85 折；9.5 → 95 折
  return Number.isInteger(v) ? `${v} 折` : `${Math.round(v * 10)} 折`;
}

export function AdjustQuickPicks({
  listPrice,
  amount,
  onAmountChange,
  onNoteChange,
  autoTokens = [],
  amountLabel = '實收金額',
  resetKey,
}: Props) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [extraNote, setExtraNote] = useState('');
  const [custom, setCustom] = useState<{ kind: Pick['kind']; value: string } | null>(null);
  const [amountText, setAmountText] = useState(String(amount));

  useEffect(() => {
    setPicks([]);
    setExtraNote('');
    setCustom(null);
  }, [resetKey]);

  useEffect(() => {
    setAmountText(String(amount));
  }, [amount]);

  const tokens = useMemo(
    () => [...picks.map((p) => (p.kind === 'percent' ? percentText(p.value) : pickLabel(p))), ...autoTokens],
    [picks, autoTokens],
  );

  // 備註 = 快速選單 + 自動項目 + 其他備註
  useEffect(() => {
    onNoteChange([...tokens, extraNote.trim()].filter(Boolean).join('、'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, extraNote]);

  function apply(next: Pick[]) {
    setPicks(next);
    const pct = next.find((p) => p.kind === 'percent');
    let v = pct ? Math.round((listPrice * pct.value) / 10) : listPrice;
    for (const p of next) if (p.kind !== 'percent') v -= p.value;
    onAmountChange(Math.max(0, v));
  }

  function toggle(p: Omit<Pick, 'id'>) {
    const id = `${p.kind}-${p.value}`;
    const exists = picks.some((x) => x.id === id);
    if (exists) return apply(picks.filter((x) => x.id !== id));
    // 折數只能一個
    const base = p.kind === 'percent' ? picks.filter((x) => x.kind !== 'percent') : picks;
    apply([...base, { ...p, id } as Pick]);
  }

  function addCustom() {
    if (!custom) return;
    const v = Number(custom.value);
    if (custom.kind === 'percent' ? !(v > 0 && v < 10) : !(Number.isInteger(v) && v > 0)) return;
    toggle({ kind: custom.kind, value: v } as Omit<Pick, 'id'>);
    setCustom(null);
  }

  const diff = amount - listPrice;

  return (
    <div className="flex flex-col gap-3 rounded-kiosk border-2 border-kiosk-primary/25 bg-kiosk-primary/[0.04] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-600">原價</span>
        <span className="text-lg font-bold text-slate-700">${listPrice.toLocaleString()}</span>
      </div>

      {/* 快速選單 */}
      <div className="flex flex-col gap-2">
        <QuickRow label="打折">
          {PERCENTS.map((v) => (
            <Chip key={v} active={picks.some((p) => p.id === `percent-${v}`)} onClick={() => toggle({ kind: 'percent', value: v })}>
              {percentText(v)}
            </Chip>
          ))}
          <Chip active={custom?.kind === 'percent'} onClick={() => setCustom({ kind: 'percent', value: '' })}>自訂</Chip>
        </QuickRow>
        <QuickRow label="折價券">
          {COUPONS.map((v) => (
            <Chip key={v} active={picks.some((p) => p.id === `coupon-${v}`)} onClick={() => toggle({ kind: 'coupon', value: v })}>
              −${v}
            </Chip>
          ))}
          <Chip active={custom?.kind === 'coupon'} onClick={() => setCustom({ kind: 'coupon', value: '' })}>自訂</Chip>
        </QuickRow>
        <QuickRow label="折抵">
          {picks.filter((p) => p.kind === 'deduct').map((p) => (
            <Chip key={p.id} active onClick={() => toggle(p)}>
              ${p.value.toLocaleString()} ✕
            </Chip>
          ))}
          <Chip active={custom?.kind === 'deduct'} onClick={() => setCustom({ kind: 'deduct', value: '' })}>輸入金額</Chip>
        </QuickRow>
        {custom && (
          <div className="flex flex-wrap items-center gap-2 pl-16">
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              value={custom.value}
              onChange={(e) => setCustom({ ...custom, value: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
              placeholder={custom.kind === 'percent' ? '例：7.5' : '金額'}
              className="h-11 w-28 rounded-xl border-2 border-slate-300 px-3 text-base outline-none focus:border-kiosk-primary"
            />
            <span className="text-sm text-slate-500">{custom.kind === 'percent' ? '折（1–9.9）' : '元'}</span>
            <button type="button" onClick={addCustom} className="h-11 rounded-xl bg-kiosk-primary px-4 text-sm font-bold text-white">
              套用
            </button>
            <button type="button" onClick={() => setCustom(null)} className="h-11 px-2 text-sm font-semibold text-slate-500">
              取消
            </button>
          </div>
        )}
      </div>

      {/* 實收金額 */}
      <div className="flex flex-col gap-1.5 border-t border-kiosk-primary/15 pt-3">
        <label className="text-sm font-semibold text-slate-600">{amountLabel}</label>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-kiosk-primary">$</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value);
              const v = Number(e.target.value);
              if (e.target.value !== '' && Number.isInteger(v) && v >= 0) onAmountChange(v);
            }}
            className="h-14 w-40 rounded-kiosk border-2 border-slate-300 bg-white px-4 text-2xl font-bold text-slate-900 outline-none focus:border-kiosk-primary"
          />
          {diff !== 0 && (
            <span className={`text-sm font-bold ${diff < 0 ? 'text-amber-700' : 'text-sky-700'}`}>
              <span className="mr-1.5 font-normal text-slate-500 line-through">${listPrice.toLocaleString()}</span>
              {diff < 0 ? `優惠 $${(-diff).toLocaleString()}` : `加價 $${diff.toLocaleString()}`}
            </span>
          )}
        </div>
      </div>

      {/* 備註 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-slate-600">
          調整備註 <span className="font-normal text-slate-500">選填</span>
        </label>
        {tokens.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tokens.map((t) => (
              <span key={t} className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                {t}
              </span>
            ))}
          </div>
        )}
        <input
          value={extraNote}
          onChange={(e) => setExtraNote(e.target.value)}
          placeholder="其他說明，例如：老客戶、店長核准"
          className="h-12 rounded-kiosk border-2 border-slate-300 bg-white px-4 text-base outline-none focus:border-kiosk-primary"
        />
      </div>
    </div>
  );
}

function QuickRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 shrink-0 text-sm font-semibold text-slate-600">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[2.75rem] rounded-full border-2 px-4 text-sm font-bold transition-colors ${
        active
          ? 'border-kiosk-primary bg-kiosk-primary text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:border-kiosk-primary/50'
      }`}
    >
      {children}
    </button>
  );
}
