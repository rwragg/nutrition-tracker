"use client";

import { useState } from "react";
import { ApiError, registerAccount, signIn } from "@/lib/api";
import { BTN_PRIMARY, BTN_GHOST } from "./styles";
import TitleBar from "./TitleBar";

type Props = {
  onSignedIn: (session: { username: string }) => void;
};

type Mode = "sign-in" | "register";

/**
 * The way in: sign in, or register.
 *
 * Both forms send what is typed to the backend and render what the backend decides. Nothing
 * here knows what a valid password is, whether a username is free, or which food is whose -
 * the server owns those rules, so this screen cannot disagree with it (D12).
 *
 * Registering does not sign anyone in unless the server says the account is approved. A new account is
 * `pending` (Part 14, R65): it exists, and it cannot be used until the person who runs the app approves it, so the
 * honest thing to show is that, and not a sign-in that is about to be refused. What happens is the server's to decide
 * and this screen follows what it says (D12): it never works out for itself who is approved.
 */
export default function SignIn({ onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  // The account that was just made and is waiting; while set, the screen says so instead of showing a form.
  const [waiting, setWaiting] = useState<string | null>(null);

  function switchTo(next: Mode) {
    setMode(next);
    setPassword("");
    setFailed("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailed("");

    // Two calls when registering: the account, then the session. They fail differently, so they are
    // told apart: an account that was made but could not be signed into is not "could not be created".
    let created = false;
    try {
      if (mode === "register") {
        const account = await registerAccount({ username, email, password });
        created = true;
        if (account.status !== "approved") {
          setBusy(false);
          setPassword("");
          setWaiting(account.username);
          return;
        }
      }
      await signIn(username, password);
    } catch (error) {
      setBusy(false);
      // The server's sentence is more useful than a guess: it names the field in the way
      // ("that email is already registered"), which is the thing the person has to change.
      setFailed(
        created
          ? "The account was created, but signing in failed. Try signing in."
          : error instanceof ApiError && error.status !== 401
            ? error.message
            : mode === "register"
              ? "That account could not be created."
              : "That username and password did not match.",
      );
      return;
    }

    setBusy(false);
    onSignedIn({ username });
  }

  if (waiting !== null) {
    return (
      <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
        <TitleBar />

        <section
          className="day-panel mx-auto w-100"
          style={{ maxWidth: "26rem" }}
          data-testid="waiting-for-approval"
        >
          <h2 className="h5 mb-2">Waiting for approval</h2>
          <p className="small mb-3">
            The account <strong>{waiting}</strong> has been created. It cannot be used until whoever runs
            this app approves it.
          </p>
          <p className="text-muted-brand small mb-4">
            This app does not send email, so nothing will arrive when that happens. Try signing in again later, or
            ask them.
          </p>
          <button
            type="button"
            className={BTN_PRIMARY}
            data-testid="back-to-sign-in"
            onClick={() => {
              setWaiting(null);
              switchTo("sign-in");
            }}
          >
            Back to sign in
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
      <TitleBar />

      <section
        className="day-panel mx-auto w-100"
        style={{ maxWidth: "26rem" }}
        data-testid={mode === "register" ? "register" : "sign-in"}
      >
        <h2 className="h5 mb-1">{mode === "register" ? "Create an account" : "Sign in"}</h2>
        <p className="text-muted-brand small mb-4">
          {mode === "register"
            ? "Your log is yours: another account cannot see or change it."
            : "Sign in to your log."}
        </p>

        <form className="d-flex flex-column gap-3" onSubmit={submit}>
          <label className="d-flex flex-column gap-1">
            <span className="small text-muted-brand">Username</span>
            <input
              className="form-control"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          {mode === "register" && (
            <label className="d-flex flex-column gap-1">
              <span className="small text-muted-brand">Email</span>
              <input
                className="form-control"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}

          <label className="d-flex flex-column gap-1">
            <span className="small text-muted-brand">
              Password {mode === "register" && <span className="text-muted-brand">(at least 8 characters)</span>}
            </span>
            <input
              className="form-control"
              type="password"
              name="password"
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {failed && (
            <p className="text-ember small mb-0" role="alert">
              {failed}
            </p>
          )}

          <button type="submit" className={BTN_PRIMARY} disabled={busy} data-testid="sign-in-submit">
            {busy
              ? mode === "register"
                ? "Creating the account"
                : "Signing in"
              : mode === "register"
                ? "Create the account"
                : "Sign in"}
          </button>
        </form>

        <p className="small mb-0 mt-3">
          {mode === "register" ? (
            <button
              type="button"
              className={`${BTN_GHOST} p-0`}
              onClick={() => switchTo("sign-in")}
              data-testid="show-sign-in"
            >
              I already have an account
            </button>
          ) : (
            <button
              type="button"
              className={`${BTN_GHOST} p-0`}
              onClick={() => switchTo("register")}
              data-testid="show-register"
            >
              Create an account
            </button>
          )}
        </p>
      </section>
    </main>
  );
}
