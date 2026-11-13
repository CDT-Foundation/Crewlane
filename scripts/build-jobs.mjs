// Bundles the worker and the migration runner into self-contained ESM files
// (dist/*.mjs) so the runtime image does not need node_modules for them.
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  logLevel: "info",
  // Some dependencies are CommonJS and call require().
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  tsconfig: "tsconfig.json",
};

await build({ ...common, entryPoints: ["src/worker/index.ts"], outfile: "dist/worker.mjs" });
await build({ ...common, entryPoints: ["src/db/migrate.ts"], outfile: "dist/migrate.mjs" });
