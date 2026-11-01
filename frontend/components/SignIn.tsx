"use client";

import { useState } from "react";
import { BTN_PRIMARY } from "./styles";
import TitleBar from "./TitleBar";

type Props = {
  onSignedIn: (session: { username: string }) => void;
};

/**
 * The sign-in screen. It sends whatever is typed to the backend and renders what the
 * backend decides: the credentials live on the server, so nothing here can be right or
 * wrong on its own.
 */
export default function SignIn({ onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setBusy(false);

    if (response.ok) {
      onSignedIn(await response.json());
      return;
    }

    setFailed(true);
  }

  return (
    <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
      <TitleBar />

      <section className="day-panel mx-auto w-100" style={{ maxWidth: "26rem" }} data-testid="sign-in">
        <h2 className="h5 mb-1">Sign in</h2>
        <p className="text-muted-brand small mb-4">This MVP signs in with user / password.</p>

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

          <label className="d-flex flex-column gap-1">
            <span className="small text-muted-brand">Password</span>
            <input
              className="form-control"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {failed && (
            <p className="text-ember small mb-0" role="alert">
              That username and password did not match.
            </p>
          )}

          <button type="submit" className={BTN_PRIMARY} disabled={busy} data-testid="sign-in-submit">
            {busy ? "Signing in" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
