import { formatGrams } from "@/lib/format";
import { percentOfTarget } from "@/lib/nutrition";

const MACROS = {
  protein: { label: "Protein", color: "bg-blue" },
  carbs: { label: "Carbs", color: "bg-accent" },
  fat: { label: "Fat", color: "bg-purple" },
} as const;

export type MacroKey = keyof typeof MACROS;

export default function MacroBar({
  macro,
  value,
  target,
}: {
  macro: MacroKey;
  value: number;
  target: number;
}) {
  const percent = percentOfTarget(value, target);
  const { label, color } = MACROS[macro];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-navy">{label}</span>
        <span className="text-muted">
          <span className="font-medium text-navy" data-testid={`macro-${macro}`}>
            {formatGrams(value)}
          </span>{" "}
          / {formatGrams(target)} g
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuenow={Math.min(percent, 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full ${color} transition-[width] duration-300`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
