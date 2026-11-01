"use client";

import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import { findFood, mealMacros } from "@/lib/nutrition";
import { SECTION_LABELS, type Section, type Store } from "@/lib/types";
import Dialog from "./Dialog";
import { BTN_PRIMARY } from "./styles";

export default function AddMealDialog({
  section,
  store,
  onAdd,
  onClose,
}: {
  section: Section;
  store: Store;
  onAdd: (mealId: string) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(store.meals[0]?.id ?? "");
  const selected = store.meals.find((meal) => meal.id === selectedId) ?? store.meals[0];
  const macros = selected ? mealMacros(selected, store) : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <Dialog
      title={`Add meal to ${SECTION_LABELS[section]}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" data-testid="meal-preview">
            {formatCalories(macros.calories)} kcal · {formatGrams(macros.protein)} g protein ·{" "}
            {formatGrams(macros.carbs)} g carbs · {formatGrams(macros.fat)} g fat
          </p>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onAdd(selected.id);
              onClose();
            }}
            className={BTN_PRIMARY}
            data-testid="confirm-add-meal"
          >
            <UtensilsCrossed className="size-3.5" aria-hidden="true" />
            Add to {SECTION_LABELS[section]}
          </button>
        </div>
      }
    >
      {store.meals.length === 0 ? (
        <p className="py-4 text-sm text-muted">
          No meals yet. Build one from your foods in the Meals view.
        </p>
      ) : (
        <ul className="space-y-1" role="listbox" aria-label="Meals">
          {store.meals.map((meal) => {
            const active = meal.id === selected?.id;
            return (
              <li key={meal.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedId(meal.id)}
                  data-testid={`meal-${meal.id}`}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors ${
                    active ? "bg-blue/10 ring-1 ring-blue" : "hover:bg-canvas"
                  }`}
                >
                  <span>
                    <span className="block font-medium text-navy">{meal.name}</span>
                    <span className="block text-xs text-muted">{meal.ingredients.length} foods</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    {formatCalories(mealMacros(meal, store).calories)} kcal
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <div className="mt-4 border-t border-hairline pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Foods</h3>
          <ul className="mt-2 space-y-1">
            {selected.ingredients.map((ingredient, index) => {
              const food = findFood(store, ingredient.foodId);
              return (
                <li key={index} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-navy">{food?.name ?? "Missing food"}</span>
                  <span className="text-muted">
                    {food ? formatQuantity(ingredient.quantity, food.unit) : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
