"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toIsoDate } from "@/lib/dates";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import type { Food, FoodInput, SaveResult, Store } from "@/lib/types";
import { describeRefusal } from "@/lib/usage";
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
  onSaveFood,
  onDeleteFood,
}: {
  store: Store;
  onSaveFood: (existingId: string | null, input: FoodInput) => Promise<SaveResult>;
  onDeleteFood: (id: string) => Promise<SaveResult>;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const todayIso = toIsoDate(new Date());

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
          foods={store.foods}
          onUseExisting={(existing) => setDialog({ kind: "edit", food: existing })}
          onClose={() => setDialog(null)}
          onSubmit={(input: FoodInput) => onSaveFood(null, input)}
        />
      )}

      {dialog?.kind === "edit" && (
        <FoodFormDialog
          food={dialog.food}
          onClose={() => setDialog(null)}
          onSubmit={(input: FoodInput) => onSaveFood(dialog.food.id, input)}
        />
      )}

      {dialog?.kind === "delete" && (
        <DeleteDialog
          title={`Delete ${dialog.food.name}?`}
          body={`This removes ${dialog.food.name} from your food list.`}
          confirmLabel="Delete food"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await onDeleteFood(dialog.food.id);
            if (result.ok) return null;

            return (
              (result.refusal && describeRefusal(result.refusal, "food", todayIso)) ?? result.message
            );
          }}
        />
      )}
    </>
  );
}
