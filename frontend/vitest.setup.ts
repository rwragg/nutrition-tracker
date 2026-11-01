import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { stubFetch } from "@/test/fetch-stub";

// A signed-in server for every test; individual tests override the handlers they care about.
beforeEach(() => {
  stubFetch();
});
