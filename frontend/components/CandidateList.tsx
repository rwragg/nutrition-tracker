"use client";

import { formatCalories, formatGrams } from "@/lib/format";
import type { FoodCandidate } from "@/lib/types";

/**
 * What USDA offered for a name, one line each, with the figures a label would give (per 100 g) so the
 * person can judge it before picking. The figures stored are per gram (D13); the label form is only
 * for reading.
 *
 * Choosing is the caller's business: this lists and reports the pick, and writes nothing (R33).
 */
export default function CandidateList({
  candidates,
  onPick,
  pickLabel,
  busy = false,
}: {
  candidates: FoodCandidate[];
  onPick: (candidate: FoodCandidate) => void;
  pickLabel: string;
  busy?: boolean;
}) {
  return (
    <ul className="list-unstyled mb-0 d-flex flex-column gap-2" data-testid="lookup-results">
      {candidates.map((candidate) => (
        <li
          key={candidate.fdcId}
          data-testid={`candidate-${candidate.fdcId}`}
          className="d-flex align-items-center justify-content-between gap-3 small"
        >
          <span className="min-w-0">
            <span className="fw-medium d-block">{candidate.name}</span>
            <span className="tabular text-muted-brand">
              per 100 g · {formatCalories(candidate.per100g.calories)} kcal · P{" "}
              {formatGrams(candidate.per100g.protein)} · C {formatGrams(candidate.per100g.carbs)} · F{" "}
              {formatGrams(candidate.per100g.fat)}
            </span>
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary flex-shrink-0"
            aria-label={`${pickLabel} ${candidate.name}`}
            disabled={busy}
            onClick={() => onPick(candidate)}
          >
            {pickLabel}
          </button>
        </li>
      ))}
    </ul>
  );
}
