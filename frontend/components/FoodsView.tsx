"use client";

import { useState, type Dispatch } from "react";
import { Plus } from "lucide-react";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import { foodUsage, type StoreAction } from "@/lib/store";
import type { Food, Store } from "@/lib/types";
import { describeFoodUsage } from "@/lib/usage";
import DeleteDialog from "./DeleteDialog";
import FoodFormDialog from "./FoodFormDialog";
import { BTN_OUTLINE, BTN_PRIMARY, CARD } from "./styles";

type Dialog =
  | { kind: "new" }
  | { kind: "edit"; food: Food }
  | { kind: "delete"; food: Food }
  | null;

export default function FoodsView({
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
      <section className={`${CARD} overflow-hidden`} data-testid="foods-view">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-accent/10 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-navy">
            Foods <span className="text-sm font-normal text-muted">({store.foods.length})</span>
          </h2>
          <button
            type="button"
            data-testid="new-food"
            onClick={() => setDialog({ kind: "new" })}
            className={BTN_PRIMARY}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New food
          </button>
        </header>

        {store.foods.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No foods yet. Create one, then log it on a day.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {store.foods.map((food) => (
              <li
                key={food.id}
                data-testid={`food-row-${food.id}`}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{food.name}</p>
                  <p className="text-xs tabular-nums text-muted">
                    per {formatQuantity(1, food.unit)} · {formatCalories(food.macros.calories)} kcal · P{" "}
                    {formatGrams(food.macros.protein)} · C {formatGrams(food.macros.carbs)} · F{" "}
                    {formatGrams(food.macros.fat)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${food.name}`}
                  onClick={() => setDialog({ kind: "edit", food })}
                  className={BTN_OUTLINE}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${food.name}`}
                  onClick={() => setDialog({ kind: "delete", food })}
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
        <FoodFormDialog
          onClose={() => setDialog(null)}
          onSubmit={(food) => dispatch({ type: "food/add", food })}
        />
      )}

      {dialog?.kind === "edit" && (
        <FoodFormDialog
          food={dialog.food}
          onClose={() => setDialog(null)}
          onSubmit={(food) => dispatch({ type: "food/update", food })}
        />
      )}

      {dialog?.kind === "delete" &&
        (() => {
          const usage = foodUsage(store, dialog.food.id);
          const used = usage.total > 0;
          return (
            <DeleteDialog
              title={used ? `${dialog.food.name} is in use` : `Delete ${dialog.food.name}?`}
              body={
                used
                  ? `This food cannot be deleted while something still refers to it - ${describeFoodUsage(
                      usage.meals,
                      usage.days,
                      todayIso,
                    )}. Remove it from those first.`
                  : `This removes ${dialog.food.name} from your food list. Nothing logged or built from it right now.`
              }
              confirmLabel="Delete food"
              onConfirm={used ? undefined : () => dispatch({ type: "food/delete", foodId: dialog.food.id })}
              onClose={() => setDialog(null)}
            />
          );
        })()}
    </>
  );
}
