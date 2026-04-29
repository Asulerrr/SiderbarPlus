interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  onChange: (next: number) => void;
  textColor: string;
}

export function Slider({ label, min, max, step = 1, value, unit, onChange, textColor }: SliderProps): JSX.Element {
  return (
    <div className="py-2.5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] tracking-cn" style={{ color: textColor }}>{label}</span>
        <span className="font-mono text-[12px] text-accent">
          {value}
          {unit ? <span style={{ color: textColor, opacity: 0.4 }}>{unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-accent w-full"
      />
    </div>
  );
}
