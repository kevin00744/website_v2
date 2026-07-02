import { type SelectHTMLAttributes, forwardRef } from 'react';

interface KioskSelectOption {
  value: string;
  label: string;
}

interface KioskSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: KioskSelectOption[];
  placeholder?: string;
  errorMessage?: string;
  isValid?: boolean;
  required?: boolean;
}

/** 跟 KioskInput 同一套防呆規則：紅框+白話文錯誤；正確時綠框+打勾 */
export const KioskSelect = forwardRef<HTMLSelectElement, KioskSelectProps>(
  ({ label, options, placeholder, errorMessage, isValid, required, className = '', id, name, ...props }, ref) => {
    const selectId = id ?? name;
    const hasError = Boolean(errorMessage);

    const borderClass = hasError
      ? 'border-kiosk-danger focus:border-kiosk-danger'
      : isValid
        ? 'border-kiosk-success focus:border-kiosk-success'
        : 'border-slate-300 focus:border-kiosk-primary';

    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={selectId} className="text-kiosk-base font-bold text-slate-800">
          {label}
          {required && (
            <span className="ml-1 text-kiosk-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            name={name}
            className={`min-h-kiosk w-full appearance-none rounded-kiosk border-4 bg-white px-5 text-kiosk-base text-slate-900 outline-none transition-colors ${borderClass} ${className}`}
            aria-invalid={hasError}
            defaultValue=""
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {isValid && !hasError && (
            <span
              className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-2xl text-kiosk-success"
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
KioskSelect.displayName = 'KioskSelect';
