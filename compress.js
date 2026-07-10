import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const INPUT_DIR = './src/assets/SoloLeveling';
const OUTPUT_DIR = './public/chapters';
const TARGET_WIDTH = 1000;
const WEBP_QUALITY = 70;
const JPEG_QUALITY = 75;

function parseFilename(name) {
  const clean = name.replace(/\.[^.]+$/, "");
  const vol = clean.match(/v(?:ol)?[\s._-]*(\d{1,3})/i);
  const ch = clean.match(/(?:ch(?:apter)?|c|ep)[\s._-]*(\d{1,4})/i);
  const anyNum = clean.match(/(\d{1,4})/);
  const volume = vol ? parseInt(vol[1], 10) : 1;
  const order = ch ? parseInt(ch[1], 10) : anyNum ? parseInt(anyNum[1], 10) : 0;
  return {
    volume,
    order,
    title: clean.replace(/[_-]+/g, " ").trim(),
  };
}

async function run() {
  if (!fs.existsSync(INPUT_DIR)) {
    console.log(`[INFO] No '${INPUT_DIR}' directory found. Skipping build-time compression.`);
    return;
  }

  console.log('--- [STARTING BUILD-TIME IMAGE COMPRESSION] ---');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const metadata = [];
  const entries = fs.readdirSync(INPUT_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const chDir = path.join(INPUT_DIR, entry.name);
    const meta = parseFilename(entry.name);
    
    const files = fs.readdirSync(chDir)
      .filter(f => /\.(jpe?g|png|webp|gif|bmp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) continue;

    const chOutputDir = path.join(OUTPUT_DIR, `vol-${meta.volume}-ch-${meta.order}`);
    
    // Cache Check: Include webp and jpg/jpeg formats
    if (fs.existsSync(chOutputDir)) {
      const existingFiles = fs.readdirSync(chOutputDir).filter(f => /\.(webp|jpg|jpeg)$/i.test(f));
      if (existingFiles.length === files.length) {
        console.log(`Skipping (already compressed): ${entry.name}`);
        const relativePages = existingFiles
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map(f => `/chapters/vol-${meta.volume}-ch-${meta.order}/${f}`);
        metadata.push({
          id: `preloaded-${meta.volume}-${meta.order}`,
          title: meta.title || `Chapter ${meta.order}`,
          volume: meta.volume,
          order: meta.order,
          pageCount: relativePages.length,
          preloadedPages: relativePages,
          isPreloaded: true
        });
        continue;
      }
    }

    console.log(`Compressing: ${entry.name} -> Vol ${meta.volume} Ch ${meta.order}`);
    fs.mkdirSync(chOutputDir, { recursive: true });

    const relativePages = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const inputFilePath = path.join(chDir, file);

      try {
        const image = sharp(inputFilePath);
        const imageMeta = await image.metadata();
        
        let width = imageMeta.width || 0;
        let height = imageMeta.height || 0;
        
        // Calculate scaling dimensions
        if (width > TARGET_WIDTH) {
          height = Math.round((TARGET_WIDTH / width) * height);
          width = TARGET_WIDTH;
        }

        // WebP has a maximum limit of 16383 x 16383 pixels.
        // If height or width exceeds this, WebP encoding fails. Fallback to JPEG.
        const useJpeg = width > 16383 || height > 16383;
        const extension = useJpeg ? 'jpg' : 'webp';
        const outputFileName = `page-${i}.${extension}`;
        const outputFilePath = path.join(chOutputDir, outputFileName);

        let pipeline = image;
        if (imageMeta.width && imageMeta.width > TARGET_WIDTH) {
          pipeline = pipeline.resize(TARGET_WIDTH);
        }

        if (useJpeg) {
          await pipeline
            .jpeg({ quality: JPEG_QUALITY })
            .toFile(outputFilePath);
        } else {
          await pipeline
            .webp({ quality: WEBP_QUALITY })
            .toFile(outputFilePath);
        }
          
        relativePages.push(`/chapters/vol-${meta.volume}-ch-${meta.order}/${outputFileName}`);
      } catch (err) {
        console.error(`Failed to process page ${file} in ${entry.name}:`, err);
      }
    }

    metadata.push({
      id: `preloaded-${meta.volume}-${meta.order}`,
      title: meta.title || `Chapter ${meta.order}`,
      volume: meta.volume,
      order: meta.order,
      pageCount: relativePages.length,
      preloadedPages: relativePages,
      isPreloaded: true
    });
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));
  console.log('--- [BUILD-TIME COMPRESSION COMPLETED] ---');
}

run().catch(console.error);
