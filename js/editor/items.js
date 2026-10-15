/** Line item editor: the per-item cards in the Items tab. */

import { $, esc, num } from "../utils.js";
import { NUMERIC_COLUMN_TYPES, FIXED_AMOUNT_KEY } from "../constants.js";
import { state, editableColumns, addItem, removeItemAt, clearItems, createBlankItem } from "../state.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { confirmAction } from "../ui/confirm-dialog.js";

const isNumericType = type => NUMERIC_COLUMN_TYPES.includes(type);

/** The description column gets a full-width textarea. */
const isDescriptionField = col => col.type === "text" && col.key === "description";
const inputTypeFor = col => (isNumericType(col.type) ? "number" : col.type === "date" ? "date" : "text");

/** The field id is built from positions, never from user text, so it is always valid. */
const itemFieldMarkup = (col, item, itemIndex, colIndex) => {
  const value = esc(item[col.key] ?? "");
  const key = esc(col.key);
  const id = `item-${itemIndex}-field-${colIndex}`;
  const control = isDescriptionField(col)
    ? `<textarea id="${id}" data-key="${key}">${value}</textarea>`
    : `<input id="${id}" data-key="${key}" type="${inputTypeFor(col)}" step="0.01" value="${value}">`;
  return `<div class="field ${isDescriptionField(col) ? "full" : ""}"><label for="${id}">${esc(col.label)}</label>${control}</div>`;
};

export function renderItems() {
  const root = $("itemsEditor");
  root.innerHTML = "";
  state.items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "itemcard";
    const editable = editableColumns();
    card.innerHTML =
      `<div class="itemtop"><strong>Item ${idx + 1}</strong><button class="btn small danger" type="button" aria-label="Remove item ${idx + 1}">Remove</button></div>` +
      `<div class="itemgrid">${editable.map((c, ci) => itemFieldMarkup(c, item, idx, ci)).join("")}</div>`;

    card.querySelector("button").onclick = () => {
      removeItemAt(idx);
      renderItems();
      renderPreview();
      saveInvoice();
    };
    card.querySelectorAll("[data-key]").forEach(input => {
      input.oninput = () => {
        const col = state.columns.find(c => c.key === input.dataset.key);
        item[input.dataset.key] = isNumericType(col?.type) ? num(input.value) : input.value;
        // Editing quantity or rate means the line is now quantity x rate again,
        // so an amount kept from an imported statement no longer applies.
        if (col && (col.role === "quantity" || col.role === "rate")) delete item[FIXED_AMOUNT_KEY];
        renderPreview();
        saveInvoice({ typing: true });
      };
    });
    root.appendChild(card);
  });
}

export function initItemControls() {
  $("addItemBtn").onclick = () => {
    addItem(createBlankItem());
    renderItems();
    renderPreview();
    saveInvoice();
  };
  $("clearItemsBtn").onclick = async () => {
    if (!state.items.length) return;
    const ok = await confirmAction({
      title: "Remove all line items?",
      message: `All ${state.items.length} line item${state.items.length === 1 ? "" : "s"} will be removed from this invoice. You can bring them back with Undo.`,
      confirmLabel: "Remove all",
      danger: true
    });
    if (!ok) return;
    clearItems();
    renderItems();
    renderPreview();
    saveInvoice();
  };
}
