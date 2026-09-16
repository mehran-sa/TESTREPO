/**
 * Test-only bundle entry.
 *
 * jsdom cannot execute <script type="module">, so the regression harness runs
 * against an esbuild IIFE bundle instead. This entry boots the real app and
 * then exposes the individual module functions under the names the harness
 * uses, so the same harness can drive the original single-file build and the
 * modular build unchanged.
 *
 * This file is never shipped and is not imported by the application.
 */

import "../js/app.js";

import { num, esc, safeColor, today, plusDays, toast, clamp } from "../js/utils.js";
import { dateFmt, oneEducationDateFmt, money, fmtCell } from "../js/invoice/formatters.js";
import { getTotals } from "../js/invoice/calculations.js";
import { serialize, serializeBrand, oneEducationPaymentRows } from "../js/invoice/invoice-data.js";
import { renderPreview } from "../js/invoice/invoice-renderer.js";
import { applySnapshot } from "../js/session.js";
import { normalizeKey } from "../js/editor/columns.js";
import { refreshLibraries } from "../js/editor/library.js";
import { parseCSV } from "../js/import-export/csv.js";
import { mapRows } from "../js/import-export/row-mapper.js";

Object.assign(window, {
  load: applySnapshot,
  calc: getTotals,
  serialize, serializeBrand, renderPreview, refreshLibraries,
  num, esc, safeColor, today, plusDays, toast, clamp, normalizeKey,
  dateFmt, oneEducationDateFmt, money, fmtCell, oneEducationPaymentRows,
  parseCSV, mapRows
});
