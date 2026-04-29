import { parseHex8 } from '@shared/theme';

interface Props {
  label: string;
  value: string; // '#RRGGBBAA'
  onChange: (next: string) => void;
}

const toHex2 = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();

export function ColorAlphaPicker({ label, value, onChange }: Props): JSX.Element {
  const { r, g, b } = parseHex8(value);
  const rgbHex = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;

  const updateRgb = (rgb: string): void => {
    const stripped = rgb.replace(/^#/, '').toUpperCase();
    onChange(`#${stripped}FF`);
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
        <span className="font-mono text-[11px] tracking-wider text-white/35">
          {rgbHex.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
