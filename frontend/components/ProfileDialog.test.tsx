import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/components/App";
import { stubFetch } from "@/test/fetch-stub";

/**
 * The profile dialog and the Day view's targets (Part 12, R38-R39, R46-R49, D25, D30).
 *
 * Every person here is invented. The stub answers with canned targets (2,150 kcal and 130 g, or the
 * person's own where they set them) because the arithmetic is the backend's, tested there; what is
 * tested here is what the screen sends, shows, and refuses to guess.
 */

type User = ReturnType<typeof userEvent.setup>;

/** Example A from the plan, as the server stores it, weighed on 12 October. */
const ANA = {
  display_name: "Ana Example",
  sex: "male",
  birth_date: "1986-03-01",
  height_cm: 178,
  weight_kg: 82,
  weight_on: "2026-10-12",
  activity: "moderate",
  goal: "lose",
  units: "metric",
  kcal_override: null,
  protein_override: null,
};

/** The same person as a US form would show them, with a weight that does not convert to a round number. */
const ANA_IMPERIAL = { ...ANA, height_cm: 175.26, weight_kg: 74.84274, units: "imperial" };

async function renderApp() {
  render(<App />);
  await screen.findByTestId("day-total-calories");
}

async function openDialog(user: User) {
  await user.click(screen.getByTestId("open-profile"));
  return screen.findByTestId("profile-dialog");
}

/** Fill a new metric profile, the way a person would. */
async function fillMetric(user: User) {
  await user.type(screen.getByTestId("profile-name"), "Ana Example");
  await user.selectOptions(screen.getByTestId("profile-sex"), "male");
  fireEvent.change(screen.getByTestId("profile-birth"), { target: { value: "1986-03-01" } });
  await user.type(screen.getByTestId("profile-height-cm"), "178");
  await user.type(screen.getByTestId("profile-weight"), "82");
  await user.selectOptions(screen.getByTestId("profile-activity"), "moderate");
  await user.selectOptions(screen.getByTestId("profile-goal"), "lose");
}

describe("an account with no profile", () => {
  it("sees the standard targets, and an offer to set one up (R38)", async () => {
    stubFetch();
    await renderApp();

    expect(screen.getByTestId("day-target-calories")).toHaveTextContent("2,200");
    expect(screen.getByTestId("macro-protein-target")).toHaveTextContent("140");
    expect(screen.getByTestId("macro-carbs-target")).toHaveTextContent("250");
    expect(screen.getByTestId("macro-fat-target")).toHaveTextContent("70");
    expect(screen.queryByTestId("day-basis")).not.toBeInTheDocument();
    expect(screen.getByTestId("profile-prompt")).toHaveTextContent("standard targets");
  });

  it("opens the dialog from the prompt as well as from the header", async () => {
    stubFetch();
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByTestId("set-up-profile"));

    expect(await screen.findByRole("dialog", { name: "Profile" })).toBeInTheDocument();
  });

  it("is told plainly that the figures are estimates, and for whom they are not meant (R49)", async () => {
    stubFetch();
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    const note = screen.getByTestId("profile-estimate-note");
    expect(note).toHaveTextContent("estimates");
    expect(note).toHaveTextContent("10% or more");
    expect(note).toHaveTextContent("under 18");
    expect(note).toHaveTextContent("pregnant or breastfeeding");
    expect(note).toHaveTextContent("medical condition");
  });

  it("cannot save until the person has said who they are", async () => {
    stubFetch();
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    expect(screen.getByTestId("save-profile")).toBeDisabled();

    await fillMetric(user);
    expect(screen.getByTestId("save-profile")).toBeEnabled();

    await user.clear(screen.getByTestId("profile-weight"));
    expect(screen.getByTestId("save-profile")).toBeDisabled();
  });
});

