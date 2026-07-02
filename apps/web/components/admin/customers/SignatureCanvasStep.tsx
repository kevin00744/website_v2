'use client';

import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import type { DisclaimerTemplate } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getDisclaimerTemplate } from '@/lib/customers-api';
import { KioskButton } from '../kiosk/KioskButton';

export interface SignaturePayload {
  signatureImageUrl: string;
  signaturePoints: { x: number; y: number }[];
}

interface SignatureCanvasStepProps {
  customerName: string;
  submitting: boolean;
  errorMessage?: string;
  onConfirm: (payload: SignaturePayload) => void;
  onBack: () => void;
}

/** 簽名軌跡至少要有這麼多筆觸座標，跟後端 MIN_SIGNATURE_POINTS 對齊，避免手滑點一下就送出空簽名 */
const MIN_SIGNATURE_POINTS = 10;

/**
 * 建檔流程裡的第二個簽署步驟：動態抓目前生效中的同意書條款，由「顧客」完整閱讀全文後在
 * 最下方簽名——順序是服務人員先在上一步（StaffSignatureStep.tsx）簽過名，這一步才輪到顧客。
 * 這裡按「確認送出」之後，NewCustomerWizard 會把服務人員的簽名（上一步存的 state）跟這裡的
 * 顧客簽名一起送出：先呼叫 createCustomerWithSignature 建檔＋記服務人員簽名，緊接著呼叫
 * signDisclaimer 補上顧客簽名，兩個 API 都成功才算完成。真正的 PDF 排版與簽名疊圖、以及要
 * 凍結進 Signature.contentSnapshot 的條款內容，全部由後端重新查一次目前生效的條款來產生——
 * 這裡抓 template 純粹是「顯示給顧客閱讀」，不是存證用的副本。
 *
 * 整個元件跟著外層 NewCustomerWizard／CenteredModal 共用同一個滾動容器（不在這裡自己加
 * overflow-y-auto／h-full）——同意書內容、簽名欄位、按鈕都是平鋪在同一個 flex 直排裡，
 * 手機上要先完整看過同意書條款（字級加大，好讀），往下滑到最後才會看到簽名欄位跟按鈕，
 * 這是刻意的順序安排，不是排版疏漏。之前在這裡多包一層 overflow-y-auto 會跟外層 Modal
 * 既有的滾動容器疊在一起，導致切換步驟時畫面跳動，所以拿掉。
 */
export function SignatureCanvasStep({
  customerName,
  submitting,
  errorMessage,
  onConfirm,
  onBack,
}: SignatureCanvasStepProps) {
  const padRef = useRef<SignatureCanvas>(null);
  const [template, setTemplate] = useState<DisclaimerTemplate>();
  const [loadError, setLoadError] = useState<string>();
  const [localError, setLocalError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    getDisclaimerTemplate()
      .then((result) => {
        if (!cancelled) setTemplate(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof ApiError ? error.message : '載入同意書內容失敗，請稍後再試');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleClear() {
    padRef.current?.clear();
    setLocalError(undefined);
  }

  function handleConfirm() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setLocalError('沒有偵測到簽名，請在框框裡簽名後再按確認');
      return;
    }

    const points = pad
      .toData()
      .flatMap((stroke) => stroke.map((point) => ({ x: point.x, y: point.y })));

    if (points.length < MIN_SIGNATURE_POINTS) {
      setLocalError('簽名看起來太小或太短，請重新簽一次完整的簽名');
      return;
    }

    setLocalError(undefined);
    onConfirm({
      signatureImageUrl: pad.getTrimmedCanvas().toDataURL('image/png'),
      signaturePoints: points,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-kiosk border-2 border-slate-200 bg-slate-50 p-6 text-lg leading-relaxed text-slate-700 md:text-kiosk-base">
        {loadError && (
          <p className="font-semibold text-kiosk-danger" role="alert">
            ⚠️ {loadError}
          </p>
        )}
        {!template && !loadError && <p className="text-slate-500">同意書內容載入中…</p>}
        {template && (
          <>
            <h3 className="mb-3 text-xl font-bold text-slate-900 md:text-kiosk-lg">{template.title}</h3>
            <p className="mb-4">客戶：{customerName}（請完整閱讀以上內容後在下方簽名）</p>
            {template.sections.map((section) => (
              <div key={section.heading} className="mb-4">
                <h4 className="mb-1 font-bold text-slate-900">{section.heading}</h4>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-wrap leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-kiosk-base font-bold text-slate-800">請顧客在下方簽名</p>
        <div className="rounded-kiosk border-4 border-slate-300 bg-white" style={{ touchAction: 'none' }}>
          <SignatureCanvas
            ref={padRef}
            canvasProps={{ className: 'h-72 w-full rounded-kiosk' }}
            minWidth={2}
            maxWidth={4}
          />
        </div>
        {localError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {localError}
          </p>
        )}
        {errorMessage && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {errorMessage}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <KioskButton variant="primary" fullWidth onClick={handleConfirm} disabled={submitting || !template}>
          {submitting ? '送出中…' : '確認送出'}
        </KioskButton>
        <KioskButton variant="ghost" fullWidth onClick={handleClear} disabled={submitting}>
          重簽
        </KioskButton>
        <KioskButton variant="ghost" fullWidth onClick={onBack} disabled={submitting}>
          上一步
        </KioskButton>
      </div>
    </div>
  );
}
