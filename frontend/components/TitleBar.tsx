import { Apple } from "lucide-react";

/** The app's header. Shared by the tracker and the sign-in screen. */
export default function TitleBar({ children }: { children?: React.ReactNode }) {
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
