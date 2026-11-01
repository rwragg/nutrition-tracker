"use client";

import { Plus, UtensilsCrossed } from "lucide-react";
import { formatCalories } from "@/lib/format";
import { totalMacros } from "@/lib/nutrition";
import { SECTION_LABELS, type LogEntry, type Section } from "@/lib/types";
import EntryRow from "./EntryRow";
import { BTN_OUTLINE, CARD } from "./styles";

export default function SectionCard({
  section,
  entries,
  onAddIngredient,
  onAddMeal,
  onRemove,
}: {
  section: Section;
  entries: LogEntry[];
  onAddIngredient: (section: Section) => void;
  onAddMeal: (section: Section) => void;
  onRemove: (section: Section, id: string) => void;
}) {
  const label = SECTION_LABELS[section];
  const calories = totalMacros(entries).calories;

  return (
    <article className={`${CARD} flex flex-col`} data-testid={`section-${section}`}>
      <header className="flex items-baseline justify-between gap-3 border-b border-hairline px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-navy">{label}</h2>
        <p className="text-sm text-muted">
          <span className="font-medium tabular-nums text-navy" data-testid={`section-${section}-calories`}>
            {formatCalories(calories)}
          </span>{" "}
          kcal
        </p>
      </header>

      <ul className="flex-1 divide-y divide-hairline">
        {entries.length === 0 ? (
          <li className="px-5 py-8 text-center text-sm text-muted">Nothing logged yet.</li>
        ) : (
          entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              section={section}
              onRemove={(id) => onRemove(section, id)}
            />
          ))
        )}
      </ul>

      <footer className="flex flex-wrap gap-2 border-t border-hairline px-5 py-3">
        <button
          type="button"
          aria-label={`Add ingredient to ${label}`}
          onClick={() => onAddIngredient(section)}
          className={BTN_OUTLINE}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Ingredient
        </button>
        <button
          type="button"
          aria-label={`Add meal to ${label}`}
          onClick={() => onAddMeal(section)}
          className={BTN_OUTLINE}
        >
          <UtensilsCrossed className="size-3.5" aria-hidden="true" />
          Meal
        </button>
      </footer>
    </article>
  );
}
