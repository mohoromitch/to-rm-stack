import { test } from "node:test";
import assert from "node:assert/strict";
import { fitContentToPage, pickImageSource, prepareArticleHtml, renderArticlePdf } from "../extension/lib/render.js";
import { inlineDocsStyles } from "../extension/lib/gdoc.js";
import { deviceById, pageSizePt } from "../extension/lib/devices.js";
import { ONE_PX_PNG, PDFLib, domWindow, htmlToPdfmake, nodePdfMake } from "./helpers.mjs";

const ARTICLE = {
  title: "A long read",
  byline: "Ada Lovelace",
  siteName: "Example Blog",
  url: "https://example.com/post",
  content: `<div><h2>Intro</h2><p>Some <em>emphasis</em> and a <a href="https://x.org">link</a>.</p>
    <figure><img src="/hero.jpg" width="1200" height="600"><figcaption>Caption</figcaption></figure>
    <img src="https://tracker.example/pixel.gif">
    <blockquote><p>Quoted text</p></blockquote>
    <pre><code>const x = 1;
  indented();</code></pre>
    <ul><li>One</li><li>Two</li></ul>
    <table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>
    <hr><script>alert(1)</script><iframe src="https://ads"></iframe>
    ${"<p>Filler paragraph to push onto more pages.</p>".repeat(60)}</div>`,
};

test("pickImageSource prefers the smallest srcset entry that covers the screen", () => {
  const img = domWindow().document.createElement("img");
  img.setAttribute("srcset", "https://i/a-400.jpg 400w, https://i/a-1600.jpg 1600w, https://i/a-3000.jpg 3000w");
  img.setAttribute("src", "https://i/a.jpg");
  assert.equal(pickImageSource(img, 1404), "https://i/a-1600.jpg");
  assert.equal(pickImageSource(img, 5000), "https://i/a-3000.jpg");
});

test("prepareArticleHtml drops scripts and failed images and absolutizes image URLs", async () => {
  const requested = [];
  const html = await prepareArticleHtml(ARTICLE.content, {
    window: domWindow(),
    baseUrl: ARTICLE.url,
    targetWidthPx: 1404,
    loadImage: async (src) => {
      requested.push(src);
      return src.endsWith("hero.jpg") ? { dataUrl: ONE_PX_PNG } : null;
    },
  });
  assert.deepEqual(requested, ["https://example.com/hero.jpg", "https://tracker.example/pixel.gif"]);
  assert.equal((html.match(/<img/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<script|<iframe|width=/);
});

test("fitContentToPage bounds images, tables, and rules to the content box", () => {
  const content = [
    { image: "x", width: 900 },
    { table: { body: [[{ text: "a" }, { text: "b" }]] } },
    { nodeName: "HR", canvas: [{ type: "line", x1: 0, x2: 514 }] },
    { nodeName: "BLOCKQUOTE", stack: [] },
  ];
  fitContentToPage(content, { contentWidth: 400, contentHeight: 500, baseFontSize: 10 });
  assert.deepEqual(content[0].fit, [400, 425]);
  assert.equal(content[0].width, undefined);
  assert.deepEqual(content[1].table.widths, ["*", "*"]);
  assert.equal(content[2].canvas[0].x2, 400);
  assert.deepEqual(content[3].margin, [12, 0, 0, 6]);
});

for (const id of ["rm2", "rmpp", "rmppm"]) {
  test(`renderArticlePdf produces device-sized pages for ${id}`, async () => {
    const device = deviceById(id);
    const bytes = await renderArticlePdf({
      article: ARTICLE,
      device,
      window: domWindow(),
      htmlToPdfmake,
      pdfMake: nodePdfMake(),
      loadImage: async () => ({ dataUrl: ONE_PX_PNG }),
    });
    const doc = await PDFLib.PDFDocument.load(bytes);
    const size = pageSizePt(device);
    assert.ok(doc.getPageCount() > 1);
    const { width, height } = doc.getPage(0).getSize();
    assert.ok(Math.abs(width - size.width) < 0.01 && Math.abs(height - size.height) < 0.01);
    assert.equal(doc.getTitle(), "A long read");
  });
}

test("Google Docs reflow HTML renders without font errors", async () => {
  const window = domWindow();
  const docsHtml = `<html><head><style>.c1{font-family:"Arial";font-weight:700}</style></head>
    <body class="c9"><h1 id="h.1"><span class="c1">Heading</span></h1>
    <p><span style="font-family:Georgia">Inline font</span></p></body></html>`;
  const bytes = await renderArticlePdf({
    article: { title: "Doc", content: inlineDocsStyles(docsHtml, window.DOMParser), url: "" },
    device: deviceById("rm2"),
    window,
    htmlToPdfmake,
    pdfMake: nodePdfMake(),
  });
  assert.ok((await PDFLib.PDFDocument.load(bytes)).getPageCount() >= 1);
});
