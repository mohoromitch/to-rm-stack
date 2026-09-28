const MIN_CONTENT_PT = 72;

function trimmedBox(page, trim) {
  const box = page.getCropBox();
  const t = trim ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const left = box.x + Math.max(0, t.left);
  const right = box.x + box.width - Math.max(0, t.right);
  const bottom = box.y + Math.max(0, t.bottom);
  const top = box.y + box.height - Math.max(0, t.top);
  if (right - left < MIN_CONTENT_PT || top - bottom < MIN_CONTENT_PT) {
    return { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height };
  }
  return { left, bottom, right, top };
}

export async function fitPdfToPage(bytes, { width, height, margin = 0, trim = null, title } = {}, PDFLib) {
  const source = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const output = await PDFLib.PDFDocument.create();
  const pages = source.getPages();
  const boxes = pages.map((page) => trimmedBox(page, trim));
  const embedded = await output.embedPages(pages, boxes);
  const innerW = width - 2 * margin;
  const innerH = height - 2 * margin;

  embedded.forEach((page, i) => {
    const box = boxes[i];
    const boxW = box.right - box.left;
    const boxH = box.top - box.bottom;
    const scale = Math.min(innerW / boxW, innerH / boxH);
    const target = output.addPage([width, height]);
    target.drawPage(page, {
      x: (width - boxW * scale) / 2,
      y: height - margin - boxH * scale,
      xScale: scale,
      yScale: scale,
    });
  });

  const docTitle = title ?? source.getTitle();
  if (docTitle) output.setTitle(docTitle);
  output.setProducer("to-rm-stack");
  return output.save();
}
