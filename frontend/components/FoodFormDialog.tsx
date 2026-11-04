"use client";

import { useState } from "react";
import { ApiError, lookupFoods } from "@/lib/api";
import {
  UNITS,
  type Food,
  type FoodCandidate,
  type FoodInput,
  type Macros,
  type SaveResult,
  type Unit,
} from "@/lib/types";
import { formatCalories, formatQuantity, pluralUnit } from "@/lib/format";
import { matchFoods } from "@/lib/match";
import CandidateList from "./CandidateList";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";
import { NeedProfileNotice, useProfileGate } from "./ProfileGate";

const FIELDS: { key: keyof Macros; label: string }[] = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
];

export default function FoodFormDialog({
  food,
  foods = [],
  onUseExisting,
  onSubmit,
  onClose,
}: {
  food?: Food;
  /** The foods already in the list, so a new one that is really an old one can be caught. New foods only. */
  foods?: Food[];
  /** The person chose a food that is already there instead of creating another. */
  onUseExisting?: (food: Food) => void;
  /** Saves through the API. A refusal is returned, so the dialog can stay open and say why. */
  onSubmit: (input: FoodInput) => Promise<SaveResult>;
  onClose: () => void;
}) {
  const [name, setName] = useState(food?.name ?? "");
  const [unit, setUnit] = useState<Unit>(food?.unit ?? "cup");
  const [macros, setMacros] = useState<Macros>(
    food?.macros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Looking a food up (D20). `candidates` is null until a lookup has been asked for, and an empty list
  // means USDA was asked and had nothing, which is a different thing to say.
  const [candidates, setCandidates] = useState<FoodCandidate[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupProblem, setLookupProblem] = useState<string | null>(null);
  // Set once a candidate is picked, and dropped again if the figures stop being USDA's per-gram ones.
  const [usda, setUsda] = useState<{ sourceId: string } | null>(null);

  const canSave = name.trim().length > 0;
  const canLookUp = !food && name.trim().length >= 2 && !looking;

  async function lookUp() {
    setLooking(true);
    setLookupProblem(null);
    setCandidates(null);
    try {
      setCandidates(await lookupFoods(name.trim()));
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

  /** A pick fills the form and nothing else: the person reads it, changes it if they like, and saves (R33). */
  function use(candidate: FoodCandidate) {
    setName(candidate.name);
    setUnit(candidate.unit);
    setMacros(candidate.macros);
    setUsda({ sourceId: candidate.fdcId });
    setCandidates(null);
  }

  // Only when creating: an edit is of a food that exists, and the other foods are none of its business.
  const similar = food || !onUseExisting ? [] : matchFoods(name, foods);
  const alreadyThere = similar.some((match) => match.exact);

  async function save() {
    if (!canSave || saving) return;

    setSaving(true);
    const result = await onSubmit({
      name: name.trim(),
      unit,
      macros,
      ...(usda && unit === "g"
        ? { source: "usda" as const, sourceId: usda.sourceId }
        : {}),
    });
    setSaving(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    onClose();
  }

  const { needProfile } = useProfileGate();
  const blocked = needProfile && !food;

  return (
    <Dialog
      title={food ? "Edit food" : "New food"}
      onClose={onClose}
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button type="button" onClick={onClose} className={BTN_GHOST}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving || blocked}
            className={BTN_PRIMARY}
            data-testid="save-food"
          >
            {saving ? "Saving..." : food ? "Save food" : "Create food"}
          </button>
        </div>
      }
    >
      {!food && <NeedProfileNotice onClose={onClose} />}
      <div className="d-flex flex-column gap-3">
        {problem && (
          <p className="small mb-0 text-ember" data-testid="food-problem">
            {problem}
          </p>
        )}
        <div>
          <label className="form-label fw-medium" htmlFor="food-name">
            Name
          </label>
          <input
            id="food-name"
            type="text"
            value={name}
            data-testid="food-name"
            placeholder="Cup of rice"
            onChange={(event) => {
              setName(event.target.value);
              setCandidates(null);
            }}
            className="form-control"
          />

          {similar.length > 0 && (
            <div className="mt-2" data-testid="similar-foods">
              <p
                className="small text-muted-brand mb-1"
                data-testid="similar-heading"
              >
                {alreadyThere
                  ? "You already have this food."
                  : "Already in your list:"}
              </p>
              <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
                {similar.map(({ food: existing }) => (
                  <li
                    key={existing.id}
                    data-testid={`similar-${existing.id}`}
                    className="d-flex align-items-center justify-content-between gap-3 small"
                  >
                    <span className="min-w-0">
                      <span className="fw-medium">{existing.name}</span>{" "}
                      <span className="tabular text-muted-brand">
                        per {formatQuantity(1, existing.unit)} ·{" "}
                        {formatCalories(existing.macros.calories)} kcal
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary flex-shrink-0"
                      aria-label={`Edit ${existing.name} instead`}
                      onClick={() => onUseExisting?.(existing)}
                    >
                      Edit this one
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!food && (
            <div className="mt-2">
              <button
                type="button"
                className={BTN_GHOST}
                onClick={lookUp}
                disabled={!canLookUp}
                data-testid="lookup-food"
              >
                {looking ? "Looking it up..." : "Look it up"}
              </button>
              <span className="small text-muted-brand ms-2">
                in USDA FoodData Central
              </span>
            </div>
          )}

          {lookupProblem && (
            <p
              className="small text-ember mt-2 mb-0"
              role="alert"
              data-testid="lookup-problem"
            >
              {lookupProblem}
            </p>
          )}

          {candidates && candidates.length === 0 && (
            <p
              className="small text-muted-brand mt-2 mb-0"
              data-testid="lookup-empty"
            >
              USDA has nothing under that name. Try a simpler word, or enter the
              figures yourself.
            </p>
          )}

          {candidates && candidates.length > 0 && (
            <div className="mt-2">
              <p className="small text-muted-brand mb-2">
                From USDA, generic foods. Picking one fills the form; nothing is
                saved until you do.
              </p>
              <CandidateList
                candidates={candidates}
                onPick={use}
                pickLabel="Use"
              />
            </div>
          )}

          {usda && unit === "g" && (
            <p
              className="small text-muted-brand mt-2 mb-0"
              data-testid="usda-note"
            >
              Figures are USDA&apos;s, per gram. Check them, then create the
              food.
            </p>
          )}
        </div>

        <div>
          <label className="form-label fw-medium" htmlFor="food-unit">
            Unit
          </label>
          <select
            id="food-unit"
            value={unit}
            data-testid="food-unit"
            onChange={(event) => {
              setUnit(event.target.value as Unit);
              // The figures were USDA's per gram; in any other unit they are the person's own numbers.
              setUsda(null);
            }}
            className="form-select"
          >
            {UNITS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="form-label fw-medium fs-6">Per one {unit}</legend>
          <div className="row g-3">
            {FIELDS.map((field) => (
              <div key={field.key} className="col-6">
                <label
                  className="form-label small text-muted-brand"
                  htmlFor={`food-${field.key}`}
                >
                  {field.label}
                </label>
                <input
                  id={`food-${field.key}`}
                  type="number"
                  min={0}
                  step={0.1}
                  value={macros[field.key]}
                  data-testid={`food-${field.key}`}
                  onChange={(event) =>
                    setMacros({
                      ...macros,
                      [field.key]: Number(event.target.value) || 0,
                    })
                  }
                  className="form-control"
                />
              </div>
            ))}
          </div>
        </fieldset>

        <p className="small text-muted-brand mb-0">
          {unit === "g"
            ? "Values are per gram, so logging 100 g is 100 times these."
            : `Values are for one ${unit}, so logging ${pluralUnit(unit)} doubles them.`}
        </p>
      </div>
    </Dialog>
  );
}
