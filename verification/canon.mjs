// Canonicalises a capture snapshot for cross-architecture comparison:
// the print document's stylesheet text is reduced to a sorted multiset of CSS
// rules, so splitting one <style> into several files/elements is not reported
// as a behavioural difference while any lost/added/changed rule still is.
import fs from "node:fs";

const rules = css => {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "")
    // the font files moved to assets/, so the @font-face url is expected to differ
    .replace(/url\("(?:\.\.\/\.\.\/assets|\.)\/fonts\//g, 'url("FONTS/');
  const out = []; let depth = 0, buf = "";
  for (const ch of css) {
    buf += ch;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (!depth) { out.push(buf.replace(/\s+/g, " ").trim()); buf = ""; } }
  }
  return out;
};

const snap = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const c of Object.values(snap.cases)) {
  if (!c.printDoc) continue;
  const r = rules(c.printDoc.styleText).sort();
  c.printDoc.styleRuleCount = r.length;
  c.printDoc.styleText = r.join("\n");
  delete c.printDoc.styleLength;
}
fs.writeFileSync(process.argv[3], JSON.stringify(snap, null, 2));
console.log("canonicalised ->", process.argv[3]);
