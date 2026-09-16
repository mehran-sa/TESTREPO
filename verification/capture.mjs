// Loads an index.html build in jsdom, drives it through fixtures, and writes a
// deterministic JSON snapshot of everything the user can observe:
// rendered invoice DOM, computed totals, print-document DOM, CSV import results.
//
// Usage: node capture.mjs <path-to-index.html> <output.json>

import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { CASES, CALC_CASES, CSV_SAMPLES, TEMPLATES } from "./fixtures.mjs";

const [, , htmlPath, outPath] = process.argv;
if (!htmlPath || !outPath) {
  console.error("usage: node capture.mjs <index.html> <out.json>");
  process.exit(2);
}

const html = fs.readFileSync(htmlPath, "utf8");

const virtualConsole = new VirtualConsole();
const consoleErrors = [];
virtualConsole.on("jsdomError", e => consoleErrors.push(String(e.message)));

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(win) {
    // jsdom has no crypto.randomUUID; make it deterministic so snapshots diff cleanly.
    let n = 0;
    win.crypto = win.crypto || {};
    win.crypto.randomUUID = () => `uuid-${String(++n).padStart(4, "0")}`;
    // Deterministic clock so today()/plusDays() do not vary between runs.
    const FIXED = new Date("2026-06-15T09:00:00Z").getTime();
    const RealDate = win.Date;
    class FakeDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(FIXED);
        else super(...args);
      }
      static now() { return FIXED; }
    }
    win.Date = FakeDate;
    win.print = () => {};
    // window.prompt/confirm are not implemented in jsdom.
    win.confirm = () => true;
    win.prompt = () => null;
  }
});

const win = dom.window;
await new Promise(resolve => {
  if (win.document.readyState === "complete") resolve();
  else win.addEventListener("load", resolve);
});

const doc = win.document;
const $ = id => doc.getElementById(id);

// Normalise volatile details that are not part of observable behaviour.
const normalise = s => String(s)
  .replace(/uuid-\d{4}/g, "UUID")
  .replace(/column_\d+/g, "COLKEY")
  .replace(/_\d{13,}/g, "_TS");

const snapshot = { cases: {}, calc: {}, csv: {}, units: {}, errors: consoleErrors };

// Some helpers legitimately throw on malformed input. Record the thrown message
// so that "throws exactly here, with exactly this error" stays part of the contract.
const probe = fn => { try { return { ok: fn() }; } catch (e) { return { threw: `${e.name}: ${e.message}` }; } };

// ---------------------------------------------------------------- rendered DOM
for (const c of CASES) {
  win.load(JSON.parse(JSON.stringify(c.data)));
  const inv = $("invoice");
  snapshot.cases[c.name] = {
    invoiceClass: inv.className,
    invoiceHTML: normalise(inv.innerHTML),
    invoiceText: normalise(inv.textContent.replace(/\s+/g, " ").trim()),
    invoiceStyle: inv.getAttribute("style") || "",
    fontHint: $("fontHint").textContent,
    zoomLabel: $("zoomLabel").textContent,
    accentVar: doc.documentElement.style.getPropertyValue("--accent"),
    accentRgbVar: doc.documentElement.style.getPropertyValue("--accent-rgb"),
    statusStyle: $("pStatus").getAttribute("style") || "",
    rowDisplay: {
      discount: $("discountRow").style.display,
      tax: $("taxRow").style.display,
      shipping: $("shippingRow").style.display
    },
    totals: {
      subtotal: $("pSubtotal").textContent,
      discount: $("pDiscount").textContent,
      discountLabel: $("discountLabel").textContent,
      tax: $("pTax").textContent,
      taxLabel: $("taxLabel").textContent,
      shipping: $("pShipping").textContent,
      total: $("pTotal").textContent,
      balance: $("pBalance").textContent
    },
    calc: win.calc(),
    serialized: normalise(JSON.stringify(win.serialize())),
    // sidebar editors
    columnEditorHTML: normalise($("columnEditor").innerHTML),
    itemsEditorHTML: normalise($("itemsEditor").innerHTML),
    sectionTogglesHTML: normalise($("sectionToggles").innerHTML),
    // the document that Print / Export PDF actually produces
    printDoc: (() => {
      const frame = win.buildInvoicePrintDocument(false);
      const f = doc.getElementById("invoicePrintFrame");
      const out = f && f.contentDocument
        ? {
            title: f.contentDocument.title,
            body: normalise(f.contentDocument.body.innerHTML),
            styleLength: [...f.contentDocument.querySelectorAll("style")]
              .map(s => (s.textContent || "").length).join(","),
            styleText: normalise([...f.contentDocument.querySelectorAll("style")]
              .map(s => s.textContent || "").join("\n"))
          }
        : null;
      if (f) f.remove();
      return out;
    })()
  };
}

