import { deviceById, pageSizePt } from "../lib/devices.js";
import { RemarkableClient } from "../lib/remarkable.js";
import {
  classifyUrl,
  cleanTitle,
  filenameFromContentDisposition,
  filenameFromUrl,
  isPdfBytes,
} from "../lib/source.js";
import { googleDocExportUrl, inlineDocsStyles, parseDocsPageMargins } from "../lib/gdoc.js";
import { fitPdfToPage } from "../lib/pdf-fit.js";
import { renderArticlePdf } from "../lib/render.js";
import { createImageLoader } from "../lib/images.js";
import { getSettings, localStore, updateSettings } from "../lib/settings.js";

const client = new RemarkableClient({ store: localStore });
let busy = false;

function progress(text) {
  browser.runtime.sendMessage({ type: "progress", text }).catch(() => {});
}

async function probeTab(tabId) {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ["vendor/Readability-readerable.js"] });
    const [probe] = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({
        contentType: document.contentType,
        readerable: typeof isProbablyReaderable === "function" ? isProbablyReaderable(document) : true,
      }),
    });
    return { injectable: true, ...probe.result };
  } catch {
    return { injectable: false };
  }
}

async function probeContentType(url) {
  try {
    const response = await fetch(url, { method: "HEAD", credentials: "include" });
    return response.headers.get("content-type") ?? "";
  } catch {
    return "";
  }
}

async function classifyTab(tab) {
  const byUrl = classifyUrl(tab.url);
  if (byUrl.kind !== "web") return byUrl;
  const probe = await probeTab(tab.id);
  if (probe.injectable) {
    if (probe.contentType === "application/pdf") return { kind: "pdf" };
    return { kind: "article", readerable: probe.readerable };
  }
  if ((await probeContentType(tab.url)).includes("application/pdf")) return { kind: "pdf" };
  return { kind: "unsupported", reason: "Firefox doesn't let extensions read this page." };
}

async function fetchInTab(tabId, url, as) {
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    args: [url, as],
    func: async (target, mode) => {
      const response = await fetch(target, { credentials: "include" });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok) return { ok: false, status: response.status, type };
      return mode === "text"
        ? { ok: true, type, text: await response.text() }
        : { ok: true, type, buffer: await response.arrayBuffer() };
    },
  });
  return injection.result;
}

async function fetchGoogleExport(tabId, url, as) {
  const attempts = [
    async () => {
      const response = await fetch(url, { credentials: "include" });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok) return { ok: false, status: response.status, type };
      return as === "text"
        ? { ok: true, type, text: await response.text() }
        : { ok: true, type, buffer: await response.arrayBuffer() };
    },
    () => fetchInTab(tabId, url, as),
  ];
  let last;
  for (const attempt of attempts) {
    try {
      last = await attempt();
    } catch (error) {
      last = { ok: false, error };
      continue;
    }
    if (!last.ok) continue;
    if (as === "text" && last.type.includes("text/html")) return last.text;
    if (as !== "text" && isPdfBytes(new Uint8Array(last.buffer))) return new Uint8Array(last.buffer);
  }
  if (last?.status === 403 || last?.status === 401) {
    throw new Error("Google refused the export. Check that you can download this doc (File → Download).");
  }
  throw new Error("Couldn't export this Google Doc. Check that you're signed in and can download it.");
}

