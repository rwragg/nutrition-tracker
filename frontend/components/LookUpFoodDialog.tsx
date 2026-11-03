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
  type SaveResult,
  type Section,
  type Store,
} from "@/lib/types";
import CandidateList from "./CandidateList";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";

const DEFAULT_GRAMS = 100;
const MAX_GRAMS = 5000;

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
  /** Makes the food and logs it. A refusal is returned, so the dialog can stay open and say why. */
  onAdd: (candidate: FoodCandidate, grams: number) => Promise<SaveResult>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [candidates, setCandidates] = useState<FoodCandidate[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupProblem, setLookupProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<FoodCandidate | null>(null);
  const [grams, setGrams] = useState(DEFAULT_GRAMS);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const query = name.trim();
  const own = chosen ? [] : matchFoods(query, store.foods);
  const macros = chosen ? scaleMacros(chosen.macros, grams) : null;

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
    if (!chosen || saving) return;

    setSaving(true);
    setProblem(null);
    const result = await onAdd(chosen, grams);
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
            disabled={!chosen || saving || grams <= 0}
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
          <CandidateList candidates={candidates} onPick={(candidate) => setChosen(candidate)} pickLabel="Choose" />
        )}

        {chosen && (
          <div data-testid="lookup-chosen">
            <p className="fw-medium mb-0">{chosen.name}</p>
            <p className="small tabular text-muted-brand">
              per 100 g · {formatCalories(chosen.per100g.calories)} kcal · P {formatGrams(chosen.per100g.protein)} · C{" "}
              {formatGrams(chosen.per100g.carbs)} · F {formatGrams(chosen.per100g.fat)}
            </p>

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
              This puts {chosen.name} in your food list as well, and logs {formatGrams(grams)} g of it.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
