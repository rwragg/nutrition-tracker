"use client";

import { Plus, UtensilsCrossed } from "lucide-react";
import { formatCalories } from "@/lib/format";
import { totalMacros } from "@/lib/nutrition";
import { SECTION_LABELS, type LogEntry, type Section } from "@/lib/types";
import EntryRow from "./EntryRow";
import { BTN_BLUE, BTN_PURPLE, CARD } from "./styles";

/** Each section carries one palette colour as a strip and a wash behind its title. */
const ACCENTS: Record<Section, { strip: string; header: string }> = {
  breakfast: { strip: "bg-accent", header: "bg-accent/10" },
  lunch: { strip: "bg-blue", header: "bg-blue/10" },
  dinner: { strip: "bg-purple", header: "bg-purple/10" },
  snacks: { strip: "bg-accent", header: "bg-accent/10" },
};

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
  const accent = ACCENTS[section];

  return (
    <article
      className={`${CARD} flex flex-col overflow-hidden`}
      data-testid={`section-${section}`}
    >
      <div className={`h-2 ${accent.strip}`} aria-hidden="true" />

      <header
        className={`flex items-baseline justify-between gap-3 border-b border-hairline px-5 py-4 ${accent.header}`}
      >
        <h2 className="text-lg font-semibold tracking-tight text-navy">{label}</h2>
        <p className="text-sm text-muted">
          <span className="font-semibold tabular-nums text-navy" data-testid={`section-${section}-calories`}>
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

      <footer className="flex flex-wrap gap-2 border-t border-hairline bg-white px-5 py-3">
        <button
          type="button"
          aria-label={`Add ingredient to ${label}`}
          onClick={() => onAddIngredient(section)}
          className={BTN_BLUE}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Ingredient
        </button>
        <button
          type="button"
          aria-label={`Add meal to ${label}`}
          onClick={() => onAddMeal(section)}
          className={BTN_PURPLE}
        >
          <UtensilsCrossed className="size-3.5" aria-hidden="true" />
          Meal
        </button>
      </footer>
    </article>
  );
}
