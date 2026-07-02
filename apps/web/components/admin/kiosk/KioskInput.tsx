import { type InputHTMLAttributes, forwardRef } from 'react';

interface KioskInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
  /** 是否顯示綠框＋打勾，通常是「使用者已經動過這個欄位」且目前沒有錯誤時才設 true */
  isValid?: boolean;
  /** 必填欄位在標籤後面加紅色星號，門市人員一看就知道哪些不能空白 */
  required?: boolean;
}

/**
 * 防呆規則：紅框 + ⚠️ + 白話文錯誤訊息（不可顯示英文/技術字眼）；正確時綠框 + 打勾。
 * 顏色本身就是回饋，不懂技術的人不需要看懂錯誤文字才知道哪裡錯。
 */
export const KioskInput = forwardRef<HTMLInputElement, KioskInputProps>(
  ({ label, errorMessage, isValid, required, className = '', id, name, ...props }, ref) => {
    const inputId = id ?? name;
    const hasError = Boolean(errorMessage);

    const borderClass = hasError
      ? 'border-kiosk-danger focus:border-kiosk-danger'
      : isValid
        ? 'border-kiosk-success focus:border-kiosk-success'
        : 'border-slate-300 focus:border-kiosk-primary';

    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-kiosk-base font-bold text-slate-800">
          {label}
          {required && (
            <span className="ml-1 text-kiosk-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            name={name}
            className={`min-h-kiosk w-full rounded-kiosk border-4 bg-white px-5 text-kiosk-base text-slate-900 outline-none transition-colors ${borderClass} ${className}`}
            aria-invalid={hasError}
            {...props}
          />
          {isValid && !hasError && (
            <span
              className="absolute right-5 top-1/2 -translate-y-1/2 text-2xl text-kiosk-success"
              aria-hidden="true"
            >
              ✓
            </span>
          )}
        </div>
        {hasError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {errorMessage}
          </p>
        )}
      </div>
    );
  },
);
KioskInput.displayName = 'KioskInput';