// --------------------------------------------------------------- pure business
for (const cc of CALC_CASES) {
  $("discount").value = cc.discount;
  $("tax").value = cc.tax;
  $("shipping").value = cc.shipping;
  snapshot.calc[JSON.stringify(cc)] = win.calc();
}

// currency/date/number formatting helpers across currencies
const fmtProbe = {};
for (const cur of ["GBP", "USD", "EUR", "BDT", "AUD", "CAD"]) {
  $("currency").value = cur;
  fmtProbe[cur] = [0, 1, -1, 1234.567, 0.005, 1e9].map(v => win.money(v));
}
snapshot.units.money = fmtProbe;
$("currency").value = "GBP";

snapshot.units.dateFmt = ["", "2026-01-05", "2026-12-31", "nonsense"].map(v => probe(() => win.dateFmt(v)));
snapshot.units.oneEducationDateFmt = ["", "2026-01-05", "2026-1-5", "nonsense"].map(v => probe(() => win.oneEducationDateFmt(v)));
snapshot.units.num = ["", "0", "12.5", "abc", null, undefined, "1e3", "-4"].map(v => win.num(v));
snapshot.units.esc = ['<b>&"x"', "", null, "a\nb"].map(v => win.esc(v));
snapshot.units.normalizeKey = ["", "Net Qty", "  A--B  ", "___", "Ünit"].map(v => win.normalizeKey(v));
snapshot.units.safeColor = ["#ffffff", "#FFF", "red", "#12345g", "#123456"].map(v => win.safeColor(v));
snapshot.units.plusDays = [["2026-02-27", 14], ["2026-12-31", 1], ["2024-02-28", 1]].map(([s, n]) => probe(() => win.plusDays(s, n)));
snapshot.units.today = win.today();
snapshot.units.fmtCell = [
  ["12.5", { type: "currency" }],
  ["12.5", { type: "number" }],
  ["12.5", { type: "percentage" }],
  ["12", { type: "percentage" }],
  ["2026-03-04", { type: "date" }],
  ["a\nb", { type: "text" }],
  ["<b>bold</b> & co", { type: "text" }],
  [null, { type: "text" }]
].map(([v, col]) => probe(() => win.fmtCell(v, col)));
snapshot.units.oneEducationPaymentRows = [
  "Account Name: X\nSort Code - 01-02-03\nfree line\nIBAN GB00",
  "",
  "key: value: more"
].map(v => win.oneEducationPaymentRows(v));
snapshot.units.parseCSV = CSV_SAMPLES.map(s => win.parseCSV(s));

// CSV import -> items, per template default columns
for (let i = 0; i < CSV_SAMPLES.length; i++) {
  win.load(JSON.parse(JSON.stringify(CASES[0].data)));
  snapshot.csv[i] = normalise(JSON.stringify(win.mapRows(win.parseCSV(CSV_SAMPLES[i]))));
}

// ------------------------------------------------- persistence / library shape
win.load(JSON.parse(JSON.stringify(CASES[1].data)));
snapshot.units.localStorageKeys = Object.keys(win.localStorage).sort();
snapshot.units.persisted = normalise(win.localStorage.getItem("invoiceStudioPro.v2") || "");
snapshot.units.serializeBrand = normalise(JSON.stringify(win.serializeBrand()));
snapshot.units.globals = [
  "loadInvoiceTemplate", "deleteInvoiceTemplate", "loadInvoiceBrand", "deleteInvoiceBrand",
  "buildInvoicePrintDocument", "__janetsFontWaitPatched"
].map(k => `${k}:${typeof win[k]}`);
snapshot.units.templateOptions = [...$("template").options].map(o => o.value + "|" + o.textContent);
snapshot.units.templatesTested = TEMPLATES;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
console.log(`captured ${Object.keys(snapshot.cases).length} render cases -> ${outPath}`);
if (consoleErrors.length) console.log("jsdom errors:", consoleErrors.length);
