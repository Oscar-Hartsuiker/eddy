// Minimal test runner: bundles each tests/*.test.ts with esbuild (already a
// vite dependency) and executes it. No extra test framework needed.
//
//   npm test
import { build } from "esbuild";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const testsDir = join(root, "tests");

const entries = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

if (entries.length === 0) {
  console.error("no tests found in tests/");
  process.exit(1);
}

let failed = 0;

for (const name of entries) {
  const entry = join(testsDir, name);
  try {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      platform: "node",
      absWorkingDir: root,
      logLevel: "silent",
      write: false,
    });
    const code = result.outputFiles[0].text;
    await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  console.error(`${failed} test file(s) failed`);
  process.exit(1);
}
console.log(`${entries.length} test file(s) passed`);
