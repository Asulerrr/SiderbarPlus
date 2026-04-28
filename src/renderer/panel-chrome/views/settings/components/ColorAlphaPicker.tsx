import { parseHex8 } from '@shared/theme';

interface Props {
  label: string;
  value: string; // '#RRGGBBAA'
  onChange: (next: string) => void;
}

const toHex2 = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();

export function ColorAlphaPicker({ label, value, onChange }: Props): JSX.Element {
  const { r, g, b, a } = parseHex8(value);
  const rgbHex = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  const alphaPercent = Math.round((a / 255) * 100);

  const updateRgb = (rgb: string): void => {
    const stripped = rgb.replace(/^#/, '').toUpperCase();
    onChange(`#${stripped}${toHex2(a)}`);
  };

  const updateAlpha = (percent: number): void => {
    const alpha = Math.round((percent / 100) * 255);
    onChange(`${rgbHex}${toHex2(alpha)}`);
  };

  return (
    <div className="py-2.5">
      <div className="mb-2.5 text-[13px] tracking-cn text-white/82">{label}</div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={rgbHex}
          onChange={(e) => updateRgb(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-sm border border-white/15 bg-transparent"
        />
        <div className="flex-1">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] tracking-cn text-white/42">不透明度</span>
            <span className="font-mono text-[12px] text-amber">
              {alphaPercent}
              <span className="text-white/40">%</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={alphaPercent}
            onChange={(e) => updateAlpha(Number(e.target.value))}
            className="slider-amber w-full"
          />
        </div>
      </div>
      <div className="mt-2.5 font-mono text-[11px] tracking-wider text-white/35">
        {value}
      </div>
    </div>
  );
}
