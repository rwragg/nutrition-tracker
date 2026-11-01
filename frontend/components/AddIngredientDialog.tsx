"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { FOODS } from "@/lib/foods";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import { scaleMacros, ZERO } from "@/lib/nutrition";
import { SECTION_LABELS, type Section } from "@/lib/types";
import Dialog from "./Dialog";
import { BTN_PRIMARY } from "./styles";

const STEP = 0.25;
const MIN_QUANTITY = 0.25;

const round = (value: number) => Math.round(value * 100) / 100;

export default function AddIngredientDialog({
  section,
  onAdd,
  onClose,
}: {
  section: Section;
  onAdd: (foodId: string, quantity: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(FOODS[0].id);
  const [quantity, setQuantity] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? FOODS.filter((food) => food.name.toLowerCase().includes(needle)) : FOODS;
  }, [query]);

  const selected = filtered.find((food) => food.id === selectedId) ?? filtered[0];
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
      title={`Add ingredient to ${SECTION_LABELS[section]}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" data-testid="ingredient-preview">
            {formatCalories(macros.calories)} kcal · {formatGrams(macros.protein)} g protein ·{" "}
            {formatGrams(macros.carbs)} g carbs · {formatGrams(macros.fat)} g fat
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!selected}
            className={BTN_PRIMARY}
            data-testid="confirm-add-ingredient"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add to {SECTION_LABELS[section]}
          </button>
        </div>
      }
    >
      <form
        id="add-ingredient-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search ingredients"
          aria-label="Search ingredients"
          className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-sm text-navy placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        />

        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto" role="listbox" aria-label="Ingredients">
          {filtered.length === 0 && <li className="px-1 py-3 text-sm text-muted">No ingredients match.</li>}
          {filtered.map((food) => {
            const active = selected?.id === food.id;
            return (
              <li key={food.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedId(food.id)}
                  data-testid={`food-${food.id}`}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors ${
                    active ? "bg-blue/10 ring-1 ring-blue" : "hover:bg-canvas"
                  }`}
                >
                  <span className="font-medium text-navy">{food.name}</span>
                  <span className="shrink-0 text-muted">
                    {formatCalories(food.macros.calories)} kcal / {formatQuantity(1, food.unit)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-center gap-3 border-t border-hairline pt-4">
          <span className="text-sm font-medium text-navy">Quantity</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQuantityClamped(quantity - STEP)}
              className="inline-flex size-8 items-center justify-center rounded-full border border-hairline text-navy hover:border-blue hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
            <input
              type="number"
              min={MIN_QUANTITY}
              max={20}
              step={STEP}
              value={quantity}
              aria-label="Quantity"
              onChange={(event) => setQuantityClamped(Number(event.target.value))}
              className="w-16 rounded-xl border border-hairline bg-canvas px-2 py-1.5 text-center text-sm tabular-nums text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
            />
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantityClamped(quantity + STEP)}
              className="inline-flex size-8 items-center justify-center rounded-full border border-hairline text-navy hover:border-blue hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {selected && <span className="text-sm text-muted">{formatQuantity(quantity, selected.unit)}</span>}
        </div>
      </form>
    </Dialog>
  );
}
