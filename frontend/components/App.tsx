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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
      <TitleBar />
      <div className="h-56 rounded-3xl bg-navy/10" />
    </main>
  );
}

function Tracker() {
  const [store, dispatch] = useReducer(storeReducer, null, () => createSeedStore());
  const [view, setView] = useState<View>("day");
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  const day = store.days.find((candidate) => candidate.id === selectedDayId) ?? store.days[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
      <TitleBar>
        <nav
          aria-label="Views"
          className="flex items-center gap-1 rounded-full border border-hairline bg-white p-1 shadow-sm"
        >
          {VIEWS.map((item) => {
            const active = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setView(item.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
                  active ? "bg-navy text-white" : "text-muted hover:text-navy"
                }`}
              >
                {item.label}
              </button>
            );
          })}
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

      <p className="text-center text-xs text-muted">
        Nothing is saved. Reload the page to start again from the sample days.
      </p>
    </main>
  );
}

function TitleBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-navy text-accent shadow-md shadow-navy/20 ring-2 ring-accent/40">
          <Apple className="size-5" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-navy">Nutrition Tracker</h1>
      </div>
      {children}
    </header>
  );
}
