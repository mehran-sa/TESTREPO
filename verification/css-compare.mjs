// Compares computed styles between the original inline stylesheet and the split
// stylesheets, for every element of the invoice, under every template class.
// Scripts are stripped: this isolates CSS.
import fs from "node:fs";
import path from "node:path";
import { JSDOM, ResourceLoader, VirtualConsole } from "jsdom";

// usage: node css-compare.mjs <reference-with-inline-style.html> <modular-index.html>
const [ORIG, MOD] = process.argv.slice(2);
if (!ORIG || !MOD) { console.error("usage: node css-compare.mjs <reference.html> <modular index.html>"); process.exit(2); }
const tmpA = path.join(path.dirname(path.resolve(ORIG)), "__css_a.html");
const tmpB = path.join(path.dirname(path.resolve(MOD)), "__css_b.html");

const origHtml = fs.readFileSync(ORIG, "utf8");
const modHtml = fs.readFileSync(MOD, "utf8");
const body = origHtml.slice(origHtml.indexOf("<body>"), origHtml.indexOf('<script>\n"use strict";'));
const css = origHtml.slice(origHtml.indexOf("<style>"), origHtml.indexOf("</style>") + 8);
const links = [...modHtml.matchAll(/<link rel="stylesheet" href="[^"]+">/g)].map(m => m[0]).join("\n");

fs.writeFileSync(tmpA,
  `<!doctype html><html><head><meta charset="utf-8">${css}</head>${body}</body></html>`);
fs.writeFileSync(tmpB,
  `<!doctype html><html><head><meta charset="utf-8">${links}</head>${body}</body></html>`);

const PROPS = ["display","position","width","height","min-height","margin-top","margin-right","margin-bottom",
  "margin-left","padding-top","padding-right","padding-bottom","padding-left","font-family","font-size",
  "font-weight","font-style","line-height","color","background-color","text-align","letter-spacing",
  "border-top-width","border-right-width","border-bottom-width","border-left-width","border-top-color",
  "border-radius","top","right","bottom","left","overflow","white-space","vertical-align","text-transform","opacity"];

async function load(file) {
  const vc = new VirtualConsole();
  const dom = await JSDOM.fromFile(file, {
    resources: new ResourceLoader(), pretendToBeVisual: true, virtualConsole: vc
  });
  await new Promise(r => setTimeout(r, 400));   // let <link> loads settle
  return dom.window;
}

const snapshot = win => {
  const doc = win.document;
  const out = {};
  for (const tpl of ["modern", "minimal", "classic", "royalty"]) {
    doc.getElementById("invoice").className = "invoice template-" + tpl;
    const els = [doc.getElementById("invoice"), ...doc.getElementById("invoice").querySelectorAll("*")];
    out[tpl] = els.map((el, i) => {
      const cs = win.getComputedStyle(el);
      const tag = el.tagName + (el.id ? "#" + el.id : "") + (el.className ? "." + String(el.className).replace(/\s+/g, ".") : "");
      return [i + ":" + tag, PROPS.map(p => p + "=" + cs.getPropertyValue(p)).join(";")];
    });
  }
  return out;
};

const a = snapshot(await load(tmpA));
const b = snapshot(await load(tmpB));

let checked = 0, diffs = [];
for (const tpl of Object.keys(a)) {
  if (a[tpl].length !== b[tpl].length) { diffs.push(`${tpl}: element count ${a[tpl].length} vs ${b[tpl].length}`); continue; }
  for (let i = 0; i < a[tpl].length; i++) {
    checked++;
    if (a[tpl][i][0] !== b[tpl][i][0]) diffs.push(`${tpl} ${i}: element mismatch`);
    else if (a[tpl][i][1] !== b[tpl][i][1]) {
      const pa = a[tpl][i][1].split(";"), pb = b[tpl][i][1].split(";");
      const changed = pa.map((v, k) => v === pb[k] ? null : `${v} -> ${pb[k]}`).filter(Boolean);
      diffs.push(`${tpl} ${a[tpl][i][0]}: ${changed.join(", ")}`);
    }
  }
}
console.log(`compared ${checked} element/template combinations across ${PROPS.length} properties`);
console.log(diffs.length ? `${diffs.length} DIFFERENCES:\n` + diffs.slice(0, 25).join("\n")
                         : "NO COMPUTED-STYLE DIFFERENCES");
fs.unlinkSync(tmpA);
fs.unlinkSync(tmpB);
