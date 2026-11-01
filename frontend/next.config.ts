import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is served statically by the FastAPI backend at "/", so the build
  // produces a self-contained export in out/ rather than a server.
  //
  // Export mode rules out two flags this config used to carry: partial
  // prefetching (Next refuses the build outright: "PPR cannot be enabled in
  // export mode") and cacheComponents, which enables the same machinery. The app
  // holds its data in memory and uses no "use cache" directives, so neither was
  // load-bearing - the export is the deployment target, so they stay off.
  output: "export",
};

export default nextConfig;
