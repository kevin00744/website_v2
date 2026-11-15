import { type InputHTMLAttributes, forwardRef } from 'react';

interface KioskInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
  isValid?: boolean;
  required?: boolean;
}

export const KioskInput = forwardRef<HTMLInputElement, KioskInputProps>(
  ({ label, errorMessage, isValid, required, className = '', id, name, ...props }, ref) => {
    const inputId = id ?? name;
    const hasError = Boolean(errorMessage);

    const borderClass = hasError
      ? 'border-kiosk-danger focus:border-kiosk-danger focus:ring-kiosk-danger/20'
      : isValid
        ? 'border-kiosk-success focus:border-kiosk-success focus:ring-kiosk-success/20'
        : 'border-slate-300 focus:border-kiosk-primary focus:ring-kiosk-primary/20';

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-kiosk-base font-semibold text-slate-700">
          {label}
          {required && (
            <span className="ml-1 text-kiosk-danger" aria-hidden="true">*</span>
          )}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            name={name}
            className={`min-h-kiosk-sm w-full rounded-kiosk border-2 bg-white px-4 text-kiosk-base text-slate-900 outline-none ring-0 transition focus:ring-4 ${borderClass} ${className}`}
            aria-invalid={hasError}
            {...props}
          />
          {isValid && !hasError && (
            <span
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xl text-kiosk-success"
              aria-hidden="true"
            >
              ✓
            </span>
          )}
        </div>
        {hasError && (
          <p className="text-sm font-semibold text-kiosk-danger" role="alert">
            ⚠️ {errorMessage}
          </p>
        )}
      </div>
    );
  },
);
KioskInput.displayName = 'KioskInput';
