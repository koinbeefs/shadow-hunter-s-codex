// Renders each page of a PDF file into a PNG blob using pdfjs-dist.
import * as pdfjs from "pdfjs-dist";
// Vite bundles the worker as a URL. This keeps PDF parsing fully offline.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function pdfToPageBlobs(
  file: File,
  onProgress?: (current: number, total: number) => void,
  scale = 2,
): Promise<Blob[]> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: Blob[] = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to encode page"))),
        "image/jpeg",
        0.85,
      );
    });
    out.push(blob);
    onProgress?.(i, doc.numPages);
    page.cleanup();
  }
  await (doc as any).destroy?.();
  return out;
}
