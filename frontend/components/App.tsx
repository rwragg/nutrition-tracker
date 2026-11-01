"use client";

import { useReducer, useState } from "react";
import { Apple } from "lucide-react";
import { createSeedStore } from "@/lib/seed";
import { storeReducer } from "@/lib/store";
import type { LogEntry, Section, View } from "@/lib/types";
import DayView from "./DayView";
import FoodsView from "./FoodsView";
import MealsView from "./MealsView";
import { useIsClient } from "./use-is-client";

const VIEWS: { id: View; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "foods", label: "Foods" },
  { id: "meals", label: "Meals" },
];

/**
 * The log is seeded from today's date and lives only in the browser, so the whole
 * tracker renders client-side: the prerendered page is the title bar and a placeholder.
 */
export default function App() {
  return useIsClient() ? <Tracker /> : <Shell />;
}

function Shell() {
  return (
    <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
      <TitleBar />
      <div className="day-panel" style={{ height: "14rem", opacity: 0.15 }} />
    </main>
  );
}

function Tracker() {
  const [store, dispatch] = useReducer(storeReducer, null, () => createSeedStore());
  const [view, setView] = useState<View>("day");
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  const day = store.days.find((candidate) => candidate.id === selectedDayId) ?? store.days[0];

  return (
    <main className="app-shell d-flex flex-grow-1 flex-column gap-4">
      <TitleBar>
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

function TitleBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="d-flex flex-wrap align-items-center justify-content-between gap-3">
      <div className="d-flex align-items-center gap-3">
        <span className="app-mark">
          <Apple size={20} aria-hidden="true" />
        </span>
        <h1 className="h4 fw-semibold mb-0">Nutrition Tracker</h1>
      </div>
      {children}
    </header>
  );
}
