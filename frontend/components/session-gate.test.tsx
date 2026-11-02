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

  it("registers an account and signs it in", async () => {
    const user = userEvent.setup();
    let registered: Record<string, unknown> | null = null;
    stubFetch({
      session: { ok: false },
      register: (submitted) => {
        registered = submitted;
        return { ok: true, status: 201, body: { id: "user-1", username: submitted.username } };
      },
      login: (submitted) => ({ ok: true, body: { username: submitted.username } }),
    });

    render(<App />);
    await screen.findByTestId("sign-in");
    await user.click(screen.getByTestId("show-register"));
    await screen.findByTestId("register");

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText(/^Password/), "a-long-enough-password");
    await user.click(screen.getByTestId("sign-in-submit"));

    // registered, then signed in - which is what the person meant by doing it
    expect(await screen.findByTestId("day-total-calories")).toBeInTheDocument();
    expect(screen.getByTestId("signed-in-as")).toHaveTextContent("alice");
    expect(registered).toEqual({
      username: "alice",
      email: "alice@example.com",
      password: "a-long-enough-password",
    });
  });

  it("has no telegram id field: a chat is linked with a code, not typed into a form", async () => {
    const user = userEvent.setup();
    stubFetch({ session: { ok: false } });

    render(<App />);
    await screen.findByTestId("sign-in");
    await user.click(screen.getByTestId("show-register"));
    await screen.findByTestId("register");

    expect(screen.queryByLabelText(/telegram/i)).not.toBeInTheDocument();
  });

  it("says the account was made when only the sign-in after it failed", async () => {
    const user = userEvent.setup();
    stubFetch({ session: { ok: false }, login: () => ({ ok: false }) });

    render(<App />);
    await screen.findByTestId("sign-in");
    await user.click(screen.getByTestId("show-register"));
    await screen.findByTestId("register");

    await user.type(screen.getByLabelText("Username"), "carol");
    await user.type(screen.getByLabelText("Email"), "carol@example.com");
    await user.type(screen.getByLabelText(/^Password/), "a-long-enough-password");
    await user.click(screen.getByTestId("sign-in-submit"));

    // "could not be created" would be wrong, and would send her to register again into a 409
    expect(await screen.findByRole("alert")).toHaveTextContent("account was created");
  });

  it("says so when logging out fails, and stays signed in", async () => {
    const user = userEvent.setup();
    stubFetch({ offline: ({ path }) => path === "/api/logout" });

    render(<App />);
    await screen.findByTestId("day-total-calories");
    await user.click(screen.getByTestId("sign-out"));

    expect(await screen.findByTestId("page-problem")).toHaveTextContent("Could not log out");
    expect(screen.getByTestId("day-total-calories")).toBeInTheDocument();
  });

  it("shows why a registration was refused, and stays on the form", async () => {
    const user = userEvent.setup();
    stubFetch({
      session: { ok: false },
      register: () => ({ ok: false, status: 409, body: { detail: "that email is already registered" } }),
    });

    render(<App />);
    await screen.findByTestId("sign-in");
    await user.click(screen.getByTestId("show-register"));
    await screen.findByTestId("register");

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText(/^Password/), "a-long-enough-password");
    await user.click(screen.getByTestId("sign-in-submit"));

    // the server's sentence, not a guess: it names the field the person has to change
    expect(await screen.findByRole("alert")).toHaveTextContent("that email is already registered");
    expect(screen.getByTestId("register")).toBeInTheDocument();
    expect(screen.queryByTestId("day-total-calories")).not.toBeInTheDocument();
  });
});
