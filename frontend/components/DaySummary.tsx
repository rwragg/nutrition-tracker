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
    <section
      aria-label="Day summary"
      className="relative overflow-hidden rounded-3xl bg-navy px-5 py-6 text-white shadow-xl shadow-navy/20 sm:px-8 sm:py-8"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-24 size-64 rounded-full bg-blue/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-accent/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
        <div className="relative size-36 shrink-0 self-center sm:self-auto">
          <svg viewBox="0 0 128 128" className="size-36 -rotate-90" aria-hidden="true">
            <circle cx="64" cy="64" r={RADIUS} fill="none" strokeWidth="13" className="stroke-white/15" />
            <circle
              cx="64"
              cy="64"
              r={RADIUS}
              fill="none"
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray={`${arc} ${CIRCUMFERENCE}`}
              className="stroke-accent transition-[stroke-dasharray] duration-500"
              style={{ filter: "drop-shadow(0 0 5px rgba(236, 173, 10, 0.55))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-4xl font-semibold tabular-nums tracking-tight text-white"
              data-testid="day-total-calories"
            >
              {formatCalories(macros.calories)}
            </span>
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-accent">
              kcal
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Today</h2>
            <p className="text-sm text-white/60">
              <span className="font-semibold tabular-nums text-white" data-testid="day-target-calories">
                {formatCalories(targets.calories)}
              </span>{" "}
              kcal target ·{" "}
              <span className={over ? "font-semibold text-accent" : "font-semibold text-white"}>
                {formatCalories(Math.abs(remaining))} {over ? "over" : "left"}
              </span>
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3 sm:gap-6">
            <MacroBar tone="dark" macro="protein" value={macros.protein} target={targets.protein} />
            <MacroBar tone="dark" macro="carbs" value={macros.carbs} target={targets.carbs} />
            <MacroBar tone="dark" macro="fat" value={macros.fat} target={targets.fat} />
          </div>
        </div>
      </div>
    </section>
  );
}
