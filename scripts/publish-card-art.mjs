/**
 * Resizes/optimizes card artwork to WebP and updates the design manifest
 * the frontend reads image URLs from (src/data/cardDesignManifest.json).
 * Optionally uploads the result to an S3-compatible bucket (Cloudflare R2,
 * Backblaze B2, AWS S3, ...).
 *
 * Card images are NOT bundled into the app or committed as originals to
 * git — see README > Card artwork storage for why. This script is how you
 * add a new collection's art without repeating that mistake.
 *
 * Usage:
 *   node scripts/publish-card-art.mjs --collection sm2027 --src data/card-art-source/sm2027
 *   node scripts/publish-card-art.mjs --collection sm2027 --src data/card-art-source/sm2027 --upload
 *
 * --src should contain the raw JPG/PNG exports, one file per card, named
 * after the card's designKey (e.g. ID-001.jpg) exactly as it appears in
 * data/game-content.json.
 *
 * For --upload, set these in .env (never commit real values):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */

import { readdir, mkdir, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MANIFEST_PATH = new URL("../src/data/cardDesignManifest.json", import.meta.url);
const MAX_WIDTH = 960; // ~2x the largest on-screen size (the 480px lightbox)
const WEBP_QUALITY = 82;

function parseArgs(argv) {
  const args = { upload: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--collection") args.collection = argv[++i];
    else if (a === "--src") args.src = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--upload") args.upload = true;
  }
  if (!args.collection || !args.src) {
    console.error(
      "Usage: node scripts/publish-card-art.mjs --collection <id> --src <folder> [--upload] [--out <folder>]"
    );
    process.exit(1);
  }
  args.out ??= `data/card-art-optimized/${args.collection}`;
  return args;
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function processImages({ collection, src, out }) {
  await mkdir(out, { recursive: true });
  const files = (await readdir(src)).filter((f) => /\.(jpe?g|png)$/i.test(f));
  const manifest = await loadManifest();
  let beforeTotal = 0;
  let afterTotal = 0;

  for (const file of files) {
    const stem = file.replace(/\.(jpe?g|png)$/i, "");
    const srcPath = path.join(src, file);
    const outPath = path.join(out, `${stem}.webp`);

    const before = (await stat(srcPath)).size;
    const image = sharp(srcPath).rotate(); // auto-orient; also strips EXIF on output
    const metadata = await image.metadata();
    const pipeline =
      metadata.width && metadata.width > MAX_WIDTH ? image.resize({ width: MAX_WIDTH }) : image;

    await pipeline.webp({ quality: WEBP_QUALITY }).toFile(outPath);
    const after = (await stat(outPath)).size;

    beforeTotal += before;
    afterTotal += after;
    manifest[stem] = `${collection}/${stem}.webp`;
    console.log(`${file}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`);
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${files.length} images processed.`);
  console.log(
    `Total: ${(beforeTotal / 1024 / 1024).toFixed(1)}MB -> ${(afterTotal / 1024 / 1024).toFixed(1)}MB`
  );
  return { files };
}

async function uploadToR2({ collection, out, files }) {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error(
      "Missing R2 credentials — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME in .env"
    );
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  for (const file of files) {
    const stem = file.replace(/\.(jpe?g|png)$/i, "");
    const key = `card-art/${collection}/${stem}.webp`;
    const body = await readFile(path.join(out, `${stem}.webp`));
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    console.log(`Uploaded ${key}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const { files } = await processImages(args);
if (args.upload) {
  await uploadToR2({ collection: args.collection, out: args.out, files });
  console.log("\nDone — manifest updated and images uploaded.");
} else {
  console.log(
    "\nDone — manifest updated locally. Re-run with --upload once R2 credentials are set in .env to actually publish these files."
  );
}
