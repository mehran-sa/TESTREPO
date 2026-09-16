// Builds the jsdom-runnable test page: the module graph bundled as a classic
// script, and the split stylesheets inlined so jsdom sees the same CSS text.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const app = path.join(here, "..");
const out = path.join(here, "out");
fs.mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(here, "test-entry.js")],
  bundle: true, format: "iife", outfile: path.join(out, "test-bundle.js"),
  logLevel: "warning"
});

const html = fs.readFileSync(path.join(app, "index.html"), "utf8");
const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
const css = links.map(h => fs.readFileSync(path.join(app, h), "utf8")).join("\n");
const bundle = fs.readFileSync(path.join(out, "test-bundle.js"), "utf8");

const testHtml = html
  .replace(/<!--[\s\S]*?-->\n/, "")
  .replace(/<link rel="stylesheet" href="[^"]+">\n?/g, "")
  .replace("</head>", () => `<style>\n${css}\n</style>\n</head>`)
  // Replacer functions, not strings: the bundle contains "$&", which would
  // otherwise be treated as a replacement pattern and corrupt the output.
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>\n${bundle}\n</script>`);

fs.writeFileSync(path.join(out, "test-page.html"), testHtml);
console.log("built out/test-page.html", testHtml.length, "bytes;", links.length, "stylesheets inlined");
