/**
 * Persistence for the single working invoice (autosave).
 * Kept separate from the saved template and brand libraries.
 */

import { STORAGE_KEYS } from "../constants.js";
import { readJSON, writeJSON, remove } from "./local-storage.js";
import { serialize } from "../invoice/invoice-data.js";

/** Autosaves the current invoice. Best effort: failures are silent, as before. */
export function saveInvoice() {
  return writeJSON(STORAGE_KEYS.invoice, serialize());
}

/** Returns the autosaved snapshot, or null when absent or corrupt. */
export function loadInvoice() {
  return readJSON(STORAGE_KEYS.invoice, null);
}

export function clearInvoice() {
  return remove(STORAGE_KEYS.invoice);
}
