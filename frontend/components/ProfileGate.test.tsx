import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/components/App";
import { stubFetch } from "@/test/fetch-stub";

/**
 * Part 12, R54: an account with no profile cannot add anything.
 *
 * The server is the one that refuses (backend/tests/test_profile_gate.py); these are about what the screen
 * does *before* that, so a person is told why, and is not handed a form to fill in that cannot be saved. Looking
 * a food up is still allowed (D33), which is why the dialogs open at all. Only invented people are used (R51).
 */

type User = ReturnType<typeof userEvent.setup>;

const NO_PROFILE = { profile: { existing: null } };

async function renderApp() {
  render(<App />);
  await screen.findByTestId("day-total-calories");
}

const openView = (user: User, label: string) =>
  user.click(screen.getByRole("button", { name: label }));

async function fillNewFood(user: User) {
  await user.type(screen.getByTestId("food-name"), "Cup of rice");
  await user.selectOptions(screen.getByTestId("food-unit"), "cup");
  await user.type(screen.getByTestId("food-calories"), "205");
  await user.type(screen.getByTestId("food-protein"), "4.3");
  await user.type(screen.getByTestId("food-carbs"), "44.5");
  await user.type(screen.getByTestId("food-fat"), "0.4");
}

async function fillProfile(user: User) {
  await user.type(screen.getByTestId("profile-name"), "Ana Example");
  await user.selectOptions(screen.getByTestId("profile-sex"), "male");
  fireEvent.change(screen.getByTestId("profile-birth"), {
    target: { value: "1986-03-01" },
  });
  await user.type(screen.getByTestId("profile-height-cm"), "178");
  await user.type(screen.getByTestId("profile-weight"), "82");
  await user.selectOptions(screen.getByTestId("profile-activity"), "moderate");
  await user.selectOptions(screen.getByTestId("profile-goal"), "lose");
}

describe("with no profile, every dialog that creates something says so and will not create", () => {
  it("add a food to a day", async () => {
    stubFetch(NO_PROFILE);
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));
    await user.click(screen.getByTestId("food-white-rice")); // a valid choice, so only the missing profile can be what disables it

    expect(screen.getByTestId("need-profile")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-add-food")).toBeDisabled();
  });

  it("add a meal to a day", async () => {
    stubFetch(NO_PROFILE);
    const user = userEvent.setup();
    await renderApp();

    await user.click(
      screen.getByRole("button", { name: "Add meal to Dinner" }),
    );
    await user.click(screen.getByTestId("meal-light-dinner"));

    expect(screen.getByTestId("need-profile")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-add-meal")).toBeDisabled();
  });

  it("a new food, even with every field filled in", async () => {
    stubFetch(NO_PROFILE);
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Foods");
    await user.click(screen.getByTestId("new-food"));
    await fillNewFood(user);

    expect(screen.getByTestId("need-profile")).toBeInTheDocument();
    expect(screen.getByTestId("save-food")).toBeDisabled();
  });

  it("a new meal, even with its ingredients chosen", async () => {
    stubFetch(NO_PROFILE);
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Meals");
    await user.click(screen.getByTestId("new-meal"));
    await user.type(screen.getByTestId("meal-name"), "Rice and beans");
    await user.selectOptions(screen.getByTestId("row-food-0"), "black-beans");

    expect(screen.getByTestId("need-profile")).toBeInTheDocument();
    expect(screen.getByTestId("save-meal")).toBeDisabled();
  });
});

describe("with no profile, what does not create is left alone (D33)", () => {
  it("editing a food is not blocked and shows no notice", async () => {
    stubFetch(NO_PROFILE);
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Foods");
    await user.click(screen.getByRole("button", { name: "Edit Almonds" }));

    expect(screen.queryByTestId("need-profile")).not.toBeInTheDocument();
    expect(screen.getByTestId("save-food")).toBeEnabled();
  });

  it("looking a food up still works, though adding the result does not", async () => {
    const asked: string[] = [];
    stubFetch({ ...NO_PROFILE, lookup: { results: [], asked } });
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Foods");
    await user.click(screen.getByTestId("new-food"));
    await user.type(screen.getByTestId("food-name"), "tempeh");
    await user.click(screen.getByTestId("lookup-food"));

    expect(await screen.findByTestId("lookup-empty")).toBeInTheDocument();
    expect(asked).toEqual(["tempeh"]);
    expect(screen.getByTestId("need-profile")).toBeInTheDocument();
  });
});

describe("getting out of it", () => {
  it("the link closes the dialog and opens the profile, and once saved the same dialog works", async () => {
    stubFetch(NO_PROFILE);
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));
    await user.click(screen.getByTestId("need-profile-open"));

    // one dialog, not two on top of each other: the add dialog is gone and the profile one is up
    expect(screen.queryByTestId("confirm-add-food")).not.toBeInTheDocument();
    expect(await screen.findByTestId("profile-dialog")).toBeInTheDocument();

    await fillProfile(user);
    await user.click(screen.getByTestId("save-profile"));
    expect(await screen.findByTestId("profile-working")).toBeInTheDocument();
    await user.click(screen.getByTestId("close-dialog"));

    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));
    await user.click(screen.getByTestId("food-white-rice"));

    expect(screen.queryByTestId("need-profile")).not.toBeInTheDocument();
    expect(screen.getByTestId("confirm-add-food")).toBeEnabled();
  });

  it("removing the profile closes the gate again", async () => {
    stubFetch(); // starts with a profile
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByTestId("open-profile"));
    await user.click(await screen.findByTestId("profile-remove"));
    await user.click(await screen.findByTestId("profile-remove-yes"));
    // the dialog closes itself after a removal; wait for the day view to be the thing in front
    await screen.findByTestId("profile-prompt");

    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));
    expect(screen.getByTestId("need-profile")).toBeInTheDocument();
  });
});

describe("not knowing is not the same as having none", () => {
  const unreadable = {
    offline: ({ path, method }: { path: string; method: string }) =>
      path === "/api/profile" && method === "GET",
  };

  it("a profile that could not be read does not tell anyone to set one up", async () => {
    stubFetch(unreadable);
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));
    await user.click(screen.getByTestId("food-white-rice"));

    // the server will still refuse if there really is none, and say so; the screen does not claim to know
    expect(screen.queryByTestId("need-profile")).not.toBeInTheDocument();
    expect(screen.getByTestId("confirm-add-food")).toBeEnabled();
  });

  it("dismissing the error message does not turn 'unknown' into 'none'", async () => {
    stubFetch(unreadable);
    const user = userEvent.setup();
    await renderApp();

    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));

    expect(screen.queryByTestId("need-profile")).not.toBeInTheDocument();
  });
});

describe("a dialog on its own, with no gate around it, behaves as before", () => {
  it("shows no notice", async () => {
    stubFetch();
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));

    expect(screen.queryByTestId("need-profile")).not.toBeInTheDocument();
  });
});
