import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/components/App";
import { stubFetch } from "@/test/fetch-stub";

describe("the sign-in gate", () => {
  it("shows the sign-in screen when nobody is signed in", async () => {
    stubFetch({ session: { ok: false } });

    render(<App />);

    expect(await screen.findByTestId("sign-in")).toBeInTheDocument();
    expect(screen.queryByTestId("day-total-calories")).not.toBeInTheDocument();
  });

  it("shows the tracker once the credentials are accepted, and names the user", async () => {
    const user = userEvent.setup();
    stubFetch({
      session: { ok: false },
      login: (submitted) =>
        submitted.password === "password"
          ? { ok: true, body: { username: submitted.username } }
          : { ok: false },
    });

    render(<App />);
    await screen.findByTestId("sign-in");

    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByTestId("sign-in-submit"));

    expect(await screen.findByTestId("day-total-calories")).toBeInTheDocument();
    expect(screen.getByTestId("signed-in-as")).toHaveTextContent("user");
  });

  it("says so when the credentials are refused, and stays on the screen", async () => {
    const user = userEvent.setup();
    stubFetch({ session: { ok: false }, login: () => ({ ok: false }) });

    render(<App />);
    await screen.findByTestId("sign-in");

    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByTestId("sign-in-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("did not match");
    expect(screen.queryByTestId("day-total-calories")).not.toBeInTheDocument();
    expect(screen.getByTestId("sign-in")).toBeInTheDocument();
  });

  it("goes back to the sign-in screen when you log out", async () => {
    const user = userEvent.setup();

    render(<App />);
    await screen.findByTestId("day-total-calories");

    await user.click(screen.getByTestId("sign-out"));

    expect(await screen.findByTestId("sign-in")).toBeInTheDocument();
    expect(screen.queryByTestId("day-total-calories")).not.toBeInTheDocument();
  });
});
