"use client";

import { useState } from "react";
import { UNITS, type Food, type Macros, type Unit } from "@/lib/types";
import { createId } from "@/lib/store";
import Dialog from "./Dialog";
import { BTN_PRIMARY } from "./styles";

const FIELDS: { key: keyof Macros; label: string }[] = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
];

const INPUT =
  "w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-sm text-navy placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

export default function FoodFormDialog({
  food,
  onSubmit,
  onClose,
}: {
  food?: Food;
  onSubmit: (food: Food) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(food?.name ?? "");
  const [unit, setUnit] = useState<Unit>(food?.unit ?? "cup");
  const [macros, setMacros] = useState<Macros>(
    food?.macros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    onSubmit({ id: food?.id ?? createId("food"), name: name.trim(), unit, macros });
    onClose();
  };

  return (
    <Dialog
      title={food ? "Edit food" : "New food"}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={BTN_PRIMARY}
            data-testid="save-food"
          >
            {food ? "Save food" : "Create food"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-navy">Name</span>
          <input
            type="text"
            value={name}
            aria-label="Name"
            data-testid="food-name"
            placeholder="Cup of rice"
            onChange={(event) => setName(event.target.value)}
            className={`mt-1 ${INPUT}`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-navy">Unit</span>
          <select
            value={unit}
            aria-label="Unit"
            data-testid="food-unit"
            onChange={(event) => setUnit(event.target.value as Unit)}
            className={`mt-1 ${INPUT}`}
          >
            {UNITS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-navy">Per one {unit}</legend>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs text-muted">{field.label}</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={macros[field.key]}
                  aria-label={field.label}
                  data-testid={`food-${field.key}`}
                  onChange={(event) =>
                    setMacros({ ...macros, [field.key]: Number(event.target.value) || 0 })
                  }
                  className={`mt-1 ${INPUT}`}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-xs text-muted">
          Values are for one {unit}, so logging two {unit}s doubles them.
        </p>
      </div>
    </Dialog>
  );
}
