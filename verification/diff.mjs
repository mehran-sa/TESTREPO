// Deep-compares two capture snapshots and prints every observable difference.
// Usage: node diff.mjs baseline.json candidate.json

import fs from "node:fs";

const [, , aPath, bPath] = process.argv;
const a = JSON.parse(fs.readFileSync(aPath, "utf8"));
const b = JSON.parse(fs.readFileSync(bPath, "utf8"));

const diffs = [];

function walk(pa, x, y) {
  if (x === y) return;
  const tx = x === null ? "null" : Array.isArray(x) ? "array" : typeof x;
  const ty = y === null ? "null" : Array.isArray(y) ? "array" : typeof y;
  if (tx !== ty) return diffs.push({ path: pa, before: x, after: y, kind: "type" });
  if (tx === "object" || tx === "array") {
    const keys = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
    for (const k of keys) walk(`${pa}.${k}`, x?.[k], y?.[k]);
    return;
  }
  if (x !== y) diffs.push({ path: pa, before: x, after: y, kind: "value" });
}

walk("", a, b);

const show = v => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s === undefined ? "undefined" : s;
};

// For long strings, point at the first differing character.
function context(before, after) {
  if (typeof before !== "string" || typeof after !== "string") return "";
  let i = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i++;
  const s = Math.max(0, i - 90);
  return `\n      at char ${i}\n      before: …${before.slice(s, i + 110)}…\n      after : …${after.slice(s, i + 110)}…`;
}

if (!diffs.length) {
  console.log("IDENTICAL — no observable differences across all captured cases.");
  process.exit(0);
}

console.log(`${diffs.length} DIFFERENCE(S):\n`);
for (const d of diffs) {
  const long = typeof d.before === "string" && d.before.length > 200;
  console.log(`  ${d.path}`);
  if (long) console.log(`      (long string, ${d.before.length} -> ${d.after.length} chars)${context(d.before, d.after)}`);
  else console.log(`      before: ${show(d.before)}\n      after : ${show(d.after)}`);
  console.log("");
}
process.exit(1);
