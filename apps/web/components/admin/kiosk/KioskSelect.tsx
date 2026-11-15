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

export const KioskSelect = forwardRef<HTMLSelectElement, KioskSelectProps>(
  ({ label, options, placeholder, errorMessage, isValid, required, className = '', id, name, ...props }, ref) => {
    const selectId = id ?? name;
    const hasError = Boolean(errorMessage);

    const borderClass = hasError
      ? 'border-kiosk-danger focus:border-kiosk-danger focus:ring-kiosk-danger/20'
      : isValid
        ? 'border-kiosk-success focus:border-kiosk-success focus:ring-kiosk-success/20'
        : 'border-slate-300 focus:border-kiosk-primary focus:ring-kiosk-primary/20';

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-kiosk-base font-semibold text-slate-700">
          {label}
          {required && (
            <span className="ml-1 text-kiosk-danger" aria-hidden="true">*</span>
          )}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            name={name}
            className={`min-h-kiosk-sm w-full appearance-none rounded-kiosk border-2 bg-white px-4 pr-10 text-kiosk-base text-slate-900 outline-none ring-0 transition focus:ring-4 ${borderClass} ${className}`}
            aria-invalid={hasError}
            defaultValue=""
            {...props}
          >
            {placeholder && (
              <option value="" disabled>{placeholder}</option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {/* chevron icon */}
          {!(isValid && !hasError) && (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
          )}
          {isValid && !hasError && (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-kiosk-success" aria-hidden="true">✓</span>
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
KioskSelect.displayName = 'KioskSelect';
