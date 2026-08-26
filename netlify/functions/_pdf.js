import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * The change-order document, on the Proposal Builder's format (decision
 * §11.11; the exact spec lives in docs/proposal-app-extraction.md): navy and
 * orange, Helvetica base-14 fonts, letter page, 0.75in margins, a 3pt orange
 * top rule, and the running confidentiality footer. The signed copy appends a
 * signature certificate page — the improvement the extraction called for,
 * since the Proposal Builder emails an unsigned PDF and keeps the evidence
 * only in its database.
 */

const NAVY = rgb(0x1b / 255, 0x2a / 255, 0x4a / 255);
const ORANGE = rgb(0xe8 / 255, 0x94 / 255, 0x3a / 255);
const INK = rgb(0.2, 0.2, 0.2);
const GRAY = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.8, 0.8, 0.8);
const WASH = rgb(0.96, 0.96, 0.96);

const PAGE = { width: 612, height: 792 };
const MARGIN = 54;

export const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function wrap(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
      line = probe;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function makeWriter(doc, fonts) {
  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const chrome = (p) => {
    p.drawRectangle({ x: 0, y: PAGE.height - 3, width: PAGE.width, height: 3, color: ORANGE });
    const footer = "ReDry, LLC  |  re-dry.com  |  info@re-dry.com  |  Confidential and Proprietary";
    const w = fonts.regular.widthOfTextAtSize(footer, 8);
    p.drawText(footer, {
      x: (PAGE.width - w) / 2,
      y: 24,
      size: 8,
      font: fonts.regular,
      color: GRAY,
    });
  };
  chrome(page);

  const ensure = (needed) => {
    if (y - needed < MARGIN + 20) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      chrome(page);
      y = PAGE.height - MARGIN;
    }
  };

  return {
    get page() {
      return page;
    },
    get y() {
      return y;
    },
    move(dy) {
      y -= dy;
    },
    ensure,
    text(str, { x = MARGIN, size = 10, font = fonts.regular, color = INK, width } = {}) {
      const maxWidth = width ?? PAGE.width - MARGIN - x;
      for (const line of wrap(str, font, size, maxWidth)) {
        ensure(size + 4);
        page.drawText(line, { x, y: y - size, size, font, color });
        y -= size + 4;
      }
    },
    rule(color = RULE, height = 1, width = PAGE.width - 2 * MARGIN) {
      ensure(height + 6);
      page.drawRectangle({ x: MARGIN, y: y - height, width, height, color });
      y -= height + 6;
    },
    box(height, color) {
      ensure(height);
      page.drawRectangle({
        x: MARGIN,
        y: y - height,
        width: PAGE.width - 2 * MARGIN,
        height,
        color,
      });
    },
  };
}

async function open(bytesOrNew) {
  const doc = bytesOrNew ? await PDFDocument.load(bytesOrNew) : await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  return { doc, fonts };
}

/**
 * data: { number, dateLabel, jobName, address, clientName, clientEmail,
 *         lines: [{description, qty, unit, rateCents, amountCents}],
 *         totalCents, reportUrl, snapshotSf }
 */
