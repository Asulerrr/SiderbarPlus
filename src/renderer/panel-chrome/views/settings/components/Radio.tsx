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
    <div className="py-2">
      <div className="mb-2 text-sm">{label}</div>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              value === opt.value
                ? 'border-accent bg-accent/10 text-white'
                : 'border-white/15 text-white/70 hover:border-white/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
