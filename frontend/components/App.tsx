"use client";

import { useEffect, useReducer, useState } from "react";
import { createSeedStore } from "@/lib/seed";
import { storeReducer } from "@/lib/store";
import type { LogEntry, Section, View } from "@/lib/types";
import DayView from "./DayView";
import FoodsView from "./FoodsView";
import MealsView from "./MealsView";
import SignIn from "./SignIn";
import TitleBar from "./TitleBar";
import { BTN_GHOST } from "./styles";
import { useIsClient } from "./use-is-client";

const VIEWS: { id: View; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "foods", label: "Foods" },
  { id: "meals", label: "Meals" },
];

type Session = { username: string };

/**
 * The log is seeded from today's date and lives only in the browser, so the whole
 * tracker renders client-side: the prerendered page is the title bar and a placeholder.
 *
 * Whether anyone is signed in is the server's answer, so the app asks before it renders
 * anything. Signed out it shows the sign-in screen; the protection itself is the guard
 * on every /api route, which refuses without a session whatever this page chooses to show.
 */
export default function App() {
  return useIsClient() ? <SessionGate /> : <Shell />;
}

function SessionGate() {
  const [session, setSession] = useState<Session | null | "checking">("checking");

  useEffect(() => {
    let active = true;

    fetch("/api/session")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Session | null) => {
        if (active) setSession(data);
      })
      .catch(() => {
        if (active) setSession(null);
      });

    return () => {
      active = false;
    };
  }, []);

  if (session === "checking") return <Shell />;
  if (session === null) return <SignIn onSignedIn={setSession} />;

  return <Tracker username={session.username} onSignOut={() => setSession(null)} />;
}

function Shell() {
  return (
    <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
      <TitleBar />
      <div className="day-panel" style={{ height: "14rem", opacity: 0.15 }} />
    </main>
  );
}

function Tracker({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [store, dispatch] = useReducer(storeReducer, null, () => createSeedStore());
  const [view, setView] = useState<View>("day");
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  const day = store.days.find((candidate) => candidate.id === selectedDayId) ?? store.days[0];

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    onSignOut();
  }

  return (
    <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
      <TitleBar>
        <div className="d-flex flex-wrap align-items-center gap-3">
          <nav aria-label="Views" className="view-nav nav gap-1">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="nav-link"
                aria-pressed={item.id === view}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <span className="text-muted-brand small" data-testid="signed-in-as">
            {username}
          </span>

          <button type="button" className={BTN_GHOST} onClick={signOut} data-testid="sign-out">
            Log out
          </button>
        </div>
      </TitleBar>

      {view === "day" && (
        <DayView
          store={store}
          day={day}
          onSelectDay={setSelectedDayId}
          onAddEntry={(section: Section, entry: LogEntry) =>
            dispatch({ type: "entry/add", dayId: day.id, section, entry })
          }
          onRemoveEntry={(section: Section, entryId: string) =>
            dispatch({ type: "entry/remove", dayId: day.id, section, entryId })
          }
        />
      )}

      {view === "foods" && <FoodsView store={store} dispatch={dispatch} />}
      {view === "meals" && <MealsView store={store} dispatch={dispatch} />}

      <p className="text-center small text-muted-brand mb-0">
        Nothing is saved. Reload the page to start again from the sample days.
      </p>
    </main>
  );
}
