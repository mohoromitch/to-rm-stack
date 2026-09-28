import { test } from "node:test";
import assert from "node:assert/strict";
import { googleDocExportUrl, inlineDocsStyles, parseCssBox, parseDocsPageMargins } from "../extension/lib/gdoc.js";
import { domWindow } from "./helpers.mjs";

const DOCS_HTML = `<html><head><meta content="text/html; charset=UTF-8" http-equiv="content-type">
<style type="text/css">ol{margin:0;padding:0}.c3{font-weight:700;font-family:"Arial";color:#000000}
.c5{background-color:#ffffff;max-width:468pt;padding:72pt 54pt 36pt 54pt}.c1{font-style:italic}
.title{padding-top:0pt;font-size:26pt;font-family:"Arial"}</style></head>
<body class="c5 doc-content"><p class="title"><span>Plan</span></p>
<p><span class="c3">Bold</span> and <span class="c1">italic</span></p></body></html>`;

test("export URL uses the doc id and format", () => {
  assert.equal(googleDocExportUrl("abc", "pdf"), "https://docs.google.com/document/d/abc/export?format=pdf");
});

test("parseCssBox expands shorthand and converts units", () => {
  assert.deepEqual(parseCssBox("72pt"), { top: 72, right: 72, bottom: 72, left: 72 });
  assert.deepEqual(parseCssBox("1in 36pt"), { top: 72, right: 36, bottom: 72, left: 36 });
  assert.equal(parseCssBox("auto"), null);
});

test("parseDocsPageMargins reads the body class padding", () => {
  assert.deepEqual(parseDocsPageMargins(DOCS_HTML), { top: 72, right: 54, bottom: 36, left: 54 });
  assert.equal(parseDocsPageMargins("<html><body><p>x</p></body></html>"), null);
});

test("inlineDocsStyles keeps emphasis and size but drops fonts and colors", () => {
  const html = inlineDocsStyles(DOCS_HTML, domWindow().DOMParser);
  assert.match(html, /<span style="font-weight:700">Bold<\/span>/);
  assert.match(html, /<span style="font-style:italic">italic<\/span>/);
  assert.match(html, /<p style="font-size:26pt">/);
  assert.doesNotMatch(html, /Arial|color|class=/);
});
