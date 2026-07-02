'use client';

import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { IMaskInput } from 'react-imask';

interface MaskedPhoneInputProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label: string;
  errorMessage?: string;
}

/**
 * 手機號碼專用的防呆輸入框：用 react-imask 自動補上 0000-000-000 的分組格式
 * （09 開頭的限制交給 zod 的 phoneSchema 驗證，這裡只負責邊打邊自動加 dash，
 * 讓門市人員不需要自己手動輸入符號）。
 */
export function MaskedPhoneInput<T extends FieldValues>({
  name,
  control,
  label,
  errorMessage,
}: MaskedPhoneInputProps<T>) {
  const hasError = Boolean(errorMessage);

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { value, onChange, onBlur, ref }, fieldState: { isDirty } }) => {
        const isValid = isDirty && !hasError && Boolean(value);
        const borderClass = hasError
          ? 'border-kiosk-danger focus:border-kiosk-danger'
          : isValid
            ? 'border-kiosk-success focus:border-kiosk-success'
            : 'border-slate-300 focus:border-kiosk-primary';

        return (
          <div className="flex flex-col gap-2">
            <label htmlFor={name} className="text-kiosk-base font-bold text-slate-800">
              {label}
            </label>
            <div className="relative">
              <IMaskInput
                id={name}
                mask="0000-000-000"
                inputRef={ref}
                value={value ?? ''}
                unmask={false}
                onAccept={(maskedValue: string) => onChange(maskedValue)}
                onBlur={onBlur}
                inputMode="numeric"
                placeholder="09XX-XXX-XXX"
                aria-invalid={hasError}
                className={`min-h-kiosk w-full rounded-kiosk border-4 bg-white px-5 text-kiosk-base text-slate-900 outline-none transition-colors ${borderClass}`}
              />
              {isValid && (
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
      }}
    />
  );
}
