"use client";

import { useState } from "react";
import { dayLabel } from "@/lib/dates";
import { formatCalories } from "@/lib/format";
import { dayMacros } from "@/lib/nutrition";
import { createId } from "@/lib/store";
import { DAILY_TARGETS } from "@/lib/targets";
import { SECTIONS, type Day, type LogEntry, type Section, type Store } from "@/lib/types";
import AddFoodDialog from "./AddFoodDialog";
import AddMealDialog from "./AddMealDialog";
import DaySummary from "./DaySummary";
import SectionCard from "./SectionCard";

type OpenDialog = { kind: "food" | "meal"; section: Section } | null;

export default function DayView({
  store,
  day,
  onSelectDay,
  onAddEntry,
  onRemoveEntry,
}: {
  store: Store;
  day: Day;
  onSelectDay: (dayId: string) => void;
  onAddEntry: (section: Section, entry: LogEntry) => void;
  onRemoveEntry: (section: Section, entryId: string) => void;
}) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const todayIso = store.days[0]?.date ?? day.date;

  return (
    <>
      <section aria-label="Days" className="flex flex-wrap gap-2" data-testid="day-switcher">
        {store.days.map((candidate) => {
          const active = candidate.id === day.id;
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={active}
              data-testid={`day-${candidate.id}`}
              onClick={() => onSelectDay(candidate.id)}
              className={`flex flex-col items-start rounded-2xl border px-4 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
                active
                  ? "border-navy bg-navy text-white shadow-md shadow-navy/20"
                  : "border-hairline bg-white text-navy hover:border-blue"
              }`}
            >
              <span className="text-sm font-semibold">{dayLabel(candidate.date, todayIso)}</span>
              <span className={`text-xs tabular-nums ${active ? "text-accent" : "text-muted"}`}>
                <span data-testid={`day-${candidate.id}-calories`}>
                  {formatCalories(dayMacros(candidate, store).calories)}
                </span>{" "}
                kcal
              </span>
            </button>
          );
        })}
      </section>

      <DaySummary macros={dayMacros(day, store)} targets={DAILY_TARGETS} />

      <div className="grid gap-6 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <SectionCard
            key={section}
            section={section}
            day={day}
            store={store}
            onAddFood={(target) => setOpenDialog({ kind: "food", section: target })}
            onAddMeal={(target) => setOpenDialog({ kind: "meal", section: target })}
            onRemoveEntry={onRemoveEntry}
          />
        ))}
      </div>

      {openDialog?.kind === "food" && (
        <AddFoodDialog
          section={openDialog.section}
          store={store}
          onClose={() => setOpenDialog(null)}
          onAdd={(foodId, quantity) =>
            onAddEntry(openDialog.section, {
              id: createId("entry"),
              kind: "food",
              foodId,
              quantity,
            })
          }
        />
      )}

      {openDialog?.kind === "meal" && (
        <AddMealDialog
          section={openDialog.section}
          store={store}
          onClose={() => setOpenDialog(null)}
          onAdd={(mealId) =>
            onAddEntry(openDialog.section, { id: createId("entry"), kind: "meal", mealId })
          }
        />
      )}
    </>
  );
}
