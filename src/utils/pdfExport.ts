import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface NestedPdfSection {
  headerLabel: string;        // e.g. an agent's or branch's name, rendered as a full-width banner
  headerSubLabel?: string;    // e.g. "12 clients — 4,500,000 FCFA total balance"
  rows: (string | number)[][]; // data rows for this section
}

/**
 * Formats numbers with standard regular spaces (" ") for thousands separators.
 * Avoids Unicode narrow no-break space glyph rendering issues in core PDF fonts.
 */
export function formatPdfNumber(val: number): string {
  if (val === null || val === undefined || isNaN(val)) return "0";
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const parts = absVal.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const formatted = parts.join(".");
  return isNegative ? `-${formatted}` : formatted;
}

export interface NestedPdfSheetSpec {
  sheetName: string;
  columnHeaders: string[];
  columnWidths?: number[];    // optional explicit widths
  sections: NestedPdfSection[];
  orientation?: "portrait" | "landscape";
}

// Aliases for seamless drop-in compatibility
export type NestedExcelSection = NestedPdfSection;
export type NestedExcelSheetSpec = NestedPdfSheetSpec;

export async function exportPDF(
  sheets: NestedPdfSheetSpec[],
  fileName: string,
  options: { mode?: "download" | "print" } = { mode: "download" }
): Promise<void> {
  const cleanFileName = fileName.replace(/\.xlsx$/i, ".pdf").replace(/\.pdf$/i, "") + ".pdf";

  // Determine overall orientation: landscape if any sheet has > 7 columns or explicit landscape
  const maxCols = Math.max(...sheets.map((s) => s.columnHeaders.length));
  const hasExplicitLandscape = sheets.some((s) => s.orientation === "landscape");
  const orientation = hasExplicitLandscape || maxCols > 7 ? "landscape" : "portrait";

  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const brandPurpleRGB: [number, number, number] = [75, 45, 127]; // #4B2D7F
  const bannerBgRGB: [number, number, number] = [241, 239, 245]; // #F1EFF5
  const timestampStr = new Date().toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  let isFirstSheet = true;

  for (const sheetSpec of sheets) {
    if (!isFirstSheet) {
      doc.addPage(undefined, orientation);
    }
    isFirstSheet = false;

    // Title / Header Banner at top of sheet
    let startY = 14;

    // Helper to determine if a header column represents numeric values
    const isNumericHeaderIdx = (idx: number) => {
      const header = sheetSpec.columnHeaders[idx] || "";
      const h = header.toLowerCase();
      return (
        h.includes("amount") ||
        h.includes("balance") ||
        h.includes("deposit") ||
        h.includes("withdrawal") ||
        h.includes("fee") ||
        h.includes("payout") ||
        h.includes("fcfa") ||
        h.includes("count") ||
        h.includes("total")
      );
    };

    // Build table body items combining section banners and data rows
    const numCols = sheetSpec.columnHeaders.length;
    const body: any[] = [];

    for (const section of sheetSpec.sections) {
      // Banner row spanning all columns
      const bannerText = (
        section.headerSubLabel
          ? `${section.headerLabel} — ${section.headerSubLabel}`
          : section.headerLabel
      ).replace(/[\u202F\u00A0]/g, " ");

      body.push([
        {
          content: bannerText,
          colSpan: numCols,
          styles: {
            fillColor: bannerBgRGB,
            textColor: brandPurpleRGB,
            fontStyle: "bold",
            halign: "left",
            fontSize: 9,
            cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
          },
        },
      ]);

      // Data rows
      for (const rowData of section.rows) {
        const isSubtotalRow =
          typeof rowData[0] === "string" &&
          (rowData[0].toUpperCase().includes("SUBTOTAL") || rowData[0].toUpperCase().includes("TOTAL"));

        const formattedRow = rowData.map((val) => {
          if (typeof val === "number") {
            return formatPdfNumber(val);
          }
          if (val === null || val === undefined) return "";
          return String(val).replace(/[\u202F\u00A0]/g, " ");
        });

        if (isSubtotalRow) {
          body.push(
            formattedRow.map((cellVal, idx) => ({
              content: cellVal,
              styles: {
                fontStyle: "bold",
                fillColor: [245, 243, 248],
                textColor: [30, 30, 30],
                halign: typeof rowData[idx] === "number" || isNumericHeaderIdx(idx) ? "right" : "left",
              },
            }))
          );
        } else {
          body.push(formattedRow);
        }
      }
    }

    // Determine column styles (e.g. right align numeric columns)
    const columnStyles: { [key: number]: any } = {};
    sheetSpec.columnHeaders.forEach((header, idx) => {
      if (isNumericHeaderIdx(idx)) {
        columnStyles[idx] = { halign: "right" };
      }
    });

    autoTable(doc, {
      startY,
      head: [sheetSpec.columnHeaders],
      body,
      theme: "grid",
      headStyles: {
        fillColor: brandPurpleRGB,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "center",
        valign: "middle",
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [40, 40, 40],
        cellPadding: 2,
        valign: "middle",
      },
      alternateRowStyles: {
        fillColor: [252, 251, 254],
      },
      columnStyles,
      styles: {
        overflow: "linebreak",
        lineColor: [225, 220, 235],
        lineWidth: 0.1,
      },
      margin: { top: 22, bottom: 16, left: 10, right: 10 },
      didDrawPage: (data) => {
        // Top Header Banner on every page
        doc.setFillColor(75, 45, 127);
        doc.rect(0, 0, pageWidth, 12, "F");

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("NGAOUNDÉRÉ CENTRAL MICROFINANCE", 10, 8);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(sheetSpec.sheetName, pageWidth - 10, 8, { align: "right" });
      },
    });
  }

  // Add Page Numbers and Footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 130);

    const footerY = pageHeight - 7;
    doc.text(`Generé le ${timestampStr} — NGC Microfinance Audit System`, 10, footerY);
    doc.text(`Page ${i} sur ${totalPages}`, pageWidth - 10, footerY, { align: "right" });
  }

  if (options.mode === "print") {
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open("", "_blank");

    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head><title>${cleanFileName}</title></head>
          <body style="margin:0;height:100vh;overflow:hidden;">
            <embed src="${blobUrl}" type="application/pdf" width="100%" height="100%" style="border:none;" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();

      const embedEl = printWindow.document.querySelector("embed");
      const triggerPrint = () => {
        try {
          printWindow.print();
        } catch (e) {
          console.warn("Auto-print failed, user can print manually from the toolbar", e);
        }
      };
      if (embedEl) {
        embedEl.addEventListener("load", triggerPrint);
        // Fallback in case the load event doesn't fire in this browser
        setTimeout(triggerPrint, 1200);
      } else {
        setTimeout(triggerPrint, 1200);
      }
    } else {
      // Popup blocked — fall back to a visible (not 0x0) overlay so the browser
      // reliably renders it, instead of an invisible iframe.
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:#000;";
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "width:100%;height:100%;border:0;";
      iframe.src = blobUrl;
      iframe.onload = () => {
        try {
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn("Auto-print in fallback iframe failed, user can print manually", e);
        }
      };
      overlay.appendChild(iframe);
      document.body.appendChild(overlay);
    }
  } else {
    doc.save(cleanFileName);
  }
}

// Alias buildStyledNestedWorkbook signature for backward compatibility or direct replacement
export async function buildStyledNestedWorkbook(
  sheets: NestedPdfSheetSpec[],
  fileName: string,
  mode: "download" | "print" = "download"
): Promise<void> {
  return exportPDF(sheets, fileName, { mode });
}
