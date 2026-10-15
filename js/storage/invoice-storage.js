/**
 * Persistence for the single working invoice (autosave).
 * Kept separate from the saved template and brand libraries.
 */

import { STORAGE_KEYS, AUTOSAVE_TYPING_DELAY_MS } from "../constants.js";
import { readRaw, writeRaw, remove } from "./local-storage.js";
import { serialize } from "../invoice/invoice-data.js";
import { recordChange } from "../history/invoice-history.js";
import { toast } from "../utils.js";

/** Whether the previous autosave succeeded; used to report a failure once. */
let lastSaveOk = true;
/** Pending write for typing edits, see saveInvoice(). */
let pendingWrite = null;
/** Set by clearInvoice(): nothing may be written before the page reloads. */
let writesStopped = false;
/** While true, writes are held back (another tab changed the invoice and the
 *  user has not yet chosen which version to keep). */
let writesHeld = false;
/** Listeners told after each successful write (used by the multi-tab check). */
const writeListeners = new Set();

export const onInvoiceWritten = fn => { writeListeners.add(fn); };

function writeNow() {
  if (pendingWrite !== null) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  if (writesStopped || writesHeld) return true;
  const text = JSON.stringify(serialize());
  const stored = writeRaw(STORAGE_KEYS.invoice, text);
  if (!stored && lastSaveOk) {
    toast("Autosave failed: browser storage is full or unavailable. Use Export JSON to keep a copy.");
  }
  lastSaveOk = stored;
  if (stored) writeListeners.forEach(fn => fn(text));
  return stored;
}

/** Holds or releases autosave writes; see js/storage/tab-sync.js. */
export function holdInvoiceWrites(hold) {
  writesHeld = Boolean(hold);
}

/** Writes the current invoice now, replacing whatever is stored. */
export function writeInvoiceNow() {
  return writeNow();
}

/** Writes any pending typing edit immediately. */
export function flushInvoiceSave() {
  if (pendingWrite !== null) writeNow();
}

// A pending edit is written before the page is hidden, closed or reloaded.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushInvoiceSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushInvoiceSave();
  });
}

/**
 * Autosaves the current invoice.
 *
 * A failed write (storage full, disabled or blocked) is reported to the user
 * once, when saving first starts failing, and again only after a save has
 * succeeded in between. Previously failures were silent, so a large logo could
 * stop the invoice being saved without any sign.
 *
 * Typing edits ({typing: true}) are written after a short pause; every other
 * change is written immediately, and a pending edit is written before the page
 * is hidden or closed.
 *
 * This is also where undo history is recorded. Every mutation in the app ends
 * with a saveInvoice() call, so using it as the single funnel means no editor
 * path can change the invoice without history noticing.
 *
 * @param {{typing?: boolean}} [options] set typing for keystroke-driven edits,
 *        which are coalesced into one history entry instead of one per key.
 */
export function saveInvoice(options) {
  let stored = true;
  if (options && options.typing) {
    // Keystrokes are written once typing pauses, not on every key: serialising
    // the invoice (logo included) per keystroke made typing lag.
    if (pendingWrite !== null) clearTimeout(pendingWrite);
    pendingWrite = setTimeout(writeNow, AUTOSAVE_TYPING_DELAY_MS);
  } else {
    stored = writeNow();
  }
  recordChange(options);
  return stored;
}

/**
 * Keeps an unreadable autosave under a separate key so the next autosave does
 * not destroy it. Returns whether the copy was written.
 */
export function backupUnreadableInvoice(raw = readRaw(STORAGE_KEYS.invoice)) {
  if (raw === null) return false;
  return writeRaw(STORAGE_KEYS.invoiceBackup, raw);
}

/**
 * Reads the autosave.
 * @returns {{data: object|null, corrupt: boolean, backedUp: boolean}}
 *   corrupt is true when something was stored but could not be parsed; in that
 *   case the raw text has already been copied to STORAGE_KEYS.invoiceBackup.
 */
export function readInvoiceAutosave() {
  const raw = readRaw(STORAGE_KEYS.invoice);
  if (raw === null) return { data: null, corrupt: false, backedUp: false };
  try {
    return { data: JSON.parse(raw), corrupt: false, backedUp: false };
  } catch {
    return { data: null, corrupt: true, backedUp: backupUnreadableInvoice(raw) };
  }
}

/** Returns the autosaved snapshot, or null when absent or corrupt. */
export function loadInvoice() {
  return readInvoiceAutosave().data;
}

/**
 * Deletes the autosave before a full reset. Pending and later writes are
 * cancelled, so the page reload that follows cannot write the old invoice back.
 */
export function clearInvoice() {
  if (pendingWrite !== null) clearTimeout(pendingWrite);
  pendingWrite = null;
  writesStopped = true;
  return remove(STORAGE_KEYS.invoice);
}
