"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import { scaleMacros, ZERO } from "@/lib/nutrition";
import { quantityRules, readQuantity } from "@/lib/quantity";
import {
  SECTION_LABELS,
  type Food,
  type Section,
  type Store,
} from "@/lib/types";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY, BTN_NEUTRAL } from "./styles";
import { NeedProfileNotice, useProfileGate } from "./ProfileGate";

const round = (value: number) => Math.round(value * 100) / 100;

export default function AddFoodDialog({
  section,
  store,
  initialFoodId,
  onAdd,
  onLookUp,
  onClose,
}: {
  section: Section;
  store: Store;
  /** Open with this food chosen, instead of the first in the list. */
  initialFoodId?: string;
  onAdd: (foodId: string, quantity: number) => void;
  /** The food is not in the list: go and look it up (D20). */
  onLookUp: () => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(
    initialFoodId ?? store.foods[0]?.id ?? "",
  );

  const selected =
    store.foods.find((food) => food.id === selectedId) ?? store.foods[0];
  const unit = selected?.unit ?? "cup";
  const rules = quantityRules(unit);

  // What the person has typed, kept as text. It is read, never rewritten, while they type: clamping it on every
  // keystroke made typing 183 give 0.26 (see lib/quantity.ts).
  const [draft, setDraft] = useState(String(rules.start));
  const reading = readQuantity(draft, unit);
  const quantity = reading.ok ? reading.value : null;
  const macros =
    selected && quantity !== null
      ? scaleMacros(selected.macros, quantity)
      : ZERO;

  const submit = () => {
    if (!selected || quantity === null) return;
    onAdd(selected.id, quantity);
    onClose();
  };

  // The buttons start from the typed amount if it is one, and from the unit's own start if it is not.
  const bump = (direction: 1 | -1) => {
    const next = round((quantity ?? rules.start) + direction * rules.step);
    setDraft(String(Math.min(rules.max, Math.max(rules.min, next))));
  };

  // A quantity means something different in another unit (1 cup, 100 g), so it starts over then and only then.
  const choose = (food: Food) => {
    if (food.unit !== unit) setDraft(String(quantityRules(food.unit).start));
    setSelectedId(food.id);
  };

  const { needProfile } = useProfileGate();

  return (
    <Dialog
      title={`Add food to ${SECTION_LABELS[section]}`}
      onClose={onClose}
      footer={
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 w-100">
          <p className="small text-muted-brand mb-0" data-testid="food-preview">
            {formatCalories(macros.calories)} kcal ·{" "}
            {formatGrams(macros.protein)} g protein ·{" "}
            {formatGrams(macros.carbs)} g carbs · {formatGrams(macros.fat)} g
            fat
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!selected || quantity === null || needProfile}
            className={BTN_PRIMARY}
            data-testid="confirm-add-food"
          >
            <Plus size={14} aria-hidden="true" />
            Add to {SECTION_LABELS[section]}
          </button>
        </div>
      }
    >
      <NeedProfileNotice onClose={onClose} />
      {store.foods.length === 0 ? (
        <p className="small text-muted-brand mb-0">
          No foods yet. Look one up below, or add one from the Foods view.
        </p>
      ) : (
        <ul
          className="list-unstyled mb-0 overflow-y-auto dark-scroll d-flex flex-column gap-1"
          style={{ maxHeight: "18rem" }}
          role="listbox"
          aria-label="Foods"
        >
          {store.foods.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.id === food.id}
                onClick={() => choose(food)}
                data-testid={`food-${food.id}`}
                className="option-row d-flex align-items-center justify-content-between gap-3 small"
              >
                <span className="fw-medium">{food.name}</span>
                <span className="text-muted-brand flex-shrink-0">
                  {formatCalories(food.macros.calories)} kcal /{" "}
                  {formatQuantity(1, food.unit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="small mt-3 mb-0">
        <button
          type="button"
          className={`${BTN_GHOST} p-0`}
          onClick={onLookUp}
          data-testid="open-lookup"
        >
          Not in your list? Look it up
        </button>
      </p>

      <div className="d-flex flex-wrap align-items-center gap-3 border-top mt-4 pt-4">
        <span className="small fw-medium">Quantity</span>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => bump(-1)}
            className={BTN_NEUTRAL}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <input
            type="number"
            min={rules.min}
            max={rules.max}
            step={rules.step}
            value={draft}
            aria-label="Quantity"
            aria-invalid={!reading.ok}
            onChange={(event) => setDraft(event.target.value)}
            className="form-control form-control-sm text-center tabular"
            style={{ width: "5.5rem" }}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => bump(1)}
            className={BTN_NEUTRAL}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
        {selected && quantity !== null && (
          <span className="small text-muted-brand">
            {formatQuantity(quantity, selected.unit)}
          </span>
        )}
        {!reading.ok && (
          <span
            className="small text-ember"
            role="status"
            data-testid="quantity-problem"
          >
            {reading.problem}
          </span>
        )}
      </div>
    </Dialog>
  );
}
