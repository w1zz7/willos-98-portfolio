import type { SheetData } from "./types";
import { computedValue } from "./formulas";
import { parseRef } from "./cellRef";

/**
 * Convert our `SheetData[]` into a real .xlsx file and trigger a download.
 * Dynamic-imports `xlsx` (SheetJS, ~400KB) so the main bundle stays lean.
 *
 * Formulas are exported as evaluated VALUES - real Excel opens them as
 * numbers, not ephemeral formula strings. That's by design: the demo is
 * "look, it's genuinely a working workbook," not "watch these half-fake
 * formulas recompute."
 */
export async function downloadWorkbook(
  sheets: SheetData[],
  sheetsById: Record<string, SheetData>,
  filename = "WillZhang.xlsx"
): Promise<void> {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    // Build a 2D array matching the sheet's max extent. Index 0 = row 1.
    const rows: Array<Array<string | number | null>> = [];
    for (let r = 1; r <= sheet.maxRow; r++) {
      const row: Array<string | number | null> = [];
      for (let c = 1; c <= sheet.maxCol; c++) {
        const ref = refOf(c, r);
        const cell = sheet.cells[ref];
        if (!cell) {
          row.push(null);
          continue;
        }
        // Prefer evaluated formula value; fall back to literal value.
        let v: string | number | null = null;
        if (cell.formula && (cell.value == null || cell.value === "")) {
          const computed = computedValue(sheet, ref, sheetsById);
          v = typeof computed === "number" ? computed : String(computed);
        } else if (typeof cell.value === "number") {
          v = cell.value;
        } else if (cell.value != null) {
          v = String(cell.value);
        }
        row.push(v);
      }
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Set column widths
    ws["!cols"] = sheet.columns.map((col) => ({ wpx: col.width }));
    // Sheet name must be <= 31 chars and not contain []:*?/\
    const safeName = sheet.title.replace(/[\[\]:*?\/\\]/g, "").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName || sheet.id);
  }

  // Write as binary and trigger download
  const arrayBuffer = XLSX.write(wb, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;

  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function refOf(col: number, row: number): string {
  let letters = "";
  let n = col;
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row}`;
}

// Silence unused import warning for tree-shaking
void parseRef;
