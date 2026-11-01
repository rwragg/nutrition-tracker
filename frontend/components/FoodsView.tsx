"use client";

import { useState, type Dispatch } from "react";
import { Plus } from "lucide-react";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import { foodUsage, type StoreAction } from "@/lib/store";
import type { Food, Store } from "@/lib/types";
import { describeFoodUsage } from "@/lib/usage";
import DeleteDialog from "./DeleteDialog";
import FoodFormDialog from "./FoodFormDialog";
import { BTN_NEUTRAL, BTN_PRIMARY } from "./styles";

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
      <section className="brand-list" data-testid="foods-view">
        <header className="brand-list-head d-flex flex-wrap align-items-center justify-content-between gap-3 px-4 py-3">
          <h2 className="h5 fw-semibold mb-0">
            Foods <span className="small fw-normal text-muted-brand">({store.foods.length})</span>
          </h2>
          <button
            type="button"
            data-testid="new-food"
            onClick={() => setDialog({ kind: "new" })}
            className={`${BTN_PRIMARY} d-inline-flex align-items-center gap-2`}
          >
            <Plus size={14} aria-hidden="true" />
            New food
          </button>
        </header>

        {store.foods.length === 0 ? (
          <p className="text-center small text-muted-brand px-4 py-5 mb-0">
            No foods yet. Create one, then log it on a day.
          </p>
        ) : (
          <ul className="list-unstyled mb-0">
            {store.foods.map((food) => (
              <li
                key={food.id}
                data-testid={`food-row-${food.id}`}
                className="brand-row d-flex flex-wrap align-items-center gap-3 px-4 py-3"
              >
                <div className="flex-grow-1 min-w-0">
                  <p className="fw-semibold mb-0">{food.name}</p>
                  <p className="small tabular text-muted-brand mb-0">
                    per {formatQuantity(1, food.unit)} · {formatCalories(food.macros.calories)} kcal · P{" "}
                    {formatGrams(food.macros.protein)} · C {formatGrams(food.macros.carbs)} · F{" "}
                    {formatGrams(food.macros.fat)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${food.name}`}
                  onClick={() => setDialog({ kind: "edit", food })}
                  className={BTN_NEUTRAL}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${food.name}`}
                  onClick={() => setDialog({ kind: "delete", food })}
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

      {dialog?.kind === "delete" && (
        <DeleteFoodConfirm
          store={store}
          food={dialog.food}
          todayIso={todayIso}
          onClose={() => setDialog(null)}
          onConfirm={() => dispatch({ type: "food/delete", foodId: dialog.food.id })}
        />
      )}
    </>
  );
}

function DeleteFoodConfirm({
  store,
  food,
  todayIso,
  onConfirm,
  onClose,
}: {
  store: Store;
  food: Food;
  todayIso: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const usage = foodUsage(store, food.id);
  const used = usage.total > 0;

  return (
    <DeleteDialog
      title={used ? `${food.name} is in use` : `Delete ${food.name}?`}
      body={
        used
          ? `This food cannot be deleted while something still refers to it - ${describeFoodUsage(
              usage.meals,
              usage.days,
              todayIso,
            )}. Remove it from those first.`
          : `This removes ${food.name} from your food list. Nothing logged or built from it right now.`
      }
      confirmLabel="Delete food"
      onConfirm={used ? undefined : onConfirm}
      onClose={onClose}
    />
  );
}
