"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toIsoDate } from "@/lib/dates";
import { formatCalories, formatQuantity } from "@/lib/format";
import { findFood, mealMacros } from "@/lib/nutrition";
import type { Meal, MealInput, SaveResult, Store } from "@/lib/types";
import { describeRefusal } from "@/lib/usage";
import DeleteDialog from "./DeleteDialog";
import MealFormDialog from "./MealFormDialog";
import { BTN_NEUTRAL, BTN_PRIMARY } from "./styles";

type Dialog =
  | { kind: "new" }
  | { kind: "edit"; meal: Meal }
  | { kind: "delete"; meal: Meal }
  | null;

export default function MealsView({
  store,
  onSaveMeal,
  onDeleteMeal,
}: {
  store: Store;
  onSaveMeal: (existingId: string | null, input: MealInput) => Promise<SaveResult>;
  onDeleteMeal: (id: string) => Promise<SaveResult>;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const todayIso = toIsoDate(new Date());

  return (
    <>
      <section className="brand-list" data-testid="meals-view">
        <header
          className="brand-list-head d-flex flex-wrap align-items-center justify-content-between gap-3 px-4 py-3"
          data-view="meals"
        >
          <h2 className="h5 fw-semibold mb-0">
            Meals <span className="small fw-normal text-muted-brand">({store.meals.length})</span>
          </h2>
          <button
            type="button"
            data-testid="new-meal"
            onClick={() => setDialog({ kind: "new" })}
            disabled={store.foods.length === 0}
            className={`${BTN_PRIMARY} d-inline-flex align-items-center gap-2`}
          >
            <Plus size={14} aria-hidden="true" />
            New meal
          </button>
        </header>

        {store.meals.length === 0 ? (
          <p className="text-center small text-muted-brand px-4 py-5 mb-0">
            No meals yet. Build one from your foods, then log it in one tap.
          </p>
        ) : (
          <ul className="list-unstyled mb-0">
            {store.meals.map((meal) => (
              <li
                key={meal.id}
                data-testid={`meal-row-${meal.id}`}
                className="brand-row d-flex flex-wrap align-items-center gap-3 px-4 py-3"
              >
                <div className="flex-grow-1 min-w-0">
                  <p className="fw-semibold mb-0">{meal.name}</p>
                  <p className="small text-muted-brand mb-0" data-testid={`meal-contents-${meal.id}`}>
                    {meal.ingredients
                      .map((ingredient) => {
                        const food = findFood(store, ingredient.foodId);
                        return food
                          ? `${food.name} ${formatQuantity(ingredient.quantity, food.unit)}`
                          : "Missing food";
                      })
                      .join(" · ")}
                  </p>
                </div>
                <p className="small tabular text-muted-brand mb-0 flex-shrink-0">
                  {formatCalories(mealMacros(meal, store).calories)} kcal
                </p>
                <button
                  type="button"
                  aria-label={`Edit ${meal.name}`}
                  onClick={() => setDialog({ kind: "edit", meal })}
                  className={BTN_NEUTRAL}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${meal.name}`}
                  onClick={() => setDialog({ kind: "delete", meal })}
                  className={BTN_NEUTRAL}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === "new" && (
        <MealFormDialog
          store={store}
          onClose={() => setDialog(null)}
          onSubmit={(input: MealInput) => onSaveMeal(null, input)}
        />
      )}

      {dialog?.kind === "edit" && (
        <MealFormDialog
          meal={dialog.meal}
          store={store}
          onClose={() => setDialog(null)}
          onSubmit={(input: MealInput) => onSaveMeal(dialog.meal.id, input)}
        />
      )}

      {dialog?.kind === "delete" && (
        <DeleteDialog
          title={`Delete ${dialog.meal.name}?`}
          body={`This removes ${dialog.meal.name} from your meal list.`}
          confirmLabel="Delete meal"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await onDeleteMeal(dialog.meal.id);
            if (result.ok) return null;

            return (
              (result.refusal && describeRefusal(result.refusal, "meal", todayIso)) ?? result.message
            );
          }}
        />
      )}
    </>
  );
}
