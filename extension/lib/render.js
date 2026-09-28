import { pageSizePt } from "./devices.js";

const REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "video",
  "audio",
  "canvas",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "svg",
  "picture > source",
];

const MAX_IMAGES = 60;
const IMAGE_CONCURRENCY = 6;

export function pickImageSource(img, targetWidthPx) {
  const candidates = [];
  const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
  for (const entry of srcset.split(",")) {
    const [url, descriptor = "1x"] = entry.trim().split(/\s+/);
    if (!url) continue;
    const w = /^(\d+)w$/.exec(descriptor);
    const x = /^(\d*\.?\d+)x$/.exec(descriptor);
    candidates.push({ url, width: w ? Number(w[1]) : x ? Number(x[1]) * 1000 : 1000 });
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.width - b.width);
    const fit = candidates.find((c) => c.width >= targetWidthPx) ?? candidates[candidates.length - 1];
    return absolutize(fit.url, img.baseURI);
  }
  const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
  return src ? absolutize(src, img.baseURI) : "";
}

function absolutize(url, base) {
  try {
    return new URL(url, base && base !== "about:blank" ? base : undefined).href;
  } catch {
    return url;
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function prepareArticleHtml(html, { window, baseUrl, loadImage, targetWidthPx }) {
  const doc = new window.DOMParser().parseFromString(html, "text/html");
  if (baseUrl) {
    const base = doc.createElement("base");
    base.href = baseUrl;
    doc.head.prepend(base);
  }
  for (const el of doc.querySelectorAll(REMOVE_SELECTORS.join(","))) el.remove();

  const imgs = [...doc.querySelectorAll("img")];
  const keep = imgs.slice(0, MAX_IMAGES);
  for (const img of imgs.slice(MAX_IMAGES)) img.remove();

  const loaded = await mapLimit(keep, IMAGE_CONCURRENCY, async (img) => {
    const src = pickImageSource(img, targetWidthPx);
    if (!src || !loadImage) return null;
    try {
      return await loadImage(src);
    } catch {
      return null;
    }
  });

  keep.forEach((img, i) => {
    const image = loaded[i];
    if (!image) {
      img.remove();
      return;
    }
    for (const attr of [...img.attributes]) img.removeAttribute(attr.name);
    img.setAttribute("src", image.dataUrl);
  });

  for (const figure of doc.querySelectorAll("figure")) {
    if (!figure.querySelector("img") && !figure.textContent.trim()) figure.remove();
  }
  for (const el of doc.querySelectorAll("[width],[height]")) {
    el.removeAttribute("width");
    el.removeAttribute("height");
  }
  return doc.body.innerHTML;
}

function walk(node, visit) {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const key of ["stack", "text", "ul", "ol", "columns"]) {
    if (Array.isArray(node[key])) walk(node[key], visit);
  }
  if (node.table?.body) node.table.body.forEach((row) => walk(row, visit));
}

export function fitContentToPage(content, { contentWidth, contentHeight, baseFontSize = 11 }) {
  walk(content, (node) => {
    if (node.nodeName === "BLOCKQUOTE") {
      node.margin = [baseFontSize * 1.2, 0, 0, baseFontSize * 0.6];
    }
    if (node.image) {
      delete node.width;
      delete node.height;
      node.fit = [contentWidth, contentHeight * 0.85];
      node.alignment = "center";
      node.margin = [0, 4, 0, 8];
    }
    if (node.table?.body) {
      const cols = Math.max(...node.table.body.map((row) => row.length));
      node.table.widths = Array(cols).fill("*");
      delete node.width;
    }
    if (node.canvas && node.nodeName === "HR") {
      node.canvas = node.canvas.map((line) => ({ ...line, x1: 0, x2: contentWidth }));
    }
  });
  return content;
}

export function headingStyles(base) {
  const heading = (scale) => ({
    fontSize: Math.round(base * scale * 10) / 10,
    bold: true,
    marginTop: base * 0.9,
    marginBottom: base * 0.35,
  });
  return {
    h1: heading(1.6),
    h2: heading(1.4),
    h3: heading(1.25),
    h4: heading(1.1),
    h5: heading(1.0),
    h6: heading(1.0),
    p: { margin: [0, 0, 0, base * 0.6] },
    a: null,
    th: { bold: true, fillColor: "#EEEEEE" },
  };
}

export function buildDocDefinition({ article, device, fontSize, content }) {
  const { width, height } = pageSizePt(device);
  const base = fontSize ?? device.fontSizePt;
  const meta = [article.byline, article.siteName].filter(Boolean).join(" · ");
  const header = [{ text: article.title || "Untitled", fontSize: base * 1.8, bold: true, margin: [0, 0, 0, base * 0.4] }];
  if (meta) header.push({ text: meta, fontSize: base * 0.85, color: "#444444" });
  if (article.url) header.push({ text: article.url, fontSize: base * 0.7, color: "#666666", margin: [0, 2, 0, 0] });
  header.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: width - 2 * device.marginPt, y2: 0, lineWidth: 0.5 }],
    margin: [0, base * 0.6, 0, base * 0.9],
  });

  return {
    pageSize: { width, height },
    pageMargins: [device.marginPt, device.marginPt, device.marginPt, device.marginPt],
    info: { title: article.title || "Untitled", author: article.byline || undefined, subject: article.url || undefined },
    defaultStyle: { font: "Roboto", fontSize: base, lineHeight: 1.25 },
    styles: {
      "html-pre": { fontSize: base * 0.8, background: "#EEEEEE", preserveLeadingSpaces: true },
      "html-code": { background: "#EEEEEE" },
      "html-blockquote": { italics: true, color: "#333333" },
      "html-figcaption": { fontSize: base * 0.8, color: "#444444", alignment: "center", marginBottom: base * 0.8 },
    },
    content: [...header, content],
  };
}

export async function renderArticlePdf({
  article,
  device,
  fontSize,
  window,
  htmlToPdfmake,
  pdfMake,
  loadImage,
}) {
  const { width, height } = pageSizePt(device);
  const contentWidth = width - 2 * device.marginPt;
  const contentHeight = height - 2 * device.marginPt;
  const base = fontSize ?? device.fontSizePt;
  const html = await prepareArticleHtml(article.content, {
    window,
    baseUrl: article.url,
    loadImage,
    targetWidthPx: device.widthPx,
  });
  const content = htmlToPdfmake(html, {
    window,
    defaultStyles: headingStyles(base),
    ignoreStyles: ["font-family", "line-height", "color", "background-color"],
    removeExtraBlanks: true,
  });
  fitContentToPage(content, { contentWidth, contentHeight, baseFontSize: base });
  const definition = buildDocDefinition({ article, device, fontSize: base, content });
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return new Uint8Array(buffer.buffer ?? buffer, buffer.byteOffset ?? 0, buffer.byteLength);
}
