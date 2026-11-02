import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useIsClient } from "@/components/use-is-client";

function Probe() {
  return <span>{useIsClient() ? "client" : "server"}</span>;
}

/**
 * The gate that keeps a clock out of the prerender.
 *
 * Every date on screen is derived from "now", which a prerendered page cannot know, so the app
 * renders its shell on the server and the tracker in the browser. Both halves are asserted here:
 * the server answer through `renderToString`, which is what the build does, and the browser answer
 * through a normal render.
 */
describe("the client gate", () => {
  it("says no while rendering on the server", () => {
    expect(renderToString(<Probe />)).toContain("server");
  });

  it("says yes in the browser", () => {
    render(<Probe />);

    expect(screen.getByText("client")).toBeInTheDocument();
  });
});
