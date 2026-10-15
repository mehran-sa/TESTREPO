/** Saved-clients picker in the Bill to panel. */

import { $, toast, fieldValue, trimmedField } from "../utils.js";
import { listClients, saveClient, removeClient, CLIENT_FIELDS, clientKey } from "../storage/client-book.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { confirmAction } from "../ui/confirm-dialog.js";

/** Rebuilds the picker, selecting the client that matches the form, if any. */
export function refreshClientPicker() {
  const select = $("savedClients");
  if (!select) return;
  const clients = listClients();
  const current = clientKey(fieldValue("clientName"));
  select.textContent = "";
  const placeholder = new Option(clients.length ? "Choose a saved client" : "No saved clients yet", "");
  select.add(placeholder);
  for (const c of clients) {
    // First line only: client names can span several lines.
    const option = new Option(c.name.split(/\r?\n/)[0], c.id);
    option.selected = clientKey(c.name) === current;
    select.add(option);
  }
  $("removeClientBtn").disabled = !select.value;
}

function applyClient(id) {
  const client = listClients().find(c => c.id === id);
  if (!client) return;
  for (const [prop, fieldId] of Object.entries(CLIENT_FIELDS)) $(fieldId).value = client[prop];
  renderPreview();
  saveInvoice(); // one undo step
  toast("Client details filled in: " + client.name.split(/\r?\n/)[0]);
}

export function initClientBook() {
  const select = $("savedClients");
  if (!select) return;
  select.addEventListener("change", () => {
    $("removeClientBtn").disabled = !select.value;
    if (select.value) applyClient(select.value);
  });

  $("saveClientBtn").onclick = () => {
    if (!trimmedField("clientName")) return toast("Enter the client company name first.");
    const details = {};
    for (const [prop, fieldId] of Object.entries(CLIENT_FIELDS)) details[prop] = fieldValue(fieldId).trim();
    const { ok, updated } = saveClient(details);
    if (!ok) return toast("The client could not be saved: browser storage is full or unavailable.");
    refreshClientPicker();
    toast(updated ? "Saved client updated." : "Client saved for later invoices.");
  };

  $("removeClientBtn").onclick = async () => {
    const client = listClients().find(c => c.id === select.value);
    if (!client) return;
    const ok = await confirmAction({
      title: "Remove saved client?",
      message: `"${client.name.split(/\r?\n/)[0]}" will be removed from saved clients. Invoices already made for this client are not changed.`,
      confirmLabel: "Remove client",
      danger: true
    });
    if (!ok) return;
    if (!removeClient(client.id)) return toast("The client could not be removed.");
    refreshClientPicker();
    toast("Client removed.");
  };

  // Keep the selection in step with the name typed or loaded.
  $("clientName").addEventListener("change", refreshClientPicker);
  refreshClientPicker();
}
