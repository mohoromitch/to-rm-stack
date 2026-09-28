import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const vendor = join(root, "extension", "vendor");

const files = [
  ["pdf-lib/dist/pdf-lib.min.js", "pdf-lib.min.js"],
  ["pdf-lib/LICENSE.md", "licenses/pdf-lib.LICENSE.md"],
  ["pdfmake/build/pdfmake.min.js", "pdfmake.min.js"],
  ["pdfmake/build/vfs_fonts.js", "vfs_fonts.js"],
  ["pdfmake/LICENSE", "licenses/pdfmake.LICENSE"],
  ["html-to-pdfmake/browser.js", "html-to-pdfmake.js"],
  ["html-to-pdfmake/LICENSE", "licenses/html-to-pdfmake.LICENSE"],
  ["@mozilla/readability/Readability.js", "Readability.js"],
  ["@mozilla/readability/Readability-readerable.js", "Readability-readerable.js"],
  ["@mozilla/readability/LICENSE.md", "licenses/readability.LICENSE.md"],
];

for (const [from, to] of files) {
  const target = join(vendor, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(modules, from), target);
}
console.log(`Copied ${files.length} files to extension/vendor`);
