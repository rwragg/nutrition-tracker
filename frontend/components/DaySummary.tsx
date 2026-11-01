import { formatCalories } from "@/lib/format";
import { percentOfTarget } from "@/lib/nutrition";
import type { Macros } from "@/lib/types";
import MacroBar from "./MacroBar";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DaySummary({ macros, targets }: { macros: Macros; targets: Macros }) {
  const percent = percentOfTarget(macros.calories, targets.calories);
  const arc = (Math.min(percent, 100) / 100) * CIRCUMFERENCE;
  const remaining = Math.round(targets.calories - macros.calories);
  const over = remaining < 0;

  return (
    <section aria-label="Day summary" className="day-panel p-4 p-sm-5">
      <div className="day-glow-blue" aria-hidden="true" />
      <div className="day-glow-accent" aria-hidden="true" />

      <div className="position-relative row g-4 align-items-center">
        <div className="col-12 col-sm-auto d-flex justify-content-center">
          <div className="position-relative" style={{ width: "9rem", height: "9rem" }}>
            <svg viewBox="0 0 128 128" width="144" height="144" aria-hidden="true">
              <circle
                cx="64"
                cy="64"
                r={RADIUS}
                fill="none"
                strokeWidth="13"
                transform="rotate(-90 64 64)"
                className="ring-track"
              />
              <circle
                cx="64"
                cy="64"
                r={RADIUS}
                fill="none"
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray={`${arc} ${CIRCUMFERENCE}`}
                transform="rotate(-90 64 64)"
                className="ring-arc day-ring-arc"
              />
            </svg>
            <div className="position-absolute top-50 start-50 translate-middle text-center">
              <span className="d-block fw-semibold tabular lh-1" style={{ fontSize: "2.25rem" }} data-testid="day-total-calories">
                {formatCalories(macros.calories)}
              </span>
              <span className="day-label">kcal</span>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2">
            <h2 className="day-label mb-0">Today</h2>
            <p className="mb-0 small text-white opacity-50">
              <span className="fw-semibold text-white" data-testid="day-target-calories">
                {formatCalories(targets.calories)}
              </span>{" "}
              kcal target ·{" "}
              <span className={`fw-semibold ${over ? "text-warning" : "text-white"}`}>
                {formatCalories(Math.abs(remaining))} {over ? "over" : "left"}
              </span>
            </p>
          </div>

          <div className="row g-3 mt-3">
            <div className="col-12 col-sm-4">
              <MacroBar tone="dark" macro="protein" value={macros.protein} target={targets.protein} />
            </div>
            <div className="col-12 col-sm-4">
              <MacroBar tone="dark" macro="carbs" value={macros.carbs} target={targets.carbs} />
            </div>
            <div className="col-12 col-sm-4">
              <MacroBar tone="dark" macro="fat" value={macros.fat} target={targets.fat} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
