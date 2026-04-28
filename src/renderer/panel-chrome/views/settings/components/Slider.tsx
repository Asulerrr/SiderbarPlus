interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  onChange: (next: number) => void;
}

export function Slider({ label, min, max, step = 1, value, unit, onChange }: SliderProps): JSX.Element {
  return (
    <div className="py-2.5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] tracking-cn text-white/82">{label}</span>
        <span className="font-mono text-[12px] text-amber">
          {value}
          {unit ? <span className="text-white/40">{unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-amber w-full"
      />
    </div>
  );
}
