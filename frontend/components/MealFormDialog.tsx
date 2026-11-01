"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatQuantity } from "@/lib/format";
import { createId } from "@/lib/store";
import type { Ingredient, Meal, Store } from "@/lib/types";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_NEUTRAL, BTN_PRIMARY } from "./styles";

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
        <div className="d-flex justify-content-end gap-2 w-100">
          <button type="button" onClick={onClose} className={BTN_GHOST}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!canSave} className={BTN_PRIMARY} data-testid="save-meal">
            {meal ? "Save meal" : "Create meal"}
          </button>
        </div>
      }
    >
      <div className="d-flex flex-column gap-3">
        <div>
          <label className="form-label fw-medium" htmlFor="meal-name">
            Name
          </label>
          <input
            id="meal-name"
            type="text"
            value={name}
            data-testid="meal-name"
            placeholder="Typical breakfast"
            onChange={(event) => setName(event.target.value)}
            className="form-control"
          />
        </div>

        <div>
          <h3 className="form-label fw-medium mb-2">Foods</h3>
          <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
            {ingredients.map((ingredient, index) => {
              const food = store.foods.find((candidate) => candidate.id === ingredient.foodId);
              return (
                <li key={index} className="d-flex align-items-center gap-2">
                  <select
                    value={ingredient.foodId}
                    aria-label={`Food ${index + 1}`}
                    data-testid={`row-food-${index}`}
                    onChange={(event) => updateRow(index, { foodId: event.target.value })}
                    className="form-select form-select-sm flex-grow-1"
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
                    className="form-control form-control-sm text-center tabular"
                    style={{ width: "5rem" }}
                  />
                  <span className="small text-muted-brand" style={{ width: "4rem" }}>
                    {food ? formatQuantity(ingredient.quantity, food.unit) : ""}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove food ${index + 1}`}
                    data-testid={`remove-row-${index}`}
                    onClick={() => setIngredients((rows) => rows.filter((_, i) => i !== index))}
                    className={BTN_NEUTRAL}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            data-testid="add-row"
            onClick={() =>
              setIngredients((rows) => [...rows, { foodId: store.foods[0]?.id ?? "", quantity: 1 }])
            }
            className={`${BTN_GHOST} mt-3 d-inline-flex align-items-center gap-2`}
          >
            <Plus size={14} aria-hidden="true" />
            Add food
          </button>
        </div>
      </div>
    </Dialog>
  );
}
