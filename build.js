import * as esbuild from "esbuild";
import * as fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const production = process.argv.includes("--production");

// Load .env if present (for local development)
// In CI/CD set MIXPANEL_TOKEN directly in the environment instead
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);

    if (!match) continue;

    const [, key, value] = match;

    if (key === undefined || value === undefined) {
      continue;
    }

    if (!process.env[key]) {
      process.env[key] = value.trim();
    }
  }
}

const mixpanelToken = process.env["MIXPANEL_TOKEN"] ?? "";
if (!mixpanelToken) {
  console.warn(
    "[build] Warning: MIXPANEL_TOKEN not set — " +
    "feature-request capture will be disabled in this build."
  );
}

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  outfile: manifest.entry,
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcesContent: false,
  logLevel: "info",
  minify: production,
  sourcemap: !production,
  loader: { ".html": "text" },
  define: {
    // Replaces every occurrence of __MIXPANEL_TOKEN__ in bundled source
    // (including the inlined chat.html) with the literal token string.
    __MIXPANEL_TOKEN__: JSON.stringify(mixpanelToken),
  },
});
