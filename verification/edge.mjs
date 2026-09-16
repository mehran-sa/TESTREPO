// Covers paths the render/interaction harnesses cannot reach:
// the <dialog> overwrite branch, logo upload validation, JSON download.
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const vc = new VirtualConsole();
const errs = []; vc.on("jsdomError", e => errs.push(String(e.message)));
let promptReply = null, confirmReply = true;
const dom = new JSDOM(fs.readFileSync(process.argv[2], "utf8"), {
  url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    let n = 0; w.crypto = w.crypto || {}; w.crypto.randomUUID = () => `u${++n}`;
    w.print = () => {}; w.confirm = () => confirmReply; w.prompt = () => promptReply;
    w.URL.createObjectURL = () => "blob:fake"; w.URL.revokeObjectURL = () => {};
    // jsdom lacks <dialog> modal support: polyfill so the non-fallback branch runs.
    w.HTMLDialogElement = w.HTMLDialogElement || function () {};
    w.HTMLElement.prototype.showModal = function () { this.__open = true; };
    w.HTMLElement.prototype.close = function (v) {
      this.returnValue = v ?? this.returnValue; this.__open = false;
      this.dispatchEvent(new w.Event("close"));
      if (typeof this.onclose === "function") this.onclose();
    };
  }
});
const w = dom.window;
await new Promise(r => w.document.readyState === "complete" ? r() : w.addEventListener("load", r));
const $ = id => w.document.getElementById(id);
const out = {};
const click = id => $(id).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

// --- dialog-based overwrite prompt
promptReply = "Dup";
click("saveTemplateBtn");
out.afterFirstSave = $("savedTemplates").textContent;
promptReply = "dup";
click("saveTemplateBtn");
out.dialogMessage = $("templateOverwriteMessage").textContent;
out.dialogOpened = Boolean($("templateOverwriteDialog").__open);
click("templateOverwriteCancel");
out.afterCancel = { toast: $("toast").textContent, list: $("savedTemplates").textContent };
promptReply = "dup";
click("saveTemplateBtn");
click("templateOverwriteConfirm");
out.afterConfirm = { toast: $("toast").textContent, list: $("savedTemplates").textContent };
out.storedTemplates = JSON.parse(w.localStorage.getItem("invoiceStudio.templates.v1")).map(x => x.name);

// --- logo upload validation branches
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const setFiles = (input, files) => Object.defineProperty(input, "files", { value: files, configurable: true });
setFiles($("logoFile"), [{ size: 4e6, type: "image/png", name: "big.png" }]);
fire($("logoFile"), "change");
out.tooBig = { toast: $("toast").textContent, hint: $("logoHint").textContent, value: $("logoFile").value };
setFiles($("logoFile"), [{ size: 100, type: "application/pdf", name: "doc.pdf" }]);
fire($("logoFile"), "change");
out.notImage = { toast: $("toast").textContent, hint: $("logoHint").textContent };
setFiles($("logoFile"), []);
fire($("logoFile"), "change");
out.noFile = { toast: $("toast").textContent };
click("removeLogoBtn");
out.afterRemove = { toast: $("toast").textContent, hint: $("logoHint").textContent };

// --- JSON export filename + payload
let downloaded = null;
const realClick = w.HTMLAnchorElement.prototype.click;
w.HTMLAnchorElement.prototype.click = function () { downloaded = { name: this.download, href: this.href }; };
$("invoiceNumber").value = "INV-2026-07"; fire($("invoiceNumber"), "input");
click("exportBtn");
out.download = downloaded;
w.HTMLAnchorElement.prototype.click = realClick;
out.exportPayloadKeys = Object.keys(JSON.parse(JSON.stringify(w.serialize()))).sort();

// --- zoom + calc invariants under odd input
$("discount").value = "999"; $("tax").value = "-20"; $("shipping").value = "abc";
out.calcClamped = w.calc();

out.errors = errs;
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
console.log("edge cases recorded");
