"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { formatCalories, formatGrams } from "@/lib/format";
import { entryLabel, entryMacros, findMeal, mealBreakdown } from "@/lib/nutrition";
import { SECTION_LABELS, type LogEntry, type Section, type Store } from "@/lib/types";
import { BTN_ICON } from "./styles";

export default function EntryRow({
  entry,
  section,
  store,
  onRemove,
}: {
  entry: LogEntry;
  section: Section;
  store: Store;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { name, detail } = entryLabel(entry, store);
  const macros = entryMacros(entry, store);
  const meal = entry.kind === "meal" ? findMeal(store, entry.mealId) : undefined;
  const breakdown = meal ? mealBreakdown(meal, store) : [];
  const sectionLabel = SECTION_LABELS[section];

  return (
    <li className="section-entry d-flex align-items-start gap-3 px-4 py-3" data-testid={`entry-${entry.id}`}>
      <div className="flex-grow-1 min-w-0">
        {meal ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} foods in ${name}`}
            onClick={() => setExpanded((open) => !open)}
            className="entry-toggle"
          >
            {name}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`entry-chevron ${expanded ? "entry-chevron-open" : ""}`}
            />
          </button>
        ) : (
          <p className="fw-semibold mb-0 text-truncate">{name}</p>
        )}
        <p className="small text-muted-brand mb-0">{detail}</p>

        {expanded && (
          <ul className="list-unstyled entry-expand ps-3 mt-2 mb-0">
            {breakdown.map((item, index) => (
              <li key={index} className="d-flex align-items-baseline justify-content-between gap-3 small">
                <span>
                  {item.name} <span className="text-muted-brand">{item.detail}</span>
                </span>
                <span className="tabular text-muted-brand">{formatCalories(item.calories)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-end flex-shrink-0">
        <p className="fw-semibold tabular mb-0">{formatCalories(macros.calories)}</p>
        <p className="small tabular text-muted-brand mb-0">
          P {formatGrams(macros.protein)} · C {formatGrams(macros.carbs)} · F {formatGrams(macros.fat)}
        </p>
      </div>

      <button
        type="button"
        aria-label={`Remove ${name} from ${sectionLabel}`}
        onClick={() => onRemove(entry.id)}
        className={BTN_ICON}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </li>
  );
}
