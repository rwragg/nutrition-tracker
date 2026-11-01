import { formatCalories } from "@/lib/format";
import { percentOfTarget } from "@/lib/nutrition";
import type { Macros } from "@/lib/types";
import MacroBar from "./MacroBar";
import { CARD } from "./styles";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DaySummary({ macros, targets }: { macros: Macros; targets: Macros }) {
  const percent = percentOfTarget(macros.calories, targets.calories);
  const arc = (Math.min(percent, 100) / 100) * CIRCUMFERENCE;
  const remaining = Math.round(targets.calories - macros.calories);

  return (
    <section aria-label="Day summary" className={`${CARD} p-5 sm:p-6`}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="relative size-32 shrink-0 self-center sm:self-auto">
          <svg viewBox="0 0 128 128" className="size-32 -rotate-90" aria-hidden="true">
            <circle cx="64" cy="64" r={RADIUS} fill="none" strokeWidth="12" className="stroke-hairline" />
            <circle
              cx="64"
              cy="64"
              r={RADIUS}
              fill="none"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${arc} ${CIRCUMFERENCE}`}
              className="stroke-accent transition-[stroke-dasharray] duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-navy" data-testid="day-total-calories">
              {formatCalories(macros.calories)}
            </span>
            <span className="text-[0.65rem] font-medium uppercase tracking-widest text-muted">kcal</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Today</h2>
            <p className="text-sm text-muted">
              <span data-testid="day-target-calories">{formatCalories(targets.calories)}</span> kcal target
              {remaining >= 0 ? ` \u00b7 ${formatCalories(remaining)} left` : ` \u00b7 ${formatCalories(-remaining)} over`}
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3 sm:gap-5">
            <MacroBar macro="protein" value={macros.protein} target={targets.protein} />
            <MacroBar macro="carbs" value={macros.carbs} target={targets.carbs} />
            <MacroBar macro="fat" value={macros.fat} target={targets.fat} />
          </div>
        </div>
      </div>
    </section>
  );
}
