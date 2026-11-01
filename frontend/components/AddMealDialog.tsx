"use client";

import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { FOODS_BY_ID } from "@/lib/foods";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import { MEAL_TEMPLATES } from "@/lib/meals";
import { entryMacros } from "@/lib/nutrition";
import { SECTION_LABELS, type Section } from "@/lib/types";
import Dialog from "./Dialog";
import { BTN_PRIMARY } from "./styles";

export default function AddMealDialog({
  section,
  onAdd,
  onClose,
}: {
  section: Section;
  onAdd: (mealId: string) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(MEAL_TEMPLATES[0].id);
  const selected = MEAL_TEMPLATES.find((meal) => meal.id === selectedId) ?? MEAL_TEMPLATES[0];
  const macros = entryMacros({ id: "", kind: "meal", mealId: selected.id });

  return (
    <Dialog
      title={`Add meal to ${SECTION_LABELS[section]}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {formatCalories(macros.calories)} kcal · {formatGrams(macros.protein)} g protein ·{" "}
            {formatGrams(macros.carbs)} g carbs · {formatGrams(macros.fat)} g fat
          </p>
          <button
            type="button"
            onClick={() => {
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
      <ul className="space-y-1" role="listbox" aria-label="Meals">
        {MEAL_TEMPLATES.map((meal) => {
          const active = meal.id === selected.id;
          const mealMacros = entryMacros({ id: "", kind: "meal", mealId: meal.id });
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
                  <span className="block text-xs text-muted">{meal.ingredients.length} ingredients</span>
                </span>
                <span className="shrink-0 text-muted">{formatCalories(mealMacros.calories)} kcal</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-hairline pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Ingredients</h3>
        <ul className="mt-2 space-y-1">
          {selected.ingredients.map((ingredient, index) => {
            const food = FOODS_BY_ID[ingredient.foodId];
            return (
              <li key={index} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-navy">{food?.name ?? "Unknown ingredient"}</span>
                <span className="text-muted">{food ? formatQuantity(ingredient.quantity, food.unit) : ""}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
