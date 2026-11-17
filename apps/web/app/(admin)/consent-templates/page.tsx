'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import {
  activateConsentTemplate,
  getConsentTemplate,
  listConsentTemplates,
  previewConsentDraft,
  previewConsentTemplate,
  saveConsentTemplate,
  type ConsentSection,
  type ConsentTemplateSummary,
} from '@/lib/consent-templates-api';
import { openPdfFromRequest } from '@/lib/pdf-viewer';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

/** 編輯中的段落：內容用「一行一段」的文字編輯，存檔時再拆回 paragraphs */
interface DraftSection {
  key: string;
  heading: string;
  body: string;
  requiresSignature: boolean;
}

let keySeq = 0;
const newKey = () => `s${++keySeq}`;

function toDraft(sections: ConsentSection[]): DraftSection[] {
  return sections.map((s) => ({ key: newKey(), heading: s.heading, body: s.paragraphs.join('\n'), requiresSignature: s.requiresSignature }));
}

function toSections(draft: DraftSection[]): ConsentSection[] {
  return draft.map((d) => ({
    heading: d.heading.trim(),
    paragraphs: d.body.split('\n').map((p) => p.trim()).filter(Boolean),
    requiresSignature: d.requiresSignature,
  }));
}

export default function ConsentTemplatesPage() {
  const [allowed, setAllowed] = useState<boolean>();
  const [versions, setVersions] = useState<ConsentTemplateSummary[]>([]);
  const [baseVersion, setBaseVersion] = useState<string>();
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState<DraftSection[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const snapshot = useMemo(() => JSON.stringify({ title: title.trim(), sections: toSections(draft) }), [title, draft]);
  const dirty = Boolean(savedSnapshot) && snapshot !== savedSnapshot;
  const nextVersion = `v${versions.reduce((m, v) => Math.max(m, Number(/^v(\d+)$/.exec(v.version)?.[1] ?? 0)), 0) + 1}`;
  const active = versions.find((v) => v.isActive);
  const signatureCount = draft.filter((d) => d.requiresSignature).length;

  const loadVersion = useCallback(async (id: number) => {
    const t = await getConsentTemplate(id);
    setTitle(t.title);
    const d = toDraft(t.sections);
    setDraft(d);
    setBaseVersion(t.version);
    setSavedSnapshot(JSON.stringify({ title: t.title.trim(), sections: toSections(d) }));
  }, []);

  const reload = useCallback(async () => {
    const list = await listConsentTemplates();
    setVersions(list);
    return list;
  }, []);

  useEffect(() => {
    const role = getAuthUser()?.role;
    const ok = role === 'admin' || role === 'system_admin';
    setAllowed(ok);
    if (!ok) return;
    reload()
      .then((list) => {
        const current = list.find((v) => v.isActive) ?? list[0];
        if (current) return loadVersion(current.id);
        setSavedSnapshot(JSON.stringify({ title: '', sections: [] }));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : '載入同意書失敗'));
  }, [reload, loadVersion]);

  // 有未儲存的修改時，離開頁面前提醒
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function update(key: string, patch: Partial<DraftSection>) {
    setDraft((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function move(index: number, dir: -1 | 1) {
    setDraft((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function remove(key: string, heading: string) {
    if (!window.confirm(`確定要刪除段落「${heading || '（未命名）'}」嗎？`)) return;
    setDraft((prev) => prev.filter((d) => d.key !== key));
  }

  function addSection() {
    setDraft((prev) => [...prev, { key: newKey(), heading: '', body: '', requiresSignature: false }]);
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-section-heading]');
      inputs[inputs.length - 1]?.focus();
    }, 50);
  }

  function validate(): string | undefined {
    if (!title.trim()) return '請填寫同意書標題';
    if (draft.length === 0) return '同意書至少要有一個段落';
    const empty = draft.findIndex((d) => !d.heading.trim());
    if (empty >= 0) return `第 ${empty + 1} 段沒有標題`;
    return undefined;
  }

  async function preview() {
    const msg = validate();
    if (msg) return setError(msg);
    setError(undefined);
    try {
      await openPdfFromRequest(() => previewConsentDraft({ title: title.trim(), sections: toSections(draft) }), 'consent-preview');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '產生預覽失敗');
    }
  }

  async function save() {
    const msg = validate();
    if (msg) {
      setConfirmSave(false);
      return setError(msg);
    }
    setBusy(true);
    setError(undefined);
    try {
      const saved = await saveConsentTemplate({ title: title.trim(), sections: toSections(draft) });
      await reload();
      setBaseVersion(saved.version);
      setSavedSnapshot(snapshot);
      setConfirmSave(false);
      setToast(`已儲存為 ${saved.version}，之後新簽署的顧客會使用這個版本`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '儲存失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function activate(v: ConsentTemplateSummary) {
    if (!window.confirm(`把 ${v.version} 設為使用中？之後新簽署的顧客會使用 ${v.version}。`)) return;
    try {
      await activateConsentTemplate(v.id);
      await reload();
      setToast(`${v.version} 已設為使用中`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '切換版本失敗');
    }
  }

  async function loadForEdit(v: ConsentTemplateSummary) {
    if (dirty && !window.confirm('目前的修改還沒儲存，確定要載入其他版本嗎？')) return;
    await loadVersion(v.id);
    setHistoryOpen(false);
    setToast(`已載入 ${v.version}，修改後會存成新版本`);
  }

  if (allowed === false) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">只有管理員可以管理同意書。</p>;
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      {/* 標題列 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-kiosk-xl font-bold text-slate-900">同意書管理</h1>
          <p className="mt-1 text-base text-slate-600">
            使用中：<strong className="text-kiosk-primary">{active?.version ?? '—'}</strong>
            {baseVersion && baseVersion !== active?.version ? `｜正在編輯 ${baseVersion} 的內容` : ''}
            ・修改後會存成新版本，已簽署的顧客保留當時的內容
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <KioskButton variant="ghost" onClick={() => setHistoryOpen((v) => !v)}>
            🕘 版本紀錄（{versions.length}）
          </KioskButton>
          <KioskButton variant="secondary" onClick={() => void preview()}>
            預覽 PDF
          </KioskButton>
        </div>
      </div>

      {/* 版本紀錄 */}
      {historyOpen && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {versions.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0">
              <span className="text-lg font-bold text-slate-900">{v.version}</span>
              {v.isActive && <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-sm font-bold text-emerald-800">使用中</span>}
              <span className="min-w-0 flex-1 truncate text-base text-slate-700">{v.title}</span>
              <span className="text-sm text-slate-600">
                {v.sectionCount} 段・已簽 {v.signedCount} 位・{new Date(v.createdAt).toLocaleDateString('zh-TW')}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => void openPdfFromRequest(() => previewConsentTemplate(v.id), v.version)} className="rounded-xl px-3 py-2 text-sm font-bold text-kiosk-primary hover:bg-kiosk-primary/10">
                  預覽
                </button>
                <button type="button" onClick={() => void loadForEdit(v)} className="rounded-xl px-3 py-2 text-sm font-bold text-kiosk-primary hover:bg-kiosk-primary/10">
                  載入編輯
                </button>
                {!v.isActive && (
                  <button type="button" onClick={() => void activate(v)} className="rounded-xl px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-50">
                    設為使用中
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {error}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 編輯區 */}
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-bold text-slate-800">同意書標題</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-kiosk-sm rounded-kiosk border-2 border-slate-300 bg-white px-4 text-kiosk-base outline-none focus:border-kiosk-primary"
            />
          </label>

          {draft.map((d, i) => (
            <div key={d.key} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kiosk-primary text-sm font-bold text-white">{i + 1}</span>
                <input
                  data-section-heading
                  value={d.heading}
                  onChange={(e) => update(d.key, { heading: e.target.value })}
                  placeholder="段落標題，例如：一、產品性質與效果差異"
                  className="h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-200 px-3 text-lg font-bold outline-none focus:border-kiosk-primary"
                />
                <IconBtn label="上移" disabled={i === 0} onClick={() => move(i, -1)}>↑</IconBtn>
                <IconBtn label="下移" disabled={i === draft.length - 1} onClick={() => move(i, 1)}>↓</IconBtn>
                <IconBtn label="刪除段落" danger onClick={() => remove(d.key, d.heading)}>✕</IconBtn>
              </div>
              <AutoTextarea
                value={d.body}
                onChange={(v) => update(d.key, { body: v })}
                placeholder="段落內容，每一行是一段（按 Enter 換段）"
              />
              <label className="flex cursor-pointer items-center gap-3 text-base font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={d.requiresSignature}
                  onChange={(e) => update(d.key, { requiresSignature: e.target.checked })}
                  className="h-6 w-6 accent-teal-700"
                />
                此段後面需要顧客簽名「是，了解。客戶簽名」
              </label>
            </div>
          ))}

          <button
            type="button"
            onClick={addSection}
            className="min-h-kiosk rounded-2xl border-2 border-dashed border-kiosk-primary/40 text-kiosk-base font-bold text-kiosk-primary hover:bg-kiosk-primary/5"
          >
            ＋ 新增段落
          </button>
        </div>

        {/* 即時預覽（和顧客簽署時看到的樣式一致） */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-500">即時預覽・共 {draft.length} 段・{signatureCount} 處段落簽名＋結尾簽名</p>
            <h2 className="mb-4 text-center text-kiosk-lg font-bold text-slate-900">{title || '（未填標題）'}</h2>
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
              {draft.map((d, i) => (
                <section key={d.key}>
                  <h3 className="text-lg font-bold text-slate-900">{d.heading || `（第 ${i + 1} 段未命名）`}</h3>
                  {d.body.split('\n').filter((p) => p.trim()).map((p, j) => (
                    <p key={j} className="mt-1 text-base leading-relaxed text-slate-800">{p}</p>
                  ))}
                  {d.requiresSignature && (
                    <p className="mt-2 text-base text-slate-700">
                      是，了解。客戶簽名：<span className="inline-block w-40 border-b border-slate-400">&nbsp;</span>
                    </p>
                  )}
                </section>
              ))}
              <div className="mt-2 border-t border-slate-200 pt-3 text-base text-slate-700">
                <p>客戶簽名：＿＿＿＿＿＿　日期：＿＿＿＿</p>
                <p className="mt-2">服務人員簽章：＿＿＿＿＿＿　日期：＿＿＿＿</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部固定儲存列 */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className={`text-base font-semibold ${dirty ? 'text-amber-700' : 'text-slate-500'}`}>
            {confirmSave
              ? `儲存為 ${nextVersion} 並設為使用中？之後新簽署的顧客會使用這個版本；已簽署的不受影響。`
              : dirty
                ? '● 有未儲存的修改'
                : '沒有未儲存的修改'}
          </p>
          <div className="flex gap-2">
            {confirmSave ? (
              <>
                <KioskButton variant="ghost" onClick={() => setConfirmSave(false)} disabled={busy}>
                  取消
                </KioskButton>
                <KioskButton onClick={() => void save()} disabled={busy}>
                  {busy ? '儲存中…' : `確認儲存 ${nextVersion}`}
                </KioskButton>
              </>
            ) : (
              <KioskButton onClick={() => setConfirmSave(true)} disabled={!dirty}>
                儲存為新版本 {nextVersion}
              </KioskButton>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-28 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-base font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 text-xl font-bold disabled:opacity-30 ${
        danger ? 'border-rose-200 text-rose-600 hover:bg-rose-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

/** 依內容自動長高的 textarea */
function AutoTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={3}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full resize-none rounded-xl border-2 border-slate-200 px-3 py-2 text-base leading-relaxed outline-none focus:border-kiosk-primary"
    />
  );
}
