// Drives the app through real user interactions (clicks, input events, drag
// and drop, saved libraries) and snapshots the resulting DOM + storage.
// Usage: node interact.mjs <index.html> <out.json>

import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const [, , htmlPath, outPath] = process.argv;
const html = fs.readFileSync(htmlPath, "utf8");

const virtualConsole = new VirtualConsole();
const errors = [];
virtualConsole.on("jsdomError", e => errors.push(String(e.message)));

let promptReply = null;
let confirmReply = true;

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(win) {
    let n = 0;
    win.crypto = win.crypto || {};
    win.crypto.randomUUID = () => `uuid-${String(++n).padStart(4, "0")}`;
    const FIXED = new Date("2026-06-15T09:00:00Z").getTime();
    const RealDate = win.Date;
    class FakeDate extends RealDate {
      constructor(...args) { if (args.length === 0) super(FIXED); else super(...args); }
      static now() { return FIXED; }
    }
    win.Date = FakeDate;
    win.print = () => {};
    win.confirm = () => confirmReply;
    win.prompt = () => promptReply;
    Object.defineProperty(win, "innerWidth", { value: 1600, writable: true, configurable: true });
  }
});

const win = dom.window;
await new Promise(r => win.document.readyState === "complete" ? r() : win.addEventListener("load", r));
const doc = win.document;
const $ = id => doc.getElementById(id);

const normalise = s => String(s)
  .replace(/uuid-\d{4}/g, "UUID")
  .replace(/column_\d+/g, "COLKEY")
  .replace(/_\d{13,}/g, "_TS");

const out = { steps: {}, errors };
const click = id => $(id).dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));

const record = label => {
  out.steps[label] = {
    invoiceHTML: normalise($("invoice").innerHTML),
    itemsEditor: normalise($("itemsEditor").innerHTML),
    columnEditor: normalise($("columnEditor").innerHTML),
    sectionToggles: normalise($("sectionToggles").innerHTML),
    savedTemplates: normalise($("savedTemplates").innerHTML),
    savedBrands: normalise($("savedBrands").innerHTML),
    tabs: [...doc.querySelectorAll(".tab")].map(t => t.className).join("|"),
    panes: [...doc.querySelectorAll(".tabpane")].map(t => t.id + ":" + t.className).join("|"),
    zoomLabel: $("zoomLabel").textContent,
    logoHint: $("logoHint").textContent,
    toast: $("toast").textContent,
    accent: doc.documentElement.style.getPropertyValue("--accent"),
    sidebarWidth: doc.documentElement.style.getPropertyValue("--sidebar-width"),
    storage: Object.fromEntries(Object.keys(win.localStorage).sort()
      .map(k => [k, normalise(win.localStorage.getItem(k))]))
  };
};

record("00_initial");

// ---- tab navigation
for (const tab of ["items", "columns", "design", "details"]) {
  [...doc.querySelectorAll(".tab")].find(t => t.dataset.tab === tab)
    .dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  record("01_tab_" + tab);
}

// ---- line items
click("addItemBtn"); click("addItemBtn");
record("02_add_items");

// type into the first item's fields
const firstCard = $("itemsEditor").querySelector(".itemcard");
for (const el of firstCard.querySelectorAll("[data-key]")) {
  const k = el.dataset.key;
  el.value = k === "quantity" ? "3" : k === "rate" ? "12.5" : k === "description"
    ? "Smith & Co \"quoted\" line\nsecond line" : "SKU-1";
  fire(el, "input");
}
record("03_edit_item");

// ---- totals inputs
for (const [id, v] of [["discount", "10"], ["tax", "20"], ["shipping", "4.5"]]) {
  $(id).value = v; fire($(id), "input");
}
record("04_totals");

// ---- template switching through the select
for (const tpl of ["minimal", "classic", "royalty", "modern"]) {
  $("template").value = tpl;
  fire($("template"), "change");
  record("05_template_" + tpl);
}

// ---- columns editor
click("addColumnBtn");
record("06_add_column");

const colRow = $("columnEditor").querySelector(".columnrow");
colRow.querySelector(".labelinput").value = "Renamed";
fire(colRow.querySelector(".labelinput"), "input");
colRow.querySelector(".type").value = "currency";
fire(colRow.querySelector(".type"), "change");
colRow.querySelector(".width").value = "25";
fire(colRow.querySelector(".width"), "change");
colRow.querySelector(".align").value = "center";
fire(colRow.querySelector(".align"), "change");
colRow.querySelector(".role").value = "amount";
fire(colRow.querySelector(".role"), "change");
colRow.querySelector(".vis").checked = false;
fire(colRow.querySelector(".vis"), "change");
record("07_edit_column");

