import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "@/components/App";
import FoodFormDialog from "@/components/FoodFormDialog";
import { stubFetch } from "@/test/fetch-stub";
import { FOODS } from "@/test/fixture";

/** The New food form over the test world's foods, with the two callbacks recorded. */
function open(props: Partial<React.ComponentProps<typeof FoodFormDialog>> = {}) {
  const onUseExisting = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue({ ok: true });
  render(
    <FoodFormDialog
      foods={FOODS}
      onUseExisting={onUseExisting}
      onSubmit={onSubmit}
      onClose={() => undefined}
      {...props}
    />,
  );
  return { onUseExisting, onSubmit };
}

describe("a new food that may already be there", () => {
  it("says nothing while the name matches nothing", async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByTestId("food-name"), "Tempeh");

    expect(screen.queryByTestId("similar-foods")).not.toBeInTheDocument();
  });

  it("offers the foods that are close, as the name is typed", async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByTestId("food-name"), "rice");

    expect(screen.getByTestId("similar-heading")).toHaveTextContent("Already in your list");
    expect(screen.getByTestId("similar-white-rice")).toHaveTextContent("White rice, cooked");
    expect(screen.getByTestId("similar-white-rice")).toHaveTextContent("205 kcal");
  });

  it("says so when the name is one the list already has", async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByTestId("food-name"), "white rice cooked");

    expect(screen.getByTestId("similar-heading")).toHaveTextContent("You already have this food");
  });

  it("hands over the existing food instead of creating another", async () => {
    const user = userEvent.setup();
    const { onUseExisting, onSubmit } = open();

    await user.type(screen.getByTestId("food-name"), "rice");
    await user.click(screen.getByRole("button", { name: "Edit White rice, cooked instead" }));

    expect(onUseExisting).toHaveBeenCalledWith(FOODS.find((food) => food.id === "white-rice"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not stop the person creating it anyway: two foods may share a name", async () => {
    const user = userEvent.setup();
    const { onSubmit } = open();

    await user.type(screen.getByTestId("food-name"), "white rice cooked");
    await user.click(screen.getByTestId("save-food"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("offers nothing when editing a food that exists", async () => {
    const user = userEvent.setup();
    open({ food: FOODS.find((food) => food.id === "white-rice") });

    await user.clear(screen.getByTestId("food-name"));
    await user.type(screen.getByTestId("food-name"), "rice");

    expect(screen.queryByTestId("similar-foods")).not.toBeInTheDocument();
  });

  it("is quiet when the form was not given the list", async () => {
    const user = userEvent.setup();
    open({ foods: undefined, onUseExisting: undefined });

    await user.type(screen.getByTestId("food-name"), "rice");

    expect(screen.queryByTestId("similar-foods")).not.toBeInTheDocument();
  });
});

describe("in the Foods view", () => {
  it("opens the food that is already there, and writes nothing", async () => {
    const writes: string[] = [];
    stubFetch({
      intercept: ({ path, method }) => {
        if (method !== "GET") writes.push(`${method} ${path}`);
        return undefined;
      },
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("day-total-calories");

    await user.click(screen.getByRole("button", { name: "Foods" }));
    await user.click(screen.getByTestId("new-food"));
    await user.type(screen.getByTestId("food-name"), "rice");
    await user.click(screen.getByRole("button", { name: "Edit White rice, cooked instead" }));

    expect(await screen.findByRole("dialog", { name: "Edit food" })).toBeInTheDocument();
    expect(screen.getByTestId("food-name")).toHaveValue("White rice, cooked");
    expect(screen.queryByTestId("similar-foods")).not.toBeInTheDocument();
    expect(writes).toEqual([]);
  });
});
