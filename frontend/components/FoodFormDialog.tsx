"use client";

import { useState } from "react";
import { UNITS, type Food, type FoodInput, type Macros, type SaveResult, type Unit } from "@/lib/types";
import { pluralUnit } from "@/lib/format";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";

const FIELDS: { key: keyof Macros; label: string }[] = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
];

export default function FoodFormDialog({
  food,
  onSubmit,
  onClose,
}: {
  food?: Food;
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

  const canSave = name.trim().length > 0;

  async function save() {
    if (!canSave || saving) return;

    setSaving(true);
    const result = await onSubmit({ name: name.trim(), unit, macros });
    setSaving(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    onClose();
  }

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
            disabled={!canSave || saving}
            className={BTN_PRIMARY}
            data-testid="save-food"
          >
            {saving ? "Saving..." : food ? "Save food" : "Create food"}
          </button>
        </div>
      }
    >
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
            onChange={(event) => setName(event.target.value)}
            className="form-control"
          />
        </div>

        <div>
          <label className="form-label fw-medium" htmlFor="food-unit">
            Unit
          </label>
          <select
            id="food-unit"
            value={unit}
            data-testid="food-unit"
            onChange={(event) => setUnit(event.target.value as Unit)}
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
          <legend className="form-label fw-medium">Per one {unit}</legend>
          <div className="row g-3">
            {FIELDS.map((field) => (
              <div key={field.key} className="col-6">
                <label className="form-label small text-muted-brand" htmlFor={`food-${field.key}`}>
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
                    setMacros({ ...macros, [field.key]: Number(event.target.value) || 0 })
                  }
                  className="form-control"
                />
              </div>
            ))}
          </div>
        </fieldset>

        <p className="small text-muted-brand mb-0">
          Values are for one {unit}, so logging {pluralUnit(unit)} doubles them.
        </p>
      </div>
    </Dialog>
  );
}
