// Generate placeholder sample chapter pages as PNG blobs (offline, no network).
export async function generateSamplePages(chapterLabel: string, count = 5): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    blobs.push(await drawPage(chapterLabel, i + 1, count));
  }
  return blobs;
}

function drawPage(label: string, page: number, total: number): Promise<Blob> {
  const w = 720;
  const h = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, w, h);
  // subtle grid
  ctx.strokeStyle = "rgba(120,180,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // panel border
  ctx.strokeStyle = "rgba(120,220,255,0.6)";
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  // silhouette figure
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2 + 40, 140, 240, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(80,200,255,0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();
  // sword slash lines
  ctx.strokeStyle = "rgba(180,230,255,0.35)";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(80 + i * 50, h / 2 - 200);
    ctx.lineTo(w - 80 - i * 30, h / 2 + 200);
    ctx.stroke();
  }
  // text overlay
  ctx.fillStyle = "#e0f4ff";
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SOLO LEVELING", w / 2, 120);
  ctx.font = "28px system-ui, sans-serif";
  ctx.fillStyle = "#7ec8ff";
  ctx.fillText(label, w / 2, 170);
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillStyle = "#a0d8ff";
  ctx.fillText(`— Sample Page ${page} / ${total} —`, w / 2, h - 90);
  ctx.font = "16px monospace";
  ctx.fillStyle = "rgba(180,220,255,0.6)";
  ctx.fillText("Replace with your own chapter images from the Library.", w / 2, h - 55);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b!), "image/png");
  });
}
