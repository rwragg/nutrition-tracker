"use client";

import { Plus, UtensilsCrossed } from "lucide-react";
import { formatCalories } from "@/lib/format";
import { sectionMacros } from "@/lib/nutrition";
import { SECTION_LABELS, type Day, type Section, type Store } from "@/lib/types";
import EntryRow from "./EntryRow";
import { BTN_ACTION, BTN_COMMIT } from "./styles";

export default function SectionCard({
  section,
  day,
  store,
  onAddFood,
  onAddMeal,
  onRemoveEntry,
}: {
  section: Section;
  day: Day;
  store: Store;
  onAddFood: (section: Section) => void;
  onAddMeal: (section: Section) => void;
  onRemoveEntry: (section: Section, entryId: string) => void;
}) {
  const label = SECTION_LABELS[section];
  const entries = day.sections[section];
  const calories = sectionMacros(day, section, store).calories;

  return (
    <article className="section-card d-flex flex-column" data-section={section} data-testid={`section-${section}`}>
      <div className="section-strip" aria-hidden="true" />

      <header className="section-head d-flex align-items-baseline justify-content-between gap-3 px-4 py-3">
        <h2 className="h5 fw-semibold mb-0">{label}</h2>
        <p className="mb-0 small text-muted-brand">
          <span className="fw-semibold tabular" data-testid={`section-${section}-calories`}>
            {formatCalories(calories)}
          </span>{" "}
          kcal
        </p>
      </header>

      <ul className="list-unstyled mb-0 flex-grow-1">
        {entries.length === 0 ? (
          <li className="px-4 py-5 text-center small text-muted-brand">Nothing logged yet.</li>
        ) : (
          entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              section={section}
              store={store}
              onRemove={(entryId) => onRemoveEntry(section, entryId)}
            />
          ))
        )}
      </ul>

      <footer className="d-flex flex-wrap gap-2 border-top px-4 py-3">
        <button type="button" aria-label={`Add food to ${label}`} onClick={() => onAddFood(section)} className={BTN_ACTION}>
          <Plus size={14} aria-hidden="true" />
          Food
        </button>
        <button type="button" aria-label={`Add meal to ${label}`} onClick={() => onAddMeal(section)} className={BTN_COMMIT}>
          <UtensilsCrossed size={14} aria-hidden="true" />
          Meal
        </button>
      </footer>
    </article>
  );
}
