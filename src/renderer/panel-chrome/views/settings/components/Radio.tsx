interface RadioOption<T extends string> {
  value: T;
  label: string;
}

interface RadioProps<T extends string> {
  label: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

export function Radio<T extends string>({ label, options, value, onChange }: RadioProps<T>): JSX.Element {
  return (
    <div className="py-2.5">
      <div className="mb-2.5 text-[13px] tracking-cn text-white/82">{label}</div>
      <div className="flex gap-1">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`relative px-3 py-1.5 text-[13px] tracking-cn transition-colors ${
                active ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {opt.label}
              <span
                className={`absolute bottom-0 left-0 h-[2px] transition-all ${
                  active
                    ? 'right-0 bg-amber'
                    : 'right-full bg-amber/0'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
