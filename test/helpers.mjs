import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);

export const PDFLib = require("pdf-lib");
export const htmlToPdfmake = require("html-to-pdfmake");

export function nodePdfMake() {
  const pdfmake = require("pdfmake");
  const dir = require.resolve("pdfmake/build/fonts/Roboto/Roboto-Regular.ttf").replace(/Roboto-Regular\.ttf$/, "");
  pdfmake.setFonts({
    Roboto: {
      normal: `${dir}Roboto-Regular.ttf`,
      bold: `${dir}Roboto-Medium.ttf`,
      italics: `${dir}Roboto-Italic.ttf`,
      bolditalics: `${dir}Roboto-MediumItalic.ttf`,
    },
  });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((path) => path.startsWith(dir));
  return pdfmake;
}

export function domWindow() {
  return new JSDOM("<!doctype html><html><body></body></html>").window;
}

export function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const k of keys) delete data[k];
    },
  };
}

export function fakeJwt(expSeconds) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64({ exp: expSeconds })}.sig`;
}

export const ONE_PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==";
