/**
 * Binds every persisted form control to the render + autosave cycle.
 *
 * This is the generic path: user input -> (accent side effect) -> render -> save.
 * Controls needing extra behaviour (logo upload, zoom, columns, items) have
 * their own modules.
 */

import { $, fieldValue, isIsoDate } from "../utils.js";
import { FIELD_IDS } from "../constants.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { setAccent } from "./design.js";
import { nextInvoiceNumber } from "../invoice/invoice-data.js";

export function initFieldBindings() {
  FIELD_IDS.forEach(id => {
    const el = $(id);
    if (!el) return;
    const eventName = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(eventName, () => {
      if (id === "accent") setAccent(fieldValue(id));
      // While a HEX value is being typed it is incomplete ("#2", "#25..."), and
      // setAccent() replaced it with the default colour on the first keystroke,
      // so a colour could not be typed at all. Apply it only once it is valid.
      if (id === "accentHex" && HEX_COLOR.test(fieldValue(id).trim())) setAccent(fieldValue(id).trim());
      if (id === "invoiceDate" || id === "dueDate") updateDateWarning();
      renderPreview();
      // Keystrokes: coalesced into a single history entry.
      saveInvoice({ typing: true });
    });
  });

  // "Next" invoice number: a user action only, nothing is numbered automatically.
  $("nextNumberBtn")?.addEventListener("click", () => {
    $("invoiceNumber").value = nextInvoiceNumber(fieldValue("invoiceNumber"));
    renderPreview();
    saveInvoice();
  });

  // When the HEX field is left with an incomplete value, show the colour that
  // is actually in use again.
  $("accentHex")?.addEventListener("change", () => {
    setAccent(HEX_COLOR.test(fieldValue("accentHex").trim()) ? fieldValue("accentHex").trim() : fieldValue("accent"));
    renderPreview();
    saveInvoice();
  });
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Non-blocking check that the due date is not before the invoice date. The
 * dates are still saved as entered; the hint only flags a likely typo.
 */
export function updateDateWarning() {
  const warning = $("dueDateWarning");
  if (!warning) return;
  const issued = fieldValue("invoiceDate");
  const due = fieldValue("dueDate");
  const backwards = isIsoDate(issued) && isIsoDate(due) && due < issued;
  warning.hidden = !backwards;
}
