"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { formatCalories, formatGrams } from "@/lib/format";
import { entryLabel, entryMacros, mealBreakdown } from "@/lib/nutrition";
import { SECTION_LABELS, type LogEntry, type Section } from "@/lib/types";
import { BTN_ICON } from "./styles";

export default function EntryRow({
  entry,
  section,
  onRemove,
}: {
  entry: LogEntry;
  section: Section;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { name, detail } = entryLabel(entry);
  const macros = entryMacros(entry);
  const breakdown = entry.kind === "meal" ? mealBreakdown(entry.mealId) : [];
  const sectionLabel = SECTION_LABELS[section];

  return (
    <li className="group flex items-start gap-3 px-5 py-3" data-testid={`entry-${entry.id}`}>
      <div className="min-w-0 flex-1">
        {entry.kind === "meal" ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} ingredients of ${name}`}
            onClick={() => setExpanded((open) => !open)}
            className="flex items-center gap-1.5 text-left font-semibold text-navy hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          >
            {name}
            <ChevronDown
              className={`size-4 text-blue transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <p className="truncate font-medium text-navy">{name}</p>
        )}
        <p className="text-xs text-muted">{detail}</p>

        {expanded && (
          <ul className="mt-2 space-y-1 border-l-2 border-blue/30 pl-3">
            {breakdown.map((item, index) => (
              <li key={index} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-navy">
                  {item.name} <span className="text-muted">{item.detail}</span>
                </span>
                <span className="tabular-nums text-muted">{formatCalories(item.calories)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums text-navy">{formatCalories(macros.calories)}</p>
        <p className="text-xs tabular-nums text-muted">
          P {formatGrams(macros.protein)} · C {formatGrams(macros.carbs)} · F {formatGrams(macros.fat)}
        </p>
      </div>

      <button
        type="button"
        aria-label={`Remove ${name} from ${sectionLabel}`}
        onClick={() => onRemove(entry.id)}
        className={BTN_ICON}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}
