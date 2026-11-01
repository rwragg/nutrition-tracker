"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import { scaleMacros, ZERO } from "@/lib/nutrition";
import { SECTION_LABELS, type Section, type Store } from "@/lib/types";
import Dialog from "./Dialog";
import { BTN_PRIMARY, BTN_NEUTRAL } from "./styles";

const STEP = 0.25;
const MIN_QUANTITY = 0.25;

const round = (value: number) => Math.round(value * 100) / 100;

export default function AddFoodDialog({
  section,
  store,
  onAdd,
  onClose,
}: {
  section: Section;
  store: Store;
  onAdd: (foodId: string, quantity: number) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(store.foods[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);

  const selected = store.foods.find((food) => food.id === selectedId) ?? store.foods[0];
  const macros = selected ? scaleMacros(selected.macros, quantity) : ZERO;

  const submit = () => {
    if (!selected) return;
    onAdd(selected.id, quantity);
    onClose();
  };

  const setQuantityClamped = (value: number) => {
    if (Number.isNaN(value)) return;
    setQuantity(round(Math.max(MIN_QUANTITY, Math.min(20, value))));
  };

  return (
    <Dialog
      title={`Add food to ${SECTION_LABELS[section]}`}
      onClose={onClose}
      footer={
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 w-100">
          <p className="small text-muted-brand mb-0" data-testid="food-preview">
            {formatCalories(macros.calories)} kcal · {formatGrams(macros.protein)} g protein ·{" "}
            {formatGrams(macros.carbs)} g carbs · {formatGrams(macros.fat)} g fat
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!selected}
            className={BTN_PRIMARY}
            data-testid="confirm-add-food"
          >
            <Plus size={14} aria-hidden="true" />
            Add to {SECTION_LABELS[section]}
          </button>
        </div>
      }
    >
      {store.foods.length === 0 ? (
        <p className="small text-muted-brand mb-0">
          No foods yet. Add one from the Foods view first.
        </p>
      ) : (
        <ul className="list-unstyled mb-0 overflow-y-auto d-flex flex-column gap-1" style={{ maxHeight: "18rem" }} role="listbox" aria-label="Foods">
          {store.foods.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.id === food.id}
                onClick={() => setSelectedId(food.id)}
                data-testid={`food-${food.id}`}
                className="option-row d-flex align-items-center justify-content-between gap-3 small"
              >
                <span className="fw-medium">{food.name}</span>
                <span className="text-muted-brand flex-shrink-0">
                  {formatCalories(food.macros.calories)} kcal / {formatQuantity(1, food.unit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="d-flex flex-wrap align-items-center gap-3 border-top mt-4 pt-4">
        <span className="small fw-medium">Quantity</span>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantityClamped(quantity - STEP)}
            className={BTN_NEUTRAL}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <input
            type="number"
            min={MIN_QUANTITY}
            max={20}
            step={STEP}
            value={quantity}
            aria-label="Quantity"
            onChange={(event) => setQuantityClamped(Number(event.target.value))}
            className="form-control form-control-sm text-center tabular"
            style={{ width: "4.5rem" }}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantityClamped(quantity + STEP)}
            className={BTN_NEUTRAL}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
        {selected && <span className="small text-muted-brand">{formatQuantity(quantity, selected.unit)}</span>}
      </div>
    </Dialog>
  );
}
