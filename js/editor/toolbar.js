/** Top toolbar: Export PDF, Print, Export/Import JSON, Reset, spreadsheet import. */

import { $, toast } from "../utils.js";
import { printInvoice, exportInvoicePDF } from "../print/pdf.js";
import { exportInvoiceJSON, readInvoiceFile } from "../import-export/json.js";
import { readItemsFromFile } from "../import-export/spreadsheet.js";
import { setItems } from "../state.js";
import { applySnapshot } from "../session.js";
import { renderItems } from "./items.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice, clearInvoice } from "../storage/invoice-storage.js";

export function initToolbar() {
  $("printBtn").onclick = () => { printInvoice(); };
  $("pdfBtn").onclick = () => { exportInvoicePDF(); };

  $("exportBtn").onclick = () => exportInvoiceJSON();
  $("importBtn").onclick = () => $("jsonFile").click();
  $("jsonFile").onchange = async e => {
    try {
      applySnapshot(await readInvoiceFile(e.target.files[0]));
      toast("Invoice imported.");
    } catch (err) {
      toast(err.message);
    }
    e.target.value = "";
  };

  $("resetBtn").onclick = () => {
    if (!confirm("Reset the app and delete the locally saved invoice?")) return;
    clearInvoice();
    location.reload();
  };

  $("importSheetBtn").onclick = () => $("sheetFile").click();
  $("sheetFile").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const items = await readItemsFromFile(file);
      setItems(items);
      renderItems();
      renderPreview();
      saveInvoice();
      toast(items.length + " items imported.");
    } catch (err) {
      toast(err.message);
    }
    e.target.value = "";
  };
}
