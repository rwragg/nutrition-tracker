"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatQuantity } from "@/lib/format";
import { createId } from "@/lib/store";
import type { Ingredient, Meal, Store } from "@/lib/types";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";

const INPUT =
  "rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

export default function MealFormDialog({
  meal,
  store,
  onSubmit,
  onClose,
}: {
  meal?: Meal;
  store: Store;
  onSubmit: (meal: Meal) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(meal?.name ?? "");
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    meal?.ingredients.map((ingredient) => ({ ...ingredient })) ?? [
      { foodId: store.foods[0]?.id ?? "", quantity: 1 },
    ],
  );

  const canSave = name.trim().length > 0 && ingredients.length > 0 && store.foods.length > 0;

  const save = () => {
    if (!canSave) return;
    onSubmit({
      id: meal?.id ?? createId("meal"),
      name: name.trim(),
      ingredients: ingredients.filter((ingredient) => ingredient.foodId !== ""),
    });
    onClose();
  };

  const updateRow = (index: number, patch: Partial<Ingredient>) =>
    setIngredients((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Dialog
      title={meal ? "Edit meal" : "New meal"}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className={BTN_GHOST}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={BTN_PRIMARY}
            data-testid="save-meal"
          >
            {meal ? "Save meal" : "Create meal"}
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
            data-testid="meal-name"
            placeholder="Typical breakfast"
            onChange={(event) => setName(event.target.value)}
            className={`mt-1 w-full ${INPUT}`}
          />
        </label>

        <div>
          <h3 className="text-sm font-medium text-navy">Foods</h3>
          <ul className="mt-2 space-y-2">
            {ingredients.map((ingredient, index) => {
              const food = store.foods.find((candidate) => candidate.id === ingredient.foodId);
              return (
                <li key={index} className="flex items-center gap-2">
                  <select
                    value={ingredient.foodId}
                    aria-label={`Food ${index + 1}`}
                    data-testid={`row-food-${index}`}
                    onChange={(event) => updateRow(index, { foodId: event.target.value })}
                    className={`min-w-0 flex-1 ${INPUT}`}
                  >
                    {store.foods.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={ingredient.quantity}
                    aria-label={`Quantity ${index + 1}`}
                    data-testid={`row-quantity-${index}`}
                    onChange={(event) => updateRow(index, { quantity: Number(event.target.value) || 1 })}
                    className={`w-20 text-center ${INPUT}`}
                  />
                  <span className="w-16 text-xs text-muted">
                    {food ? formatQuantity(ingredient.quantity, food.unit) : ""}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove food ${index + 1}`}
                    data-testid={`remove-row-${index}`}
                    onClick={() => setIngredients((rows) => rows.filter((_, i) => i !== index))}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            data-testid="add-row"
            onClick={() =>
              setIngredients((rows) => [
                ...rows,
                { foodId: store.foods[0]?.id ?? "", quantity: 1 },
              ])
            }
            className={`mt-3 ${BTN_GHOST}`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add food
          </button>
        </div>
      </div>
    </Dialog>
  );
}
