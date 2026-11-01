"use client";

import { useState, type Dispatch } from "react";
import { Plus } from "lucide-react";
import { formatCalories, formatQuantity } from "@/lib/format";
import { findFood, mealMacros } from "@/lib/nutrition";
import { mealUsage, type StoreAction } from "@/lib/store";
import type { Meal, Store } from "@/lib/types";
import { describeMealUsage } from "@/lib/usage";
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
  dispatch,
}: {
  store: Store;
  dispatch: Dispatch<StoreAction>;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const todayIso = store.days[0]?.date ?? "";

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
          onSubmit={(meal) => dispatch({ type: "meal/add", meal })}
        />
      )}

      {dialog?.kind === "edit" && (
        <MealFormDialog
          meal={dialog.meal}
          store={store}
          onClose={() => setDialog(null)}
          onSubmit={(meal) => dispatch({ type: "meal/update", meal })}
        />
      )}

      {dialog?.kind === "delete" && (
        <DeleteMealConfirm
          store={store}
          meal={dialog.meal}
          todayIso={todayIso}
          onClose={() => setDialog(null)}
          onConfirm={() => dispatch({ type: "meal/delete", mealId: dialog.meal.id })}
        />
      )}
    </>
  );
}

function DeleteMealConfirm({
  store,
  meal,
  todayIso,
  onConfirm,
  onClose,
}: {
  store: Store;
  meal: Meal;
  todayIso: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const days = mealUsage(store, meal.id);
  const used = days.length > 0;

  return (
    <DeleteDialog
      title={used ? `${meal.name} is in use` : `Delete ${meal.name}?`}
      body={
        used
          ? `This meal cannot be deleted while it is ${describeMealUsage(
              days,
              todayIso,
            )}. Remove it from those days first.`
          : `This removes ${meal.name} from your meal list. It is not logged on any day.`
      }
      confirmLabel="Delete meal"
      onConfirm={used ? undefined : onConfirm}
      onClose={onClose}
    />
  );
}
