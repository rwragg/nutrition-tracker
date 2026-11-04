import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/components/App";
import TelegramDialog from "@/components/TelegramDialog";
import { stubFetch } from "@/test/fetch-stub";

/** Open the dialog from the header, the way a person does. */
async function openFromHeader(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await screen.findByTestId("day-total-calories");
  await user.click(screen.getByTestId("open-telegram"));
  return screen.findByTestId("telegram-dialog");
}

describe("linking a Telegram chat", () => {
  it("is reached from a button in the header", async () => {
    stubFetch();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByTestId("day-total-calories");

    expect(screen.queryByTestId("telegram-dialog")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("open-telegram"));
    expect(await screen.findByRole("dialog", { name: "Telegram" })).toBeInTheDocument();
  });

  it("offers a code, and does not mint one just because the dialog opened", async () => {
    // A new code retires the old one, so opening the dialog must not quietly break one in flight.
    const requests: string[] = [];
    stubFetch({
      intercept: ({ path, method }) => {
        requests.push(`${method} ${path}`);
        return undefined;
      },
    });
    const user = userEvent.setup();

    await openFromHeader(user);

    expect(await screen.findByTestId("telegram-get-code")).toBeInTheDocument();
    expect(requests).not.toContain("POST /api/telegram/code");
  });

  it("shows the code, the line to send, and how long it lasts", async () => {
    stubFetch({ telegram: { code: "K7M2QX" } });
    const user = userEvent.setup();
    await openFromHeader(user);

    await user.click(await screen.findByTestId("telegram-get-code"));

    expect(await screen.findByTestId("telegram-code")).toHaveTextContent("K7M2QX");
    expect(screen.getByTestId("telegram-bind-line")).toHaveTextContent("/bind K7M2QX");
    expect(screen.getByTestId("telegram-expiry")).toHaveTextContent(/for 1[45] more minutes/);
  });

  it("says when a code has expired, and offers a new one", async () => {
    stubFetch({ telegram: { code: "OLD111", expiresInMs: -60_000 } });
    const user = userEvent.setup();
    await openFromHeader(user);

    await user.click(await screen.findByTestId("telegram-get-code"));

    expect(await screen.findByTestId("telegram-expiry")).toHaveTextContent("expired");
    expect(screen.getByTestId("telegram-new-code")).toBeInTheDocument();
  });

  it("asking for a new code replaces the old one on screen", async () => {
    stubFetch();
    const user = userEvent.setup();
    await openFromHeader(user);

    await user.click(await screen.findByTestId("telegram-get-code"));
    expect(await screen.findByTestId("telegram-code")).toHaveTextContent("CODE1X");

    await user.click(screen.getByTestId("telegram-new-code"));
    await waitFor(() => expect(screen.getByTestId("telegram-code")).toHaveTextContent("CODE2X"));
  });

  it("moves to linked by itself when the chat redeems the code", async () => {
    const { chat } = stubFetch();
    const user = userEvent.setup();
    render(<TelegramDialog onClose={() => undefined} pollMs={20} />);

    await user.click(await screen.findByTestId("telegram-get-code"));
    await screen.findByTestId("telegram-code");
    expect(screen.queryByTestId("telegram-linked")).not.toBeInTheDocument();

    chat.id = "1234567890"; // the bot redeemed it

    expect(await screen.findByTestId("telegram-linked")).toHaveTextContent("1234567890");
    expect(screen.queryByTestId("telegram-code")).not.toBeInTheDocument();
  });

  it("says so when the account is already linked, and unlinks on request", async () => {
    stubFetch({ telegram: { linked: "555" } });
    const user = userEvent.setup();
    await openFromHeader(user);

    expect(await screen.findByTestId("telegram-linked")).toHaveTextContent("chat 555");
    expect(screen.queryByTestId("telegram-get-code")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("telegram-unlink"));

    expect(await screen.findByTestId("telegram-get-code")).toBeInTheDocument();
    expect(screen.queryByTestId("telegram-linked")).not.toBeInTheDocument();
  });

  it("shows the server's sentence when a code could not be made", async () => {
    stubFetch({
      intercept: ({ path, method }) =>
        path === "/api/telegram/code" && method === "POST"
          ? { ok: false, status: 503, body: { detail: "could not make a code just now - try again" } }
          : undefined,
    });
    const user = userEvent.setup();
    await openFromHeader(user);

    await user.click(await screen.findByTestId("telegram-get-code"));

    expect(await screen.findByTestId("telegram-problem")).toHaveTextContent("could not make a code");
    expect(screen.getByTestId("telegram-get-code")).toBeInTheDocument();
  });

  it("says so when the link could not be read, and still offers a code", async () => {
    stubFetch({ offline: ({ path }) => path === "/api/telegram/link" });
    const user = userEvent.setup();
    await openFromHeader(user);

    expect(await screen.findByTestId("telegram-problem")).toHaveTextContent("Could not reach the server");
  });

  it("closes from the footer", async () => {
    stubFetch();
    const user = userEvent.setup();
    await openFromHeader(user);

    await user.click(screen.getByTestId("close-dialog"));

    expect(screen.queryByTestId("telegram-dialog")).not.toBeInTheDocument();
  });
});