async function fetchPdf(tab) {
  const response = await fetch(tab.url, { credentials: "include" });
  if (!response.ok) throw new Error(`Couldn't download the PDF (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isPdfBytes(bytes)) throw new Error("The file at this address isn't a PDF.");
  const name =
    filenameFromContentDisposition(response.headers.get("content-disposition")) ||
    (tab.title && tab.title !== filenameFromUrl(tab.url) ? tab.title : "") ||
    filenameFromUrl(tab.url);
  return { bytes, name: cleanTitle(name) };
}

async function extractArticle(tabId) {
  await browser.scripting.executeScript({ target: { tabId }, files: ["vendor/Readability.js"] });
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    files: ["content/extract-article.js"],
  });
  const article = injection?.result;
  if (!article?.ok) throw new Error("Couldn't find readable article text on this page.");
  return article;
}

function renderWithDevice(article, device, settings) {
  return renderArticlePdf({
    article,
    device,
    fontSize: settings.fontSize ?? undefined,
    window,
    htmlToPdfmake,
    pdfMake,
    loadImage: createImageLoader({ maxWidthPx: device.widthPx }),
  });
}

async function buildDocument(tab, info, device, settings) {
  if (info.kind === "pdf") {
    progress("Downloading the PDF…");
    return fetchPdf(tab);
  }

  if (info.kind === "gdoc") {
    const name = cleanTitle(tab.title);
    const needsHtml = settings.gdocLayout === "reflow" || settings.trimDocMargins;
    progress("Exporting from Google Docs…");
    const html = needsHtml ? await fetchGoogleExport(tab.id, googleDocExportUrl(info.docId, "html"), "text") : null;

    if (settings.gdocLayout === "reflow") {
      progress("Laying out the doc for your tablet…");
      const content = inlineDocsStyles(html, DOMParser);
      const bytes = await renderWithDevice({ title: name, content, url: "" }, device, settings);
      return { bytes, name };
    }

    const pdf = await fetchGoogleExport(tab.id, googleDocExportUrl(info.docId, "pdf"), "pdf");
    progress("Fitting pages to your tablet…");
    const bytes = await fitPdfToPage(
      pdf,
      {
        ...pageSizePt(device),
        margin: device.marginPt / 2,
        trim: settings.trimDocMargins ? parseDocsPageMargins(html) : null,
        title: name,
      },
      PDFLib,
    );
    return { bytes, name };
  }

  if (info.kind === "article") {
    progress("Extracting the article…");
    const article = await extractArticle(tab.id);
    progress("Building the PDF…");
    const bytes = await renderWithDevice(article, device, settings);
    return { bytes, name: cleanTitle(article.title) };
  }

  throw new Error(info.reason ?? "This page can't be sent.");
}

async function notify(title, message) {
  await browser.notifications
    .create({ type: "basic", iconUrl: browser.runtime.getURL("icons/icon-96.png"), title, message })
    .catch(() => {});
}

async function build(tabId, deviceId) {
  const tab = await browser.tabs.get(tabId);
  const settings = await getSettings();
  const device = deviceById(deviceId ?? settings.device);
  const info = await classifyTab(tab);
  return buildDocument(tab, info, device, settings);
}

async function exclusive(task) {
  if (busy) throw new Error("A send is already in progress.");
  busy = true;
  await browser.action.setBadgeText({ text: "…" });
  // Extension API calls reset Firefox's idle timer, so the event page isn't suspended mid-send.
  const keepAlive = setInterval(() => browser.runtime.getPlatformInfo(), 20000);
  try {
    return await task();
  } finally {
    clearInterval(keepAlive);
    busy = false;
    await browser.action.setBadgeText({ text: "" });
  }
}

async function preview({ tabId, deviceId }) {
  return exclusive(async () => {
    const { bytes, name } = await build(tabId, deviceId);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    await browser.tabs.create({ url });
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    return { ok: true, name, bytes: bytes.byteLength };
  }).catch((error) => ({ ok: false, error: error.message }));
}

async function send({ tabId, deviceId }) {
  return exclusive(async () => {
    if (!(await client.status()).paired) throw new Error("Pair the extension with your reMarkable account first.");
    const { bytes, name } = await build(tabId, deviceId);
    progress("Uploading to reMarkable…");
    const result = await client.upload(bytes, name);
    await notify("Sent to reMarkable", `“${name}” is syncing to your tablet.`);
    return { ok: true, name, bytes: bytes.byteLength, docID: result.docID };
  }).catch(async (error) => {
    await notify("Couldn't send to reMarkable", error.message);
    return { ok: false, error: error.message };
  });
}

const handlers = {
  async inspect({ tabId }) {
    const tab = await browser.tabs.get(tabId);
    const [info, status, settings] = await Promise.all([classifyTab(tab), client.status(), getSettings()]);
    return { info, status, settings, title: cleanTitle(tab.title), busy };
  },
  send,
  preview,
  async build({ tabId, deviceId }) {
    const { bytes, name } = await build(tabId, deviceId);
    return { ok: true, name, bytes };
  },
  status: () => client.status(),
  pair: ({ code }) => client.pair(code),
  unpair: () => client.unpair(),
  getSettings: () => getSettings(),
  updateSettings: ({ patch }) => updateSettings(patch),
};

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id) return undefined;
  const handler = handlers[message?.type];
  if (!handler) return undefined;
  return Promise.resolve(handler(message)).catch((error) => ({ ok: false, error: error.message }));
});
