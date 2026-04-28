interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span className="text-[13px] tracking-cn text-white/82">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[40px] rounded-sm transition-colors ${
          checked
            ? 'bg-amber'
            : 'border border-white/15 bg-transparent hover:border-white/25'
        }`}
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-[2px] transition-transform ${
            checked
              ? 'translate-x-[20px] bg-black'
              : 'translate-x-[3px] bg-white/55'
          }`}
        />
      </button>
    </label>
  );
}
