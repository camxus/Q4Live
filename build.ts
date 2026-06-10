import * as esbuild from "esbuild";
import * as fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8")) as { entry: string };
const production = process.argv.includes("--production");

if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === undefined || value === undefined) continue;
    if (!process.env[key]) {
      process.env[key] = value.trim();
    }
  }
}

const mixpanelToken = process.env["MIXPANEL_TOKEN"] ?? "";
if (!mixpanelToken) {
  console.warn("[build] Warning: MIXPANEL_TOKEN not set.");
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
  // better-sqlite3 is a native Node addon — must stay external so Node
  // loads the prebuilt .node binary from node_modules at runtime.
  external: ["better-sqlite3"],
  define: {
    __MIXPANEL_TOKEN__: JSON.stringify(mixpanelToken),
  },
});
