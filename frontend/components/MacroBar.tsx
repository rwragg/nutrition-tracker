import { formatGrams } from "@/lib/format";
import { percentOfTarget } from "@/lib/nutrition";

const MACROS = {
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
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
  /** Null shows the total alone: a person with a profile has calorie and protein targets and no others (D30). */
  target: number | null;
  tone?: "light" | "dark";
}) {
  const percent = target === null ? 0 : percentOfTarget(value, target);
  const dark = tone === "dark";

  return (
    <div>
      <div className="d-flex align-items-baseline justify-content-between gap-2 small">
        <span className={dark ? "text-white opacity-75" : "fw-medium text-muted-brand"}>
          {MACROS[macro]}
        </span>
        <span className={dark ? "text-white opacity-50" : "text-muted-brand"}>
          <span className={`fw-semibold tabular ${dark ? "text-white" : ""}`} data-testid={`macro-${macro}`}>
            {formatGrams(value)}
          </span>{" "}
          {target === null ? (
            "g"
          ) : (
            <>
              / <span data-testid={`macro-${macro}-target`}>{formatGrams(target)}</span> g
            </>
          )}
        </span>
      </div>
      {target !== null && (
        <div
          className={`macro-track mt-2 ${dark ? "macro-track-dark" : ""}`}
          role="progressbar"
          aria-label={`${MACROS[macro]} progress`}
          aria-valuenow={Math.min(percent, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`macro-fill macro-${macro}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
