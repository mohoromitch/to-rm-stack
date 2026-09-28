import { test } from "node:test";
import assert from "node:assert/strict";
import { fitPdfToPage } from "../extension/lib/pdf-fit.js";
import { deviceById, pageSizePt } from "../extension/lib/devices.js";
import { PDFLib } from "./helpers.mjs";

async function letterPdf(pages) {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i + 1}`, { x: 72, y: 700, size: 24, font });
  }
  return doc.save();
}

test("fitPdfToPage resizes every page to the device and keeps the page count", async () => {
  const device = deviceById("rmppm");
  const size = pageSizePt(device);
  const out = await fitPdfToPage(
    await letterPdf(3),
    { ...size, margin: 5, trim: { top: 72, right: 72, bottom: 72, left: 72 }, title: "Plan" },
    PDFLib,
  );
  const doc = await PDFLib.PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 3);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - size.width) < 0.01 && Math.abs(height - size.height) < 0.01);
  }
  assert.equal(doc.getTitle(), "Plan");
});

test("fitPdfToPage ignores a trim that would leave almost nothing", async () => {
  const out = await fitPdfToPage(
    await letterPdf(1),
    { width: 400, height: 500, trim: { top: 400, right: 300, bottom: 400, left: 300 } },
    PDFLib,
  );
  assert.equal((await PDFLib.PDFDocument.load(out)).getPageCount(), 1);
});
