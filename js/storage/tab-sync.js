/**
 * Keeps two open tabs (or windows) of the app from silently overwriting each
 * other's invoice.
 *
 * Every tab autosaves to the same localStorage key. Without this module, the
 * last tab to save simply replaced the other tab's work. Now, when another tab
 * saves the invoice, this tab stops saving and asks the user which version to
 * keep:
 *   - "Load the other version" replaces this tab's invoice with the stored one
 *     (undoable with Undo);
 *   - "Keep this version" saves this tab's invoice over the other one.
 * Changes to the saved template and brand libraries are simply shown.
 */

import { STORAGE_KEYS } from "../constants.js";
import { $, toast } from "../utils.js";
import { readRaw } from "./local-storage.js";
import { holdInvoiceWrites, writeInvoiceNow, onInvoiceWritten } from "./invoice-storage.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { applySnapshot } from "../session.js";
import { refreshLibraries } from "../editor/library.js";

/** The stored text as of this tab's last write or load. */
let lastKnown = null;
let asking = false;

/**
 * Same invoice content? Preview zoom is a per-tab view setting that is saved
 * with the invoice, so it is ignored; otherwise two tabs at different zoom
 * levels would keep asking each other.
 */
function sameInvoice(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  try {
    const strip = text => {
      const data = JSON.parse(text);
      if (data && typeof data === "object") delete data.zoom;
      return JSON.stringify(data);
    };
    return strip(a) === strip(b);
  } catch {
    return false;
  }
}

async function askWhichVersion() {
  // Another confirmation may already be open; ask once it has closed.
  const dialog = $("appConfirmDialog");
  if (dialog?.open) {
    await new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
  }
  const stored = readRaw(STORAGE_KEYS.invoice);
  if (sameInvoice(stored, lastKnown)) {
    asking = false;
    holdInvoiceWrites(false);
    return;
  }

  const wasReset = stored === null;
  const loadOther = await confirmAction({
    title: "Invoice changed in another tab",
    message: (wasReset
      ? "The invoice was reset in another tab or window of SA Invoice Generator. "
      : "This invoice was also edited in another tab or window of SA Invoice Generator. ") +
      "Load that version here, or keep this tab's version and save it over the other one?",
    confirmLabel: wasReset ? "Start the new invoice" : "Load the other version",
    cancelLabel: "Keep this version"
  });

  asking = false;
  holdInvoiceWrites(false);

  if (!loadOther) {
    writeInvoiceNow();
    toast("This tab's invoice was saved.");
    return;
  }
  if (wasReset) {
    // Matches what the Reset button does in the other tab.
    holdInvoiceWrites(true);
    location.reload();
    return;
  }
  try {
    const latest = readRaw(STORAGE_KEYS.invoice);
    applySnapshot(JSON.parse(latest));
    lastKnown = latest;
    toast("Loaded the version from the other tab. Use Undo to go back.");
  } catch {
    toast("The other tab's invoice could not be read. This tab's version was kept.");
    writeInvoiceNow();
  }
}

export function initTabSync() {
  lastKnown = readRaw(STORAGE_KEYS.invoice);
  onInvoiceWritten(text => { lastKnown = text; });

  window.addEventListener("storage", event => {
    if (event.storageArea !== localStorage) return;
    if (event.key === STORAGE_KEYS.templates || event.key === STORAGE_KEYS.brands) {
      refreshLibraries();
      return;
    }
    // key === null means the whole storage was cleared elsewhere.
    if (event.key !== STORAGE_KEYS.invoice && event.key !== null) return;
    if (sameInvoice(event.newValue, lastKnown)) return;
    if (asking) return;
    asking = true;
    holdInvoiceWrites(true);
    askWhichVersion();
  });
}
