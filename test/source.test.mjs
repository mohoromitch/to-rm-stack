import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyUrl,
  cleanTitle,
  filenameFromContentDisposition,
  filenameFromUrl,
  googleDocId,
  isPdfBytes,
} from "../extension/lib/source.js";

const ID = "1bG8wBGQMabcdefghijklmnopqrstuvwxyz0123";

test("googleDocId handles edit, account-switched, and bare URLs", () => {
  assert.equal(googleDocId(`https://docs.google.com/document/d/${ID}/edit?tab=t.0#heading=h.x`), ID);
  assert.equal(googleDocId(`https://docs.google.com/document/u/1/d/${ID}/edit`), ID);
  assert.equal(googleDocId(`https://docs.google.com/document/d/${ID}`), ID);
  assert.equal(googleDocId(`https://docs.google.com/spreadsheets/d/${ID}/edit`), null);
  assert.equal(googleDocId("https://docs.google.com/document/d/e/2PACX-short/pub"), null);
});

test("classifyUrl sorts tabs into gdoc, pdf, web, and unsupported", () => {
  assert.deepEqual(classifyUrl(`https://docs.google.com/document/d/${ID}/edit`), { kind: "gdoc", docId: ID });
  assert.equal(classifyUrl("https://arxiv.org/pdf/2401.00001v2.PDF").kind, "pdf");
  assert.equal(classifyUrl("https://example.com/post").kind, "web");
  assert.equal(classifyUrl("about:reader?url=x").kind, "unsupported");
  assert.equal(classifyUrl("file:///tmp/a.pdf").kind, "unsupported");
  assert.equal(classifyUrl("").kind, "unsupported");
});

test("isPdfBytes finds the header even after leading junk", () => {
  assert.equal(isPdfBytes(new TextEncoder().encode("%PDF-1.7\n")), true);
  assert.equal(isPdfBytes(new TextEncoder().encode("\n\n%PDF-1.4")), true);
  assert.equal(isPdfBytes(new TextEncoder().encode("<!doctype html>")), false);
});

test("cleanTitle strips the Google Docs suffix and .pdf", () => {
  assert.equal(cleanTitle("Quarterly plan - Google Docs"), "Quarterly plan");
  assert.equal(cleanTitle("paper.pdf"), "paper");
  assert.equal(cleanTitle("   "), "Untitled");
});

test("filename helpers read URLs and Content-Disposition", () => {
  assert.equal(filenameFromUrl("https://x.org/a/My%20Paper.pdf?dl=1"), "My Paper.pdf");
  assert.equal(filenameFromContentDisposition(`attachment; filename="report.pdf"`), "report.pdf");
  assert.equal(filenameFromContentDisposition(`attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`), "résumé.pdf");
  assert.equal(filenameFromContentDisposition(null), "");
});
