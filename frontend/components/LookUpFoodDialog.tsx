"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ApiError, lookupFoods } from "@/lib/api";
import { formatCalories, formatGrams } from "@/lib/format";
import { matchFoods } from "@/lib/match";
import { scaleMacros } from "@/lib/nutrition";
import {
  SECTION_LABELS,
  type Food,
  type FoodCandidate,
  type Macros,
  type SaveResult,
  type Section,
  type Store,
} from "@/lib/types";
import CandidateList from "./CandidateList";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";

const DEFAULT_GRAMS = 100;
const MAX_GRAMS = 5000;

const FIGURES: { key: keyof Macros; label: string }[] = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
];

/** Per 100 g back to per gram, rounded the way the server rounds it, so "unchanged" compares fairly. */
const perGram = (per100g: Macros): Macros => ({
  calories: Math.round(per100g.calories) / 100,
  protein: Math.round(per100g.protein * 100) / 10000,
  carbs: Math.round(per100g.carbs * 100) / 10000,
  fat: Math.round(per100g.fat * 100) / 10000,
});

/** Whether the figures are still exactly the ones USDA gave. */
function unchangedFigures(candidate: FoodCandidate, figures: Macros): boolean {
  return FIGURES.every(({ key }) => figures[key] === candidate.per100g[key]);
}

/**
 * Add a food to a day that is not in the list yet (D20).
 *
 * Name it, look it up, choose one of what USDA offers, say how many grams, and it is made and logged in
 * one step. The person's own foods are offered first (D23), because a food they already have is better
 * than a second copy of it. Nothing is written until the last button, and the figures that will be
 * written are on screen when it is pressed (R33).
 *
 * The quantity is in grams because that is what USDA's figures are per (D13, R34). Household units come
 * from a second USDA call per food and are not in this cut.
 */
