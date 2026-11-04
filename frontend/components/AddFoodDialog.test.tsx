import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AddFoodDialog from "@/components/AddFoodDialog";
import { FOODS, sampleStore } from "@/test/fixture";
import type { Food, Store } from "@/lib/types";

/**
 * The quantity box in "Add food to ...".
 *
 * Reported 4 Nov: typing 183 into the quantity of a gram food gave 0.26. The box clamped and rounded on every
 * keystroke, so clearing it snapped to the 0.25 minimum, and the digits typed next were appended to that
 * ("0.251", "0.258" -> 0.26). It also capped every food at 20, which is a fine limit for cups and a wrong one for
 * grams, where 183 g is an ordinary serving. Only invented foods are used here (R51).
 */

// Yogurt, per gram, the way a looked-up USDA food is stored (D13).
const YOGURT: Food = {
  ...FOODS[0],
  id: "yogurt",
  name: "Yogurt, plain",
  unit: "g",
  macros: { calories: 0.61, protein: 0.1, carbs: 0.047, fat: 0.0033 },
};
const BLUEBERRIES = FOODS.find((food) => food.id === "blueberries") as Food;
const STRAWBERRIES: Food = {
  ...BLUEBERRIES,
  id: "strawberries",
  name: "Strawberries",
}; // the same unit

const store = (): Store => ({
  ...sampleStore(),
  foods: [YOGURT, BLUEBERRIES, STRAWBERRIES],
});

function renderDialog(initialFoodId: string) {
  const onAdd = vi.fn();
  render(
    <AddFoodDialog
      section="lunch"
      store={store()}
      initialFoodId={initialFoodId}
      onAdd={onAdd}
      onLookUp={() => undefined}
      onClose={() => undefined}
    />,
  );
  return { onAdd, user: userEvent.setup() };
}

const quantityBox = () => screen.getByLabelText("Quantity") as HTMLInputElement;

describe("typing a quantity", () => {
  it("183 into a gram food is 183 g, not 0.26", async () => {
    const { onAdd, user } = renderDialog("yogurt");

    await user.clear(quantityBox());
    await user.type(quantityBox(), "183");

    expect(quantityBox()).toHaveValue(183);
    await user.click(screen.getByTestId("confirm-add-food"));
    expect(onAdd).toHaveBeenCalledWith("yogurt", 183);
  });

  it("2 into a cup food is 2 cups after clearing the box, not 0.25", async () => {
    const { onAdd, user } = renderDialog("blueberries");

    await user.clear(quantityBox());
    await user.type(quantityBox(), "2");

    expect(quantityBox()).toHaveValue(2);
    await user.click(screen.getByTestId("confirm-add-food"));
    expect(onAdd).toHaveBeenCalledWith("blueberries", 2);
  });
});

describe("an amount that is out of range is said to be, not quietly changed", () => {
  it("leaves 99999 g as typed, explains the range, and will not add it", async () => {
    const { onAdd, user } = renderDialog("yogurt");

    await user.clear(quantityBox());
    await user.type(quantityBox(), "99999");

    expect(quantityBox()).toHaveValue(99999);
    expect(screen.getByTestId("quantity-problem")).toHaveTextContent(
      "1 g to 5000 g",
    );
    expect(screen.getByTestId("confirm-add-food")).toBeDisabled();
    await user.click(screen.getByTestId("confirm-add-food"));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("will not add 25 cups either, where the old box would have made it 20", async () => {
    const { onAdd, user } = renderDialog("blueberries");

    await user.clear(quantityBox());
    await user.type(quantityBox(), "25");

    expect(quantityBox()).toHaveValue(25);
    expect(screen.getByTestId("quantity-problem")).toHaveTextContent(
      "1/4 cup to 20 cups",
    );
    expect(screen.getByTestId("confirm-add-food")).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("says so when the box is empty, and recovers as soon as there is a number", async () => {
    const { user } = renderDialog("yogurt");

    await user.clear(quantityBox());
    expect(screen.getByTestId("quantity-problem")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-add-food")).toBeDisabled();

    await user.type(quantityBox(), "150");
    expect(screen.queryByTestId("quantity-problem")).not.toBeInTheDocument();
    expect(screen.getByTestId("confirm-add-food")).toBeEnabled();
  });
});

describe("what the box starts with, and the buttons beside it", () => {
  it("starts a gram food at 100 g and a cup food at 1", () => {
    renderDialog("yogurt");
    expect(quantityBox()).toHaveValue(100);
  });

  it("moves a gram food by 10 and a cup food by a quarter", async () => {
    const { user } = renderDialog("yogurt");
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(quantityBox()).toHaveValue(110);
    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(quantityBox()).toHaveValue(90);
  });

  it("moves a cup food by a quarter", async () => {
    const { user } = renderDialog("blueberries");
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(quantityBox()).toHaveValue(1.25);
  });

  it("steps from what was typed, not from where the box started", async () => {
    const { user } = renderDialog("yogurt");
    await user.clear(quantityBox());
    await user.type(quantityBox(), "183");
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(quantityBox()).toHaveValue(193);
  });

  it("stops at the ends instead of going past them, and recovers a bad box to a valid number", async () => {
    const { user } = renderDialog("blueberries");
    await user.clear(quantityBox());
    await user.type(quantityBox(), "20");
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(quantityBox()).toHaveValue(20);

    await user.clear(quantityBox()); // empty: the buttons start from the unit's own start
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(quantityBox()).toHaveValue(1.25);
    expect(screen.queryByTestId("quantity-problem")).not.toBeInTheDocument();
  });
});

describe("choosing another food", () => {
  it("starts the amount over when the unit changes, because 183 means nothing in cups", async () => {
    const { user } = renderDialog("yogurt");
    await user.clear(quantityBox());
    await user.type(quantityBox(), "183");

    await user.click(screen.getByTestId("food-blueberries"));
    expect(quantityBox()).toHaveValue(1);

    await user.click(screen.getByTestId("food-yogurt"));
    expect(quantityBox()).toHaveValue(100);
  });

  it("keeps what was typed when the unit is the same", async () => {
    const { user } = renderDialog("blueberries");
    await user.clear(quantityBox());
    await user.type(quantityBox(), "2");

    await user.click(screen.getByTestId("food-strawberries"));
    expect(quantityBox()).toHaveValue(2);
  });
});

describe("the figures follow the typed amount", () => {
  it("shows 183 g of yogurt as the day will count it", async () => {
    const { user } = renderDialog("yogurt");
    await user.clear(quantityBox());
    await user.type(quantityBox(), "183");

    // 183 g x 0.61 kcal/g = 111.63 kcal; x 0.1 g protein/g = 18.3 g; x 0.047 g carbs/g = 8.6 g.
    // Grams show as whole numbers from 10 g up and to one decimal below it (lib/format), so 18.3 g reads 18.
    expect(screen.getByTestId("food-preview")).toHaveTextContent("112 kcal");
    expect(screen.getByTestId("food-preview")).toHaveTextContent(
      "18 g protein",
    );
    expect(screen.getByTestId("food-preview")).toHaveTextContent("8.6 g carbs");
  });
});
