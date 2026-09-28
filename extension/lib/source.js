const GOOGLE_DOC_RE = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})(?:[/?#]|$)/;

export function googleDocId(url) {
  return GOOGLE_DOC_RE.exec(url ?? "")?.[1] ?? null;
}

export function classifyUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "unsupported", reason: "This tab has no page to send." };
  }
  if (parsed.protocol === "file:") {
    return { kind: "unsupported", reason: "Local files can't be sent. Open the file from a web address instead." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { kind: "unsupported", reason: "Browser pages can't be sent." };
  }
  const docId = googleDocId(url);
  if (docId) return { kind: "gdoc", docId };
  if (/\.pdf$/i.test(parsed.pathname)) return { kind: "pdf" };
  return { kind: "web" };
}

export function isPdfBytes(bytes) {
  const head = new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, Math.min(1024, bytes.byteLength));
  const text = String.fromCharCode(...head);
  return text.includes("%PDF-");
}

export function cleanTitle(title, fallback = "Untitled") {
  const cleaned = String(title ?? "")
    .replace(/\s+-\s+Google Docs$/, "")
    .replace(/\.pdf$/i, "")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 150);
}

export function filenameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "";
  } catch {
    return "";
  }
}

export function filenameFromContentDisposition(header) {
  if (!header) return "";
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {}
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : "";
}
