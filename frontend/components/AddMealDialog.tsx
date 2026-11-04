"use client";

import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import { findFood, mealMacros } from "@/lib/nutrition";
import { SECTION_LABELS, type Section, type Store } from "@/lib/types";
import Dialog from "./Dialog";
import { BTN_PRIMARY } from "./styles";
import { NeedProfileNotice, useProfileGate } from "./ProfileGate";

const ZERO_MACROS = { calories: 0, protein: 0, carbs: 0, fat: 0 };

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
  const selected =
    store.meals.find((meal) => meal.id === selectedId) ?? store.meals[0];
  const macros = selected ? mealMacros(selected, store) : ZERO_MACROS;

  const { needProfile } = useProfileGate();

  return (
    <Dialog
      title={`Add meal to ${SECTION_LABELS[section]}`}
      onClose={onClose}
      footer={
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 w-100">
          <p className="small text-muted-brand mb-0" data-testid="meal-preview">
            {formatCalories(macros.calories)} kcal ·{" "}
            {formatGrams(macros.protein)} g protein ·{" "}
            {formatGrams(macros.carbs)} g carbs · {formatGrams(macros.fat)} g
            fat
          </p>
          <button
            type="button"
            disabled={!selected || needProfile}
            onClick={() => {
              if (!selected) return;
              onAdd(selected.id);
              onClose();
            }}
            className={BTN_PRIMARY}
            data-testid="confirm-add-meal"
          >
            <UtensilsCrossed size={14} aria-hidden="true" />
            Add to {SECTION_LABELS[section]}
          </button>
        </div>
      }
    >
      <NeedProfileNotice onClose={onClose} />
      {store.meals.length === 0 ? (
        <p className="small text-muted-brand mb-0">
          No meals yet. Build one from your foods in the Meals view.
        </p>
      ) : (
        <ul
          className="list-unstyled d-flex flex-column gap-1 mb-0"
          role="listbox"
          aria-label="Meals"
        >
          {store.meals.map((meal) => (
            <li key={meal.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.id === meal.id}
                onClick={() => setSelectedId(meal.id)}
                data-testid={`meal-${meal.id}`}
                className="option-row d-flex align-items-center justify-content-between gap-3 small"
              >
                <span>
                  <span className="d-block fw-medium">{meal.name}</span>
                  <span className="d-block small text-muted-brand">
                    {meal.ingredients.length} foods
                  </span>
                </span>
                <span className="flex-shrink-0 text-muted-brand">
                  {formatCalories(mealMacros(meal, store).calories)} kcal
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="border-top mt-4 pt-4">
          <h3 className="small fw-semibold text-uppercase text-muted-brand">
            Foods
          </h3>
          <ul className="list-unstyled mb-0 mt-2 d-flex flex-column gap-1">
            {selected.ingredients.map((ingredient, index) => {
              const food = findFood(store, ingredient.foodId);
              return (
                <li
                  key={index}
                  className="d-flex align-items-baseline justify-content-between gap-3 small"
                >
                  <span>{food?.name ?? "Missing food"}</span>
                  <span className="text-muted-brand">
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
