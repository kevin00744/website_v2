export type ButtonVariant = 'primary' | 'outline';
export type ButtonAlignment = 'left' | 'center' | 'right';

export interface ButtonBlockProps {
  label: string;
  url: string;
  variant: ButtonVariant;
  alignment: ButtonAlignment;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-kiosk-primary text-white hover:bg-kiosk-primary-dark',
  outline: 'border-2 border-kiosk-primary text-kiosk-primary hover:bg-kiosk-primary/5',
};

const ALIGNMENT_CLASS: Record<ButtonAlignment, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

export function ButtonBlock({ label, url, variant, alignment }: ButtonBlockProps) {
  if (!label || !url) return null;
  return (
    <div className={`flex w-full px-6 py-6 ${ALIGNMENT_CLASS[alignment]}`}>
      <a
        href={url}
        className={`inline-flex rounded-full px-8 py-3 text-base font-bold transition-colors ${VARIANT_CLASS[variant]}`}
      >
        {label}
      </a>
    </div>
  );
}
