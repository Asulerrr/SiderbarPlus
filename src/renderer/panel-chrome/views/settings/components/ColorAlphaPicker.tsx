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
    <div className="py-2">
      <div className="mb-2 text-sm">{label}</div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={rgbHex}
          onChange={(e) => updateRgb(e.target.value)}
          className="h-9 w-14 cursor-pointer rounded border border-white/15 bg-transparent"
        />
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-xs text-white/70">
            <span>不透明度</span>
            <span>{alphaPercent}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={alphaPercent}
            onChange={(e) => updateAlpha(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
      </div>
      <div className="mt-2 text-xs text-white/50">{value}</div>
    </div>
  );
}
