const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MIN_DIMENSION_PX = 24;
const FETCH_TIMEOUT_MS = 15000;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function createImageLoader({ maxWidthPx }) {
  return async function loadImage(src) {
    const response = await fetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > MAX_IMAGE_BYTES) return null;
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width < MIN_DIMENSION_PX || bitmap.height < MIN_DIMENSION_PX) return null;
      const scale = Math.min(1, maxWidthPx / bitmap.width);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
      return { dataUrl: await blobToDataUrl(jpeg), width, height };
    } finally {
      bitmap.close();
    }
  };
}
