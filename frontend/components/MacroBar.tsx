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
  tone = "light",
}: {
  macro: MacroKey;
  value: number;
  target: number;
  tone?: "light" | "dark";
}) {
  const percent = percentOfTarget(value, target);
  const { label, color } = MACROS[macro];
  const dark = tone === "dark";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={dark ? "font-medium text-white/75" : "font-medium text-navy"}>{label}</span>
        <span className={dark ? "text-white/55" : "text-muted"}>
          <span
            className={`font-semibold tabular-nums ${dark ? "text-white" : "text-navy"}`}
            data-testid={`macro-${macro}`}
          >
            {formatGrams(value)}
          </span>{" "}
          / {formatGrams(target)} g
        </span>
      </div>
      <div
        className={`mt-1.5 h-2.5 overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-canvas"}`}
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
