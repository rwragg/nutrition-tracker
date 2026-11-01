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
import { BTN_OUTLINE, BTN_PRIMARY, CARD } from "./styles";

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
      <section className={`${CARD} overflow-hidden`} data-testid="meals-view">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-purple/10 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-navy">
            Meals <span className="text-sm font-normal text-muted">({store.meals.length})</span>
          </h2>
          <button
            type="button"
            data-testid="new-meal"
            onClick={() => setDialog({ kind: "new" })}
            disabled={store.foods.length === 0}
            className={BTN_PRIMARY}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New meal
          </button>
        </header>

        {store.meals.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No meals yet. Build one from your foods, then log it in one tap.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {store.meals.map((meal) => (
              <li
                key={meal.id}
                data-testid={`meal-row-${meal.id}`}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{meal.name}</p>
                  <p className="text-xs text-muted" data-testid={`meal-contents-${meal.id}`}>
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
                <p className="shrink-0 text-sm tabular-nums text-muted">
                  {formatCalories(mealMacros(meal, store).calories)} kcal
                </p>
                <button
                  type="button"
                  aria-label={`Edit ${meal.name}`}
                  onClick={() => setDialog({ kind: "edit", meal })}
                  className={BTN_OUTLINE}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${meal.name}`}
                  onClick={() => setDialog({ kind: "delete", meal })}
                  className={BTN_OUTLINE}
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

      {dialog?.kind === "delete" &&
        (() => {
          const days = mealUsage(store, dialog.meal.id);
          const used = days.length > 0;
          return (
            <DeleteDialog
              title={used ? `${dialog.meal.name} is in use` : `Delete ${dialog.meal.name}?`}
              body={
                used
                  ? `This meal cannot be deleted while it is ${describeMealUsage(
                      days,
                      todayIso,
                    )}. Remove it from those days first.`
                  : `This removes ${dialog.meal.name} from your meal list. It is not logged on any day.`
              }
              confirmLabel="Delete meal"
              onConfirm={used ? undefined : () => dispatch({ type: "meal/delete", mealId: dialog.meal.id })}
              onClose={() => setDialog(null)}
            />
          );
        })()}
    </>
  );
}
