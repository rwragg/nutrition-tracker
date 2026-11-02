"use client";

import { useEffect, useState } from "react";
import { getSession, signOut as endSession } from "@/lib/api";
import type { View } from "@/lib/types";
import { useTracker } from "@/lib/use-tracker";
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
 * The log lives in the backend's database, so every date on screen comes from the server and the
 * whole tracker renders client-side: the prerendered page is the title bar and a placeholder.
 *
 * Whether anyone is signed in is the server's answer, so the app asks before it renders anything.
 * Signed out it shows the sign-in screen; the protection itself is the guard on every /api route,
 * which refuses without a session whatever this page chooses to show.
 */
export default function App() {
  return useIsClient() ? <SessionGate /> : <Shell />;
}

function SessionGate() {
  const [session, setSession] = useState<Session | null | "checking">("checking");

  useEffect(() => {
    let active = true;

    getSession()
      .then((data) => {
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

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
      <TitleBar />
      {children ?? <div className="day-panel" style={{ height: "14rem", opacity: 0.15 }} />}
    </main>
  );
}

function Tracker({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const tracker = useTracker();
  const [view, setView] = useState<View>("day");
  const [signOutFailed, setSignOutFailed] = useState(false);

  async function signOut() {
    setSignOutFailed(false);
    try {
      await endSession();
    } catch {
      // Still signed in, and saying nothing would look like a button that does not work.
      setSignOutFailed(true);
      return;
    }
    onSignOut();
  }

  const header = (
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
  );

  if (tracker.loading) {
    return (
      <Shell>
        <p className="text-center text-muted-brand mb-0" data-testid="loading">
          Loading your log...
        </p>
      </Shell>
    );
  }

  if (!tracker.store || !tracker.day) {
    return (
      <Shell>
        <p className="text-center text-ember mb-0" data-testid="load-failed">
          {tracker.error ?? "Your log could not be loaded."}
        </p>
      </Shell>
    );
  }

  const { store, day } = tracker;

  return (
    <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
      <TitleBar>{header}</TitleBar>

      {(tracker.error || signOutFailed) && (
        <div className="d-flex align-items-start justify-content-between gap-3" data-testid="page-problem">
          <p className="small text-ember mb-0">
            {tracker.error ?? "Could not log out. Check your connection and try again."}
          </p>
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => {
              tracker.dismissError();
              setSignOutFailed(false);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {view === "day" && (
        <DayView
          store={store}
          day={day}
          onSelectDay={(date) => {
            void tracker.selectDay(date);
          }}
          onAddEntry={tracker.addEntry}
          onRemoveEntry={tracker.removeEntry}
        />
      )}

      {view === "foods" && (
        <FoodsView store={store} onSaveFood={tracker.saveFood} onDeleteFood={tracker.deleteFood} />
      )}

      {view === "meals" && (
        <MealsView store={store} onSaveMeal={tracker.saveMeal} onDeleteMeal={tracker.deleteMeal} />
      )}

      {!tracker.error && (
        <p className="text-center small text-muted-brand mb-0" data-testid="storage-note">
          Saved. Your log is kept on the server, so it is here when you come back.
        </p>
      )}
    </main>
  );
}
