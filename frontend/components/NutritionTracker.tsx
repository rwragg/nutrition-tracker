"use client";

import { useReducer, useSyncExternalStore, useState } from "react";
import { Apple } from "lucide-react";
import { createEntryId, dayReducer, initialDay } from "@/lib/day";
import { dayMacros } from "@/lib/nutrition";
import { DAILY_TARGETS } from "@/lib/targets";
import { SECTIONS, type Section } from "@/lib/types";
import AddIngredientDialog from "./AddIngredientDialog";
import AddMealDialog from "./AddMealDialog";
import DaySummary from "./DaySummary";
import SectionCard from "./SectionCard";

type OpenDialog = { section: Section; kind: "ingredient" | "meal" } | null;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** Today's date, read on the client so the prerendered page cannot show a stale one. */
const subscribeToNothing = () => () => {};
const getTodayOnClient = () => dateFormatter.format(new Date());
const getTodayOnServer = () => "";

export default function NutritionTracker() {
  const [day, dispatch] = useReducer(dayReducer, null, initialDay);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const today = useSyncExternalStore(subscribeToNothing, getTodayOnClient, getTodayOnServer);

  const macros = dayMacros(day);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-navy text-accent shadow-md shadow-navy/20 ring-2 ring-accent/40">
            <Apple className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-navy">Nutrition Tracker</h1>
            <p className="text-sm text-muted">{today || "\u00a0"}</p>
          </div>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-accent/60 bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-navy sm:inline-flex">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          Sample day
        </span>
      </header>

      <DaySummary macros={macros} targets={DAILY_TARGETS} />

      <div className="grid gap-6 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <SectionCard
            key={section}
            section={section}
            entries={day[section]}
            onAddIngredient={(target) => setOpenDialog({ section: target, kind: "ingredient" })}
            onAddMeal={(target) => setOpenDialog({ section: target, kind: "meal" })}
            onRemove={(target, id) => dispatch({ type: "entry/remove", section: target, id })}
          />
        ))}
      </div>

      <p className="text-center text-xs text-muted">
        Nothing is saved. Reload the page to start again from the sample day.
      </p>

      {openDialog?.kind === "ingredient" && (
        <AddIngredientDialog
          section={openDialog.section}
          onClose={() => setOpenDialog(null)}
          onAdd={(foodId, quantity) =>
            dispatch({
              type: "ingredient/add",
              id: createEntryId(),
              section: openDialog.section,
              foodId,
              quantity,
            })
          }
        />
      )}

      {openDialog?.kind === "meal" && (
        <AddMealDialog
          section={openDialog.section}
          onClose={() => setOpenDialog(null)}
          onAdd={(mealId) =>
            dispatch({ type: "meal/add", id: createEntryId(), section: openDialog.section, mealId })
          }
        />
      )}
    </main>
  );
}
