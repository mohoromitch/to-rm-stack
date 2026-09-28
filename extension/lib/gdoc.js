export function googleDocExportUrl(docId, format) {
  return `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=${format}`;
}

function parseLengthPt(value) {
  const match = /^(-?\d*\.?\d+)(pt|px|in|cm|mm)?$/.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  switch (match[2]) {
    case "px":
      return n * 0.75;
    case "in":
      return n * 72;
    case "cm":
      return (n * 72) / 2.54;
    case "mm":
      return (n * 72) / 25.4;
    default:
      return n;
  }
}

export function parseCssBox(value) {
  const parts = value.trim().split(/\s+/).map(parseLengthPt);
  if (parts.length === 0 || parts.length > 4 || parts.some((p) => p === null)) return null;
  const [top, right = top, bottom = top, left = right] = parts;
  return { top, right, bottom, left };
}

function classRules(html) {
  const rules = new Map();
  for (const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of style[1].matchAll(/\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g)) {
      rules.set(rule[1], (rules.get(rule[1]) ?? "") + rule[2] + ";");
    }
  }
  return rules;
}

function declarations(cssText) {
  const out = [];
  for (const decl of cssText.split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out.push([decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1).trim()]);
  }
  return out;
}

export function parseDocsPageMargins(html) {
  const body = /<body[^>]*class="([^"]*)"/i.exec(html);
  if (!body) return null;
  const rules = classRules(html);
  let margins = null;
  for (const cls of body[1].split(/\s+/)) {
    for (const [prop, value] of declarations(rules.get(cls) ?? "")) {
      if (prop === "padding") margins = parseCssBox(value) ?? margins;
    }
  }
  return margins;
}

const REFLOW_STYLE_PROPS = new Set([
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
  "font-size",
  "vertical-align",
]);

export function inlineDocsStyles(html, DOMParserImpl) {
  const rules = classRules(html);
  const doc = new DOMParserImpl().parseFromString(html, "text/html");
  for (const el of doc.body.querySelectorAll("[class]")) {
    const kept = [];
    for (const cls of el.getAttribute("class").split(/\s+/)) {
      for (const [prop, value] of declarations(rules.get(cls) ?? "")) {
        if (REFLOW_STYLE_PROPS.has(prop)) kept.push(`${prop}:${value}`);
      }
    }
    el.removeAttribute("class");
    if (kept.length) el.setAttribute("style", kept.join(";"));
    else el.removeAttribute("style");
  }
  return doc.body.innerHTML;
}