// drag column 3 onto column 1 (handlers are assigned directly, so call them)
const rows = [...$("columnEditor").querySelectorAll(".columnrow")];
const transfer = { _v: "", setData: (_t, v) => { transfer._v = String(v); }, getData: () => transfer._v };
rows[2].ondragstart({ dataTransfer: transfer });
rows[0].ondrop({ preventDefault() {}, dataTransfer: transfer });
record("08_reorder_columns");

// delete a column
$("columnEditor").querySelector(".columnrow button").dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
record("09_delete_column");

// ---- section toggles
const toggle = $("sectionToggles").querySelector('[data-section-toggle="notes"]');
toggle.checked = false;
fire(toggle, "change");
const footerToggle = $("sectionToggles").querySelector('[data-section-toggle="footer"]');
footerToggle.checked = false;
fire(footerToggle, "change");
record("10_section_toggles");

// ---- design controls
$("accentHex").value = "#aa3311"; fire($("accentHex"), "input");
$("logoWidth").value = "9999"; fire($("logoWidth"), "input");
$("logoHeight").value = "-5"; fire($("logoHeight"), "input");
$("logoAlign").value = "right"; fire($("logoAlign"), "change");
$("logoFit").value = "cover"; fire($("logoFit"), "change");
record("11_design");

$("accentHex").value = "not-a-colour"; fire($("accentHex"), "input");
record("12_bad_accent");

// ---- zoom
click("zoomIn"); click("zoomIn"); click("zoomIn"); click("zoomIn"); click("zoomIn");
record("13_zoom_in_clamped");
for (let i = 0; i < 10; i++) click("zoomOut");
record("14_zoom_out_clamped");

// ---- logo removal path
click("removeLogoBtn");
record("15_remove_logo");

// ---- saved template library
promptReply = "My Template";
click("saveTemplateBtn");
record("16_save_template");

promptReply = "my template";           // same name, different case -> overwrite prompt
confirmReply = true;
click("saveTemplateBtn");
record("17_overwrite_template");

promptReply = "   ";                   // empty after trim
click("saveTemplateBtn");
record("18_empty_template_name");

promptReply = "Brand A";
click("saveBrandBtn");
record("19_save_brand");

win.loadInvoiceTemplate(0);
record("20_load_template");

win.loadInvoiceBrand(0);
record("21_load_brand");

// legacy brand record shape
const brands = JSON.parse(win.localStorage.getItem("invoiceStudio.brands.v1"));
brands.push({ name: "Legacy", data: { company: { name: "Legacy Co", reg: "R1", address: "Old Street" }, currency: "CAD", template: "royalty" } });
win.localStorage.setItem("invoiceStudio.brands.v1", JSON.stringify(brands));
win.refreshLibraries?.();
win.loadInvoiceBrand(1);
record("22_load_legacy_brand");

confirmReply = true;
win.deleteInvoiceTemplate(0);
win.deleteInvoiceBrand(0);
record("23_delete_library_entries");

// ---- clear items / restore columns
click("clearItemsBtn");
record("24_clear_items");
click("restoreColumnsBtn");
record("25_restore_columns");

// ---- sidebar resizer
$("sidebarResizer").dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
win.dispatchEvent(Object.assign(new win.MouseEvent("mousemove", { bubbles: true }), {}));
// clientX is read-only on the event; dispatch a plain event object instead
const move = new win.MouseEvent("mousemove", { bubbles: true, clientX: 500 });
win.dispatchEvent(move);
const moveClamped = new win.MouseEvent("mousemove", { bubbles: true, clientX: 9000 });
win.dispatchEvent(moveClamped);
win.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true }));
record("26_sidebar_resize");
$("sidebarResizer").dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
record("27_sidebar_reset");

// ---- invalid JSON import path
try { win.load(null); } catch (e) { out.steps.loadNullError = String(e.message); }
try { win.load("nope"); } catch (e) { out.steps.loadStringError = String(e.message); }
win.load({});
record("28_load_empty_object");

// ---- HTML injection through a line item (security-relevant)
win.load({
  version: 2, logo: "", zoom: 1,
  columns: [{ id: "x", key: "description", label: "Desc", type: "text", width: 50, align: "left", visible: true, role: "none" }],
  items: [{ description: '<img src=x onerror="window.__pwned=1">' }],
  sections: {},
  fields: { template: "modern", currency: "GBP" }
});
out.steps.injection = {
  tbody: $("pItems").innerHTML,
  imgCount: $("pItems").querySelectorAll("img").length,
  text: $("pItems").textContent
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`recorded ${Object.keys(out.steps).length} interaction steps -> ${outPath}`);
if (errors.length) console.log("jsdom errors:", errors);
