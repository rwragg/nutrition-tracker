"use client";

import { useState } from "react";
import { dayLabel, toIsoDate } from "@/lib/dates";
import { formatCalories } from "@/lib/format";
import { dayMacros } from "@/lib/nutrition";
import { DAILY_TARGETS } from "@/lib/targets";
import {
  SECTIONS,
  type Day,
  type EntryDraft,
  type FoodCandidate,
  type SaveResult,
  type Section,
  type Store,
} from "@/lib/types";
import AddFoodDialog from "./AddFoodDialog";
import AddMealDialog from "./AddMealDialog";
import LookUpFoodDialog from "./LookUpFoodDialog";
import DaySummary from "./DaySummary";
import SectionCard from "./SectionCard";

type OpenDialog =
  | { kind: "food"; section: Section; foodId?: string }
  | { kind: "meal"; section: Section }
  | { kind: "lookup"; section: Section }
  | null;

export default function DayView({
  store,
  day,
  onSelectDay,
  onAddEntry,
  onAddLookedUpFood,
  onRemoveEntry,
}: {
  store: Store;
  day: Day;
  onSelectDay: (date: string) => void;
  onAddEntry: (section: Section, draft: EntryDraft) => Promise<SaveResult>;
  onAddLookedUpFood: (
    section: Section,
    candidate: FoodCandidate,
    grams: number,
    unchanged: boolean,
  ) => Promise<SaveResult>;
  onRemoveEntry: (section: Section, entryId: string) => Promise<SaveResult>;
}) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const todayIso = toIsoDate(new Date());

  return (
    <>
      {problem && (
        <p className="small text-ember mb-0" data-testid="day-problem">
          {problem}
        </p>
      )}

      <section aria-label="Days" className="d-flex flex-wrap gap-2" data-testid="day-switcher">
        {store.days.map((candidate) => (
          <button
            key={candidate.date}
            type="button"
            aria-pressed={candidate.date === day.date}
            data-testid={`day-${candidate.date}`}
            onClick={() => onSelectDay(candidate.date)}
            className="day-chip"
          >
            <span className="d-block fw-semibold small">{dayLabel(candidate.date, todayIso)}</span>
            <span className="day-chip-kcal">
              <span data-testid={`day-${candidate.date}-calories`}>
                {formatCalories(candidate.macros.calories)}
              </span>{" "}
              kcal
            </span>
          </button>
        ))}
      </section>

      <DaySummary macros={dayMacros(day, store)} targets={DAILY_TARGETS} />

      <div className="row g-4">
        {SECTIONS.map((section) => (
          <div key={section} className="col-12 col-lg-6">
            <SectionCard
              section={section}
              day={day}
              store={store}
              onAddFood={(target) => setOpenDialog({ kind: "food", section: target })}
              onAddMeal={(target) => setOpenDialog({ kind: "meal", section: target })}
              onRemoveEntry={(target, entryId) => {
                void onRemoveEntry(target, entryId).then((result) => {
                  setProblem(result.ok ? null : result.message);
                });
              }}
            />
          </div>
        ))}
      </div>

      {openDialog?.kind === "food" && (
        <AddFoodDialog
          section={openDialog.section}
          store={store}
          initialFoodId={openDialog.foodId}
          onLookUp={() => setOpenDialog({ kind: "lookup", section: openDialog.section })}
          onClose={() => setOpenDialog(null)}
          onAdd={(foodId, quantity) => {
            const section = openDialog.section;
            void onAddEntry(section, { kind: "food", foodId, quantity }).then((result) => {
              setProblem(result.ok ? null : result.message);
            });
          }}
        />
      )}

      {openDialog?.kind === "lookup" && (
        <LookUpFoodDialog
          section={openDialog.section}
          store={store}
          onAddExisting={(food) => setOpenDialog({ kind: "food", section: openDialog.section, foodId: food.id })}
          onAdd={(candidate, grams, unchanged) =>
            onAddLookedUpFood(openDialog.section, candidate, grams, unchanged)
          }
          onClose={() => setOpenDialog(null)}
        />
      )}

      {openDialog?.kind === "meal" && (
        <AddMealDialog
          section={openDialog.section}
          store={store}
          onClose={() => setOpenDialog(null)}
          onAdd={(mealId) => {
            const section = openDialog.section;
            void onAddEntry(section, { kind: "meal", mealId }).then((result) => {
              setProblem(result.ok ? null : result.message);
            });
          }}
        />
      )}
    </>
  );
}
