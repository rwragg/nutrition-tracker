import { vi } from "vitest";

type SessionAnswer = { ok: boolean; body?: unknown };
type LoginAnswer = { ok: boolean; body?: unknown };

/**
 * The app asks the server who is signed in before it renders anything, so the unit
 * tests need a fetch that answers. Signed in by default, because that is the state
 * most tests are about; a test that needs the signed-out screen or a failed sign-in
 * overrides the relevant handler.
 */
export function stubFetch(
  handlers: {
    session?: SessionAnswer;
    login?: (submitted: { username?: string; password?: string }) => LoginAnswer;
  } = {},
) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const answer = (body: unknown, status: number) =>
      Promise.resolve(new Response(JSON.stringify(body ?? {}), { status }));

    if (url.endsWith("/api/session")) {
      const session = handlers.session ?? { ok: true, body: { username: "user" } };
      return answer(session.body, session.ok ? 200 : 401);
    }

    if (url.endsWith("/api/login")) {
      const submitted = JSON.parse(String(init?.body ?? "{}"));
      const login = handlers.login?.(submitted) ?? { ok: true, body: { username: submitted.username } };
      return answer(login.body ?? { username: submitted.username }, login.ok ? 200 : 401);
    }

    if (url.endsWith("/api/logout")) {
      return answer({ status: "signed out" }, 200);
    }

    return answer({}, 404);
  });
}