describe("creating a profile", () => {
  it("sends the metric figures as typed, and shows the targets the server worked out", async () => {
    const sent: Record<string, unknown>[] = [];
    stubFetch({ profile: { sent } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    await fillMetric(user);
    await user.click(screen.getByTestId("save-profile"));

    expect(await screen.findByTestId("profile-saved")).toBeInTheDocument();
    expect(sent).toEqual([
      {
        display_name: "Ana Example",
        sex: "male",
        birth_date: "1986-03-01",
        height_cm: 178,
        weight_kg: 82,
        activity: "moderate",
        goal: "lose",
        units: "metric",
        kcal_override: null,
        protein_override: null,
      },
    ]);
    expect(screen.getByTestId("profile-in-force")).toHaveTextContent("2,150 kcal and 130 g protein");
  });

  it("shows the working, step by step, from the server's own figures (R47)", async () => {
    stubFetch();
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);
    await fillMetric(user);
    await user.click(screen.getByTestId("save-profile"));
    await screen.findByTestId("profile-working");

    expect(screen.getByTestId("working-resting")).toHaveTextContent("age 40: 1,737.5 kcal");
    expect(screen.getByTestId("working-need")).toHaveTextContent("Times 1.55");
    expect(screen.getByTestId("working-need")).toHaveTextContent("2,693.1 kcal");
    expect(screen.getByTestId("working-goal")).toHaveTextContent("Minus 20% to lose fat: 2,154.5 kcal");
    expect(screen.getByTestId("working-calories")).toHaveTextContent("Rounded to 2,150 kcal.");
    expect(screen.getByTestId("working-protein")).toHaveTextContent("1.6 g per kg of body weight x 82 kg = 131.2 g, rounded to 130 g");
  });

  it("changes the Day view to the profile's targets, and says what they rest on (R48, D30)", async () => {
    stubFetch({ profile: { today: "2026-11-04" } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);
    await fillMetric(user);
    await user.click(screen.getByTestId("save-profile"));
    await screen.findByTestId("profile-saved");
    await user.click(screen.getByTestId("close-dialog"));

    expect(screen.getByTestId("day-target-calories")).toHaveTextContent("2,150");
    expect(screen.getByTestId("macro-protein-target")).toHaveTextContent("130");
    // calories and protein only: a fixed 250 g and 70 g beside a personal calorie figure would contradict it
    expect(screen.queryByTestId("macro-carbs-target")).not.toBeInTheDocument();
    expect(screen.queryByTestId("macro-fat-target")).not.toBeInTheDocument();
    expect(screen.getByTestId("macro-carbs")).toBeInTheDocument(); // the total is still there
    expect(screen.getByTestId("day-basis")).toHaveTextContent(/^From your profile \(82 kg, set 4 Nov/);
    expect(screen.queryByTestId("profile-prompt")).not.toBeInTheDocument();
  });

  it("says which field was refused, in the unit the server counts in, and stays open", async () => {
    stubFetch({ profile: { refuse: { field: "height_cm", msg: "Input should be greater than or equal to 120" } } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);
    await fillMetric(user);

    await user.click(screen.getByTestId("save-profile"));

    expect(await screen.findByTestId("profile-problem")).toHaveTextContent(
      "Height (cm): Input should be greater than or equal to 120",
    );
    expect(screen.queryByTestId("profile-saved")).not.toBeInTheDocument();
    expect(screen.getByTestId("profile-dialog")).toBeInTheDocument();
    // and the Day view is still on the standard targets, because nothing was saved
    expect(screen.getByTestId("day-target-calories")).toHaveTextContent("2,200");
  });

  it("does not repeat the server's wording for a field it has no name for", async () => {
    stubFetch({ profile: { refuse: { field: "something_new", msg: "field required" } } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);
    await fillMetric(user);

    await user.click(screen.getByTestId("save-profile"));

    expect(await screen.findByTestId("profile-problem")).toHaveTextContent("The server refused that request.");
  });
});

describe("pounds, feet and inches", () => {
  it("converts what was typed to metric before it is sent (R39)", async () => {
    const sent: Record<string, unknown>[] = [];
    stubFetch({ profile: { sent } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    await user.selectOptions(screen.getByTestId("profile-units"), "imperial");
    await user.type(screen.getByTestId("profile-name"), "Ana Example");
    fireEvent.change(screen.getByTestId("profile-birth"), { target: { value: "1986-03-01" } });
    await user.type(screen.getByTestId("profile-height-ft"), "5");
    await user.type(screen.getByTestId("profile-height-in"), "9");
    await user.type(screen.getByTestId("profile-weight"), "165");
    await user.click(screen.getByTestId("save-profile"));
    await screen.findByTestId("profile-saved");

    expect(sent[0].units).toBe("imperial");
    expect(sent[0].height_cm).toBeCloseTo(175.26, 2);
    expect(sent[0].weight_kg).toBeCloseTo(74.84, 2);
  });

  it("rewrites the boxes when the units change, instead of blanking them", async () => {
    stubFetch({ profile: { existing: ANA } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);
    expect(screen.getByTestId("profile-height-cm")).toHaveValue("178");
    expect(screen.getByTestId("profile-weight")).toHaveValue("82");

    await user.selectOptions(screen.getByTestId("profile-units"), "imperial");

    expect(screen.getByTestId("profile-height-ft")).toHaveValue("5");
    expect(screen.getByTestId("profile-height-in")).toHaveValue("10.1");
    expect(screen.getByTestId("profile-weight")).toHaveValue("180.8");

    // and back again, exactly: the boxes are rebuilt from the true figures, never from the rounded text
    await user.selectOptions(screen.getByTestId("profile-units"), "metric");
    expect(screen.getByTestId("profile-height-cm")).toHaveValue("178");
    expect(screen.getByTestId("profile-weight")).toHaveValue("82");
  });

  it("does not change a figure by switching units there and back, so saving is not a new weigh-in", async () => {
    const sent: Record<string, unknown>[] = [];
    stubFetch({ profile: { existing: ANA, sent, today: "2026-11-04" } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    await user.selectOptions(screen.getByTestId("profile-units"), "imperial");
    await user.selectOptions(screen.getByTestId("profile-units"), "metric");
    await user.selectOptions(screen.getByTestId("profile-units"), "imperial");
    await user.click(screen.getByTestId("save-profile"));
    await screen.findByTestId("profile-saved");

    expect(sent[0].height_cm).toBe(178);
    expect(sent[0].weight_kg).toBe(82);
    expect(sent[0].units).toBe("imperial");
    await user.click(screen.getByTestId("close-dialog"));
    expect(screen.getByTestId("day-basis")).toHaveTextContent("set 12 Oct"); // the date did not move
  });

  it("shows a multiplier with all its decimals", async () => {
    stubFetch({ profile: { existing: ANA } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    // 1.55 must not read as 1.6: this is the screen that shows the arithmetic honestly
    expect(screen.getByTestId("working-need")).toHaveTextContent("Times 1.55 for your activity");
  });

  it("sends an untouched height and weight back exactly as they were stored", async () => {
    // 165 lb converted to kilograms and typed back never lands on the stored figure, and the server dates a
    // weight by whether it changed - so opening the dialog and saving must not look like a new weigh-in.
    const sent: Record<string, unknown>[] = [];
    stubFetch({ profile: { existing: ANA_IMPERIAL, sent, today: "2026-11-04" } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);
    expect(screen.getByTestId("profile-weight")).toHaveValue("165");

    await user.selectOptions(screen.getByTestId("profile-goal"), "maintain");
    await user.click(screen.getByTestId("save-profile"));
    await screen.findByTestId("profile-saved");

    expect(sent[0].weight_kg).toBe(74.84274);
    expect(sent[0].height_cm).toBe(175.26);
    await user.click(screen.getByTestId("close-dialog"));
    expect(screen.getByTestId("day-basis")).toHaveTextContent("set 12 Oct");
  });

  it("sends the new figure, and the server re-dates it, when the weight was edited", async () => {
    const sent: Record<string, unknown>[] = [];
    stubFetch({ profile: { existing: ANA, sent, today: "2026-11-04" } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    await user.clear(screen.getByTestId("profile-weight"));
    await user.type(screen.getByTestId("profile-weight"), "79.5");
    await user.click(screen.getByTestId("save-profile"));
    await screen.findByTestId("profile-saved");
    await user.click(screen.getByTestId("close-dialog"));

    expect(sent[0].weight_kg).toBe(79.5);
    expect(screen.getByTestId("day-basis")).toHaveTextContent("set 4 Nov");
  });
});

describe("a person's own targets (R46)", () => {
  it("sends a figure typed in the box, as a whole number, and nothing for a box left empty", async () => {
    const sent: Record<string, unknown>[] = [];
    stubFetch({ profile: { existing: ANA, sent } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    await user.type(screen.getByTestId("profile-kcal-own"), "2300");
    await user.click(screen.getByTestId("save-profile"));
    await screen.findByTestId("profile-saved");

    expect(sent[0].kcal_override).toBe(2300);
    expect(sent[0].protein_override).toBeNull();
  });

  it("shows which figure is theirs, and what the calculation said", async () => {
    stubFetch({ profile: { existing: { ...ANA, kcal_override: 2300 } } });
    const user = userEvent.setup();
    await renderApp();

    expect(screen.getByTestId("day-target-calories")).toHaveTextContent("2,300");
    expect(screen.getByTestId("day-basis")).toHaveTextContent(/^Calories: your own\. Protein: from your profile/);

    await openDialog(user);
    expect(screen.getByTestId("working-calories-own")).toHaveTextContent(
      "You set your own calorie target of 2,300 kcal; the calculation gave 2,150.",
    );
    expect(screen.queryByTestId("working-protein-own")).not.toBeInTheDocument();
  });

  it("returns to the calculated figure when the box is cleared", async () => {
    stubFetch({ profile: { existing: { ...ANA, kcal_override: 2300 } } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    await user.clear(screen.getByTestId("profile-kcal-own"));
    await user.click(screen.getByTestId("save-profile"));
    await screen.findByTestId("profile-saved");
    await user.click(screen.getByTestId("close-dialog"));

    expect(screen.getByTestId("day-target-calories")).toHaveTextContent("2,150");
  });

  it("says when the floor decided the number", async () => {
    stubFetch({ profile: { existing: ANA, floored: true } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    expect(screen.getByTestId("working-calories")).toHaveTextContent(
      "Rounded to 1,200 kcal, which is the lowest this will suggest (1,500 kcal).",
    );
  });
});

describe("a profile that already exists", () => {
  it("is read before the Day view appears, so the standard targets never flash", async () => {
    stubFetch({ profile: { existing: ANA } });
    render(<App />);
    await screen.findByTestId("day-total-calories");

    // the first render that has a Day view already has the person's own target
    expect(screen.getByTestId("day-target-calories")).toHaveTextContent("2,150");
    expect(screen.getByTestId("day-basis")).toHaveTextContent("set 12 Oct");
  });

  it("is removed after one confirmation, and the account returns to the standard targets", async () => {
    const requests: string[] = [];
    stubFetch({
      profile: { existing: ANA },
      intercept: ({ path, method }) => {
        requests.push(`${method} ${path}`);
        return undefined;
      },
    });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    await user.click(screen.getByTestId("profile-remove"));
    expect(requests).not.toContain("DELETE /api/profile"); // one click only asks
    expect(screen.getByTestId("profile-remove-confirm")).toHaveTextContent("Your targets go back to the standard ones");

    await user.click(screen.getByTestId("profile-remove-yes"));

    await waitFor(() => expect(screen.queryByTestId("profile-dialog")).not.toBeInTheDocument());
    expect(requests).toContain("DELETE /api/profile");
    expect(screen.getByTestId("day-target-calories")).toHaveTextContent("2,200");
    expect(screen.getByTestId("profile-prompt")).toBeInTheDocument();
  });

  it("can be kept after all", async () => {
    stubFetch({ profile: { existing: ANA } });
    const user = userEvent.setup();
    await renderApp();
    await openDialog(user);

    await user.click(screen.getByTestId("profile-remove"));
    await user.click(within(screen.getByTestId("profile-remove-confirm")).getByRole("button", { name: "Keep it" }));

    expect(screen.queryByTestId("profile-remove-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("profile-remove")).toBeInTheDocument();
  });

  it("falls back to the standard targets, and says why, when it cannot be read", async () => {
    stubFetch({ offline: ({ path, method }) => path === "/api/profile" && method === "GET" });
    await renderApp();

    expect(screen.getByTestId("day-target-calories")).toHaveTextContent("2,200");
    expect(screen.getByTestId("page-problem")).toHaveTextContent("Your profile could not be loaded");
    expect(screen.getByTestId("page-problem")).toHaveTextContent("standard targets");
  });
});
