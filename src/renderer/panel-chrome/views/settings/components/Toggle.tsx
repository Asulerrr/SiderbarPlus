interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  textColor: string;
}

export function Toggle({ label, checked, onChange, textColor }: ToggleProps): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span className="text-[13px] tracking-cn" style={{ color: textColor }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-[24px] w-[48px] shrink-0 rounded-full transition-colors overflow-hidden"
        style={{
          backgroundColor: checked ? '#4CC2FF' : 'rgba(255,255,255,0.10)',
          boxShadow: checked ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.12)'
        }}
      >
        <span
          className="absolute top-[2px] h-[20px] w-[20px] rounded-full bg-white transition-all duration-200"
          style={{
            left: checked ? 26 : 2,
            boxShadow: '0 1px 2px rgba(0,0,0,0.18)'
          }}
        />
      </button>
    </label>
  );
}
