interface RadioOption<T extends string> {
  value: T;
  label: string;
}

interface RadioProps<T extends string> {
  label: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (next: T) => void;
  textColor: string;
  mutedColor: string;
}

export function Radio<T extends string>({ label, options, value, onChange, textColor, mutedColor }: RadioProps<T>): JSX.Element {
  return (
    <div className="py-2.5">
      <div className="mb-2.5 text-[13px] tracking-cn" style={{ color: textColor }}>{label}</div>
      <div className="inline-flex rounded-full p-0.5" style={{ backgroundColor: 'rgba(128,128,128,0.14)' }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="rounded-full px-3.5 py-1.5 text-[12px] tracking-cn font-medium transition-all"
              style={{
                color: active ? '#0A0A0A' : mutedColor,
                backgroundColor: active ? '#4CC2FF' : 'transparent',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