export default function LookUpFoodDialog({
  section,
  store,
  onAddExisting,
  onAdd,
  onClose,
}: {
  section: Section;
  store: Store;
  /** The person already has this food: go back to the picker with it chosen. */
  onAddExisting: (food: Food) => void;
  /**
   * Makes the food and logs it. A refusal is returned, so the dialog can stay open and say why.
   * `unchanged` is false when the person edited the name or the figures, so the caller does not reuse
   * a food made earlier from the same USDA entry and lose what they changed.
   */
  onAdd: (candidate: FoodCandidate, grams: number, unchanged: boolean) => Promise<SaveResult>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [candidates, setCandidates] = useState<FoodCandidate[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupProblem, setLookupProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<FoodCandidate | null>(null);
  // What the person may change once they have chosen: the name, and the figures per 100 g.
  const [chosenName, setChosenName] = useState("");
  const [figures, setFigures] = useState<Macros | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [grams, setGrams] = useState(DEFAULT_GRAMS);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const query = name.trim();
  const own = chosen ? [] : matchFoods(query, store.foods);
  const finalName = chosenName.trim();
  // What will be stored: USDA's candidate with the person's name and figures laid over it.
  const final: FoodCandidate | null =
    chosen && figures
      ? {
          ...chosen,
          name: finalName,
          per100g: figures,
          macros: unchangedFigures(chosen, figures) ? chosen.macros : perGram(figures),
        }
      : null;
  const unchanged = !!chosen && finalName === chosen.name && !!figures && unchangedFigures(chosen, figures);
  const macros = final ? scaleMacros(final.macros, grams) : null;

  function choose(candidate: FoodCandidate) {
    setChosen(candidate);
    setChosenName(candidate.name);
    setFigures(candidate.per100g);
    setAdjusting(false);
  }

  async function lookUp(event?: React.FormEvent) {
    event?.preventDefault();
    if (query.length < 2 || looking) return;

    setLooking(true);
    setLookupProblem(null);
    setCandidates(null);
    try {
      setCandidates(await lookupFoods(query));
    } catch (cause) {
      setLookupProblem(
        cause instanceof ApiError
          ? cause.message
          : "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setLooking(false);
    }
  }

  async function add() {
    if (!final || !finalName || saving) return;

    setSaving(true);
    setProblem(null);
    const result = await onAdd(final, grams, unchanged);
    setSaving(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    onClose();
  }

  return (
    <Dialog
      title={`Look up a food for ${SECTION_LABELS[section]}`}
      onClose={onClose}
      footer={
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 w-100">
          <p className="small text-muted-brand mb-0" data-testid="lookup-preview">
            {macros
              ? `${formatCalories(macros.calories)} kcal · ${formatGrams(macros.protein)} g protein · ${formatGrams(macros.carbs)} g carbs · ${formatGrams(macros.fat)} g fat`
              : "Choose a food to see what it adds."}
          </p>
          <button
            type="button"
            onClick={add}
            disabled={!chosen || !finalName || saving || grams <= 0}
            className={BTN_PRIMARY}
            data-testid="confirm-lookup-add"
          >
            <Plus size={14} aria-hidden="true" />
            {saving ? "Adding..." : `Add to ${SECTION_LABELS[section]}`}
          </button>
        </div>
      }
    >
      <div className="d-flex flex-column gap-3">
        {problem && (
          <p className="small text-ember mb-0" role="alert" data-testid="lookup-add-problem">
            {problem}
          </p>
        )}

        {!chosen && (
          <form onSubmit={lookUp}>
            <label className="form-label fw-medium" htmlFor="lookup-name">
              Food
            </label>
            <div className="d-flex gap-2">
              <input
                id="lookup-name"
                type="text"
                value={name}
                data-testid="lookup-name"
                placeholder="Tempeh"
                onChange={(event) => {
                  setName(event.target.value);
                  setCandidates(null);
                }}
                className="form-control"
              />
              <button
                type="submit"
                className={`${BTN_PRIMARY} text-nowrap flex-shrink-0`}
                disabled={query.length < 2 || looking}
                data-testid="lookup-go"
              >
                {looking ? "Looking..." : "Look it up"}
              </button>
            </div>
            <p className="small text-muted-brand mt-2 mb-0">Searches USDA FoodData Central, generic foods.</p>
          </form>
        )}

        {own.length > 0 && (
          <div data-testid="lookup-own">
            <p className="small text-muted-brand mb-1">Already in your list:</p>
            <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
              {own.map(({ food }) => (
                <li key={food.id} className="d-flex align-items-center justify-content-between gap-3 small">
                  <span className="fw-medium">{food.name}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary flex-shrink-0"
                    aria-label={`Add ${food.name} from your list`}
                    onClick={() => onAddExisting(food)}
                  >
                    Add this one
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lookupProblem && (
          <p className="small text-ember mb-0" role="alert" data-testid="lookup-problem">
            {lookupProblem}
          </p>
        )}

        {candidates && candidates.length === 0 && (
          <p className="small text-muted-brand mb-0" data-testid="lookup-empty">
            USDA has nothing under that name. Try a simpler word.
          </p>
        )}

        {!chosen && candidates && candidates.length > 0 && (
          <CandidateList candidates={candidates} onPick={choose} pickLabel="Choose" />
        )}

        {chosen && figures && (
          <div data-testid="lookup-chosen">
            <label className="form-label fw-medium" htmlFor="lookup-chosen-name">
              Name
            </label>
            <input
              id="lookup-chosen-name"
              type="text"
              value={chosenName}
              data-testid="lookup-chosen-name"
              onChange={(event) => setChosenName(event.target.value)}
              className="form-control"
            />
            <p className="small tabular text-muted-brand mt-2 mb-1">
              per 100 g · {formatCalories(figures.calories)} kcal · P {formatGrams(figures.protein)} · C{" "}
              {formatGrams(figures.carbs)} · F {formatGrams(figures.fat)}
              <button
                type="button"
                className={`${BTN_GHOST} p-0 ms-2 align-baseline`}
                onClick={() => setAdjusting(!adjusting)}
                aria-expanded={adjusting}
                data-testid="lookup-adjust"
              >
                {adjusting ? "Done" : "Adjust figures"}
              </button>
            </p>

            {adjusting && (
              <div className="row g-2 mb-3" data-testid="lookup-figures">
                {FIGURES.map((field) => (
                  <div key={field.key} className="col-6">
                    <label className="form-label small text-muted-brand mb-1" htmlFor={`lookup-fig-${field.key}`}>
                      {field.label} per 100 g
                    </label>
                    <input
                      id={`lookup-fig-${field.key}`}
                      type="number"
                      min={0}
                      step={0.1}
                      value={figures[field.key]}
                      data-testid={`lookup-fig-${field.key}`}
                      onChange={(event) =>
                        setFigures({ ...figures, [field.key]: Math.max(0, Number(event.target.value) || 0) })
                      }
                      className="form-control form-control-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="d-flex flex-wrap align-items-center gap-3">
              <label className="small fw-medium" htmlFor="lookup-grams">
                Grams
              </label>
              <input
                id="lookup-grams"
                type="number"
                min={1}
                max={MAX_GRAMS}
                step={1}
                value={grams}
                data-testid="lookup-grams"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isNaN(value)) setGrams(Math.max(0, Math.min(MAX_GRAMS, value)));
                }}
                className="form-control form-control-sm text-center tabular"
                style={{ width: "6rem" }}
              />
              <button
                type="button"
                className={BTN_GHOST}
                onClick={() => {
                  setChosen(null);
                  setProblem(null);
                }}
                data-testid="lookup-choose-another"
              >
                Choose another
              </button>
            </div>
            <p className="small text-muted-brand mt-2 mb-0">
              This puts {finalName || "this food"} in your food list as well, and logs {formatGrams(grams)} g of it.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
