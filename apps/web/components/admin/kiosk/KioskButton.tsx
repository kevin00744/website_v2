import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface KioskButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-kiosk-primary text-white hover:bg-kiosk-primary-dark disabled:bg-slate-300',
  secondary:
    'bg-white text-kiosk-primary border-2 border-kiosk-primary hover:bg-kiosk-primary/5 disabled:border-slate-300 disabled:text-slate-400',
  danger: 'bg-kiosk-danger text-white hover:bg-red-700 disabled:bg-slate-300',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-300',
};

/** 最小觸控區 64px 起，字級放大一階，按下去要讓門市人員一眼就確定有按到。 */
export const KioskButton = forwardRef<HTMLButtonElement, KioskButtonProps>(
  ({ variant = 'primary', fullWidth, type = 'button', className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={`min-h-kiosk min-w-kiosk rounded-kiosk px-8 text-kiosk-base font-bold transition-colors disabled:cursor-not-allowed ${
          fullWidth ? 'w-full' : ''
        } ${VARIANT_CLASS[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);
KioskButton.displayName = 'KioskButton';