export async function buildChangeOrderPdf(data) {
  const { doc, fonts } = await open(null);
  const w = makeWriter(doc, fonts);

  // Title block
  w.move(6);
  w.text("CHANGE ORDER", { size: 22, font: fonts.bold, color: NAVY });
  w.move(2);
  w.rule(ORANGE, 2);
  w.text(`Change Order No. ${data.number}  ·  ${data.dateLabel}`, {
    size: 10,
    color: GRAY,
  });
  w.move(10);

  // FROM / TO / PROJECT
  const colWidth = (PAGE.width - 2 * MARGIN - 24) / 3;
  const cols = [
    ["FROM", ["ReDry, LLC", "re-dry.com", "877.733.7973"]],
    ["TO", [data.clientName || "—", data.clientEmail || ""]],
    ["PROJECT", [data.jobName, data.address || ""]],
  ];
  const startY = w.y;
  let deepest = w.y;
  cols.forEach(([label, rows], i) => {
    const x = MARGIN + i * (colWidth + 12);
    let cy = startY;
    w.page.drawText(label, { x, y: cy - 8, size: 8, font: fonts.bold, color: ORANGE });
    cy -= 20;
    for (const row of rows.filter(Boolean)) {
      for (const line of wrap(row, fonts.regular, 10, colWidth)) {
        w.page.drawText(line, { x, y: cy - 10, size: 10, font: fonts.regular, color: INK });
        cy -= 14;
      }
    }
    deepest = Math.min(deepest, cy);
  });
  w.move(startY - deepest + 14);

  w.text(
    `This Change Order modifies and becomes part of the Agreement between ReDry, LLC ` +
      `and the client for ${data.jobName}. It covers the additional area identified ` +
      `outside the original scope of work${data.snapshotSf ? ` (${data.snapshotSf.toLocaleString("en-US")} SF at the time of issue)` : ""}.`,
    { size: 10 },
  );
  w.move(12);

  // Line items
  const columns = [
    { label: "DESCRIPTION", x: MARGIN + 8, width: 250 },
    { label: "QTY", x: MARGIN + 268, width: 60 },
    { label: "RATE", x: MARGIN + 338, width: 70 },
    { label: "AMOUNT", x: MARGIN + 418, width: 80 },
  ];
  w.ensure(24);
  w.box(20, NAVY);
  for (const col of columns) {
    w.page.drawText(col.label, {
      x: col.x,
      y: w.y - 14,
      size: 9,
      font: fonts.bold,
      color: rgb(1, 1, 1),
    });
  }
  w.move(24);

  data.lines.forEach((line, i) => {
    const descLines = wrap(line.description, fonts.regular, 10, columns[0].width);
    const rowHeight = Math.max(18, descLines.length * 13 + 6);
    w.ensure(rowHeight);
    if (i % 2 === 1) w.box(rowHeight, WASH);
    let dy = w.y - 13;
    for (const dl of descLines) {
      w.page.drawText(dl, { x: columns[0].x, y: dy, size: 10, font: fonts.regular, color: INK });
      dy -= 13;
    }
    const qty = `${Number(line.qty).toLocaleString("en-US")} ${line.unit}`;
    w.page.drawText(qty, { x: columns[1].x, y: w.y - 13, size: 10, font: fonts.regular, color: INK });
    w.page.drawText(money(line.rateCents), { x: columns[2].x, y: w.y - 13, size: 10, font: fonts.regular, color: INK });
    w.page.drawText(money(line.amountCents), { x: columns[3].x, y: w.y - 13, size: 10, font: fonts.bold, color: INK });
    w.move(rowHeight);
  });

  w.ensure(26);
  w.box(22, NAVY);
  w.page.drawText("CHANGE ORDER TOTAL", {
    x: columns[0].x,
    y: w.y - 15,
    size: 10,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  w.page.drawText(money(data.totalCents), {
    x: columns[3].x,
    y: w.y - 15,
    size: 11,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  w.move(34);

  // Terms
  w.text("TERMS", { size: 9, font: fonts.bold, color: ORANGE });
  w.move(2);
  w.text(
    "All terms and conditions of the original Agreement, including the ReDry Limited " +
      "Material Warranty Agreement, apply to this Change Order and are incorporated by " +
      "reference. Work covered by this Change Order is installed on the next scheduled " +
      "scan visit. No payment is collected at signing; ReDry will invoice separately.",
    { size: 9.5, color: GRAY },
  );
  w.move(14);

  // Acceptance
  w.text("ACCEPTANCE", { size: 9, font: fonts.bold, color: ORANGE });
  w.move(2);
  w.text(
    "Sign and accept online at the drying progress report:",
    { size: 10 },
  );
  w.text(data.reportUrl, { size: 10, color: NAVY, font: fonts.bold });
  w.move(4);
  w.text(
    "Your electronic signature will include your name, date, IP address, and browser " +
      "information for verification purposes. Upon signing, both parties will receive a " +
      "copy of this agreement.",
    { size: 9, color: GRAY },
  );

  return doc.save();
}

/**
 * The signed copy: the original document plus a signature certificate page
 * carrying the full evidence record.
 */
export async function appendSignatureCertificate(pdfBytes, cert) {
  const { doc, fonts } = await open(pdfBytes);
  const w = makeWriter(doc, fonts);

  w.move(6);
  w.text("SIGNATURE CERTIFICATE", { size: 18, font: fonts.bold, color: NAVY });
  w.move(2);
  w.rule(ORANGE, 2);
  w.text(
    `Change Order No. ${cert.number}  ·  ${cert.jobName}`,
    { size: 10, color: GRAY },
  );
  w.move(14);

  const rows = [
    ["Signed by", cert.signerName],
    ["Signature date", cert.signerDate],
    ["Accepted at (UTC)", cert.acceptedAtUTC],
    ["IP address", cert.ipAddress],
    ["Browser", cert.userAgent],
    ["Terms version", cert.termsVersion],
    ["Document SHA-256", cert.documentSha256],
  ];
  for (const [label, value] of rows) {
    w.text(label.toUpperCase(), { size: 8, font: fonts.bold, color: ORANGE });
    w.text(String(value ?? "—"), { size: 10 });
    w.move(6);
  }

  w.move(8);
  w.text(
    "This electronic record was captured by the ReDry Scan Comparison platform at the " +
      "moment of acceptance. The document hash above identifies the exact agreement " +
      "the signer saw.",
    { size: 9, color: GRAY },
  );

  return doc.save();
}
