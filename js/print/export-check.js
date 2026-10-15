/**
 * Checks run before Print and Export PDF.
 *
 * Empty fields print as placeholder text ("Your Company", "Client company",
 * "Add your company details"), and mistakes such as a missing invoice number
 * or a due date before the invoice date are easy to miss in the preview. The
 * check lists anything like that, and the user can go back to fix it or print
 * anyway. Hidden sections are not checked.
 */

import { $, qs, trimmedField, fieldValue, isIsoDate } from "../utils.js";
import { state } from "../state.js";
import { getTotals } from "../invoice/calculations.js";
import { money } from "../invoice/formatters.js";
import { invoicesWithNumber } from "../storage/invoice-library.js";

/** The example company name the app starts with. */
export const EXAMPLE_COMPANY_NAME = "Your Company Ltd.";

const COMPANY_DETAIL_FIELDS = ["companyReg", "companyVat", "companyAddress", "companyPhone", "companyEmail", "companyWebsite"];
const CLIENT_DETAIL_FIELDS = ["clientContact", "clientTax", "clientAddress", "clientEmail"];

/**
 * @returns {Array<{text: string, tab: string, field: string}>} problems, in
 *          the order they appear on the invoice
 */
export function findExportIssues() {
  const issues = [];
  const add = (text, tab, field) => issues.push({ text, tab, field });
  const shown = key => state.sections[key] !== false;

  const number = trimmedField("invoiceNumber");
  if (!number) add('There is no invoice number. It will print as "Untitled".', "details", "invoiceNumber");
  else if (invoicesWithNumber(number, state.invoiceId).length) {
    add(`Another saved invoice already uses number ${number}.`, "details", "invoiceNumber");
  }

  if (shown("invoiceDate") && !fieldValue("invoiceDate")) add("There is no invoice date.", "details", "invoiceDate");
  const issued = fieldValue("invoiceDate");
  const due = fieldValue("dueDate");
  if (shown("dueDate") && isIsoDate(issued) && isIsoDate(due) && due < issued) {
    add("The due date is before the invoice date.", "details", "dueDate");
  }

  if (shown("company")) {
    const name = trimmedField("companyName");
    if (!name) add('Your company name is empty. It will print as "Your Company".', "details", "companyName");
    else if (name === EXAMPLE_COMPANY_NAME) add(`Your company name is still the example "${EXAMPLE_COMPANY_NAME}".`, "details", "companyName");
    if (!COMPANY_DETAIL_FIELDS.some(id => trimmedField(id))) {
      add('Your company details are empty. "Add your company details" will print instead.', "details", "companyAddress");
    }
  }

  if (shown("client")) {
    if (!trimmedField("clientName")) add('The client is empty. "Client company" will print instead.', "details", "clientName");
    if (!CLIENT_DETAIL_FIELDS.some(id => trimmedField(id))) {
      add('The client details are empty. "Add client details" will print instead.', "details", "clientAddress");
    }
  }

  if (!state.items.length) add("There are no line items.", "items", "addItemBtn");
  else if (getTotals().total === 0) add(`The invoice total is ${money(0)}.`, "items", "addItemBtn");

  return issues;
}

/** Shows the tab holding a problem and puts the cursor in its field. */
export function goToIssue(issue) {
  qs(`.tab[data-tab="${issue.tab}"]`)?.click();
  const el = $(issue.field);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus({ preventScroll: true });
}
