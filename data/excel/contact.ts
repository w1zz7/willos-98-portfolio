import type { SheetData } from "@/lib/excel/types";

const H = "#c0c0c0";
const HI = "#fff3b0";

export const contact: SheetData = {
  id: "contact",
  title: "Contact",
  columns: [
    { letter: "A", width: 140 },
    { letter: "B", width: 360 },
    { letter: "C", width: 160 },
  ],
  frozenRows: 1,
  rowHeight: 28,
  maxRow: 20,
  maxCol: 3,
  initialSelection: "B2",
  cells: {
    A1: { value: "Channel", bold: true, bg: H },
    B1: { value: "Address", bold: true, bg: H },
    C1: { value: "Open", bold: true, bg: H },

    A2: { value: "Email", bold: true },
    B2: {
      value: "wz363@drexel.edu",
      href: "mailto:wz363@drexel.edu",
      color: "#0000ee",
    },
    C2: { value: "Compose →", onClick: { openApp: "contact" } },

    A3: { value: "LinkedIn", bold: true },
    B3: {
      value: "www.linkedin.com/in/willzhang6200",
      href: "https://www.linkedin.com/in/willzhang6200",
      color: "#0000ee",
    },
    C3: {
      value: "Open →",
      onClick: {
        openApp: "ie",
        props: { url: "https://www.linkedin.com/in/willzhang6200" },
      },
    },

    A4: { value: "Phone", bold: true },
    B4: { value: "(267) 255-1163", href: "tel:+12672551163", color: "#0000ee" },

    A5: { value: "Location", bold: true },
    B5: { value: "Philadelphia, PA" },

    A6: { value: "Resume", bold: true },
    B6: { value: "Resume.pdf - open in viewer" },
    C6: { value: "Open →", onClick: { openApp: "resume" } },

    A9: {
      value: "Let's build something.",
      bold: true,
      italic: true,
      bg: HI,
      merged: { colspan: 3 },
    },
    A10: {
      value:
        "Drop a line on email or LinkedIn - fastest reply there. Collaborations, interesting problems, and shipping-minded teams welcome.",
      italic: true,
      color: "#555",
      merged: { colspan: 3 },
    },
  },
};
