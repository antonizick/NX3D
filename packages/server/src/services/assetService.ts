import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { config } from '../config.js';
import { tenantAssetsDir } from './tenantService.js';
import { ensureDir, exists, listDir, deleteFile } from './fileStore.js';

export type AssetCategory =
  | 'textures'
  | 'sprites/enemies'
  | 'sprites/weapons'
  | 'sprites/items'
  | 'sprites/player_portraits'
  | 'sprites/projectiles'
  | 'sounds/music'
  | 'sounds/player'
  | 'sounds/enemies'
  | 'sounds/weapons';

/** Max dimension for any image asset. */
const MAX_SIZE = 512;

/** Supported image MIME types. */
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Supported audio MIME types. */
const AUDIO_ACCEPTED = new Set(['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/x-wav']);

export interface UploadedAsset {
  filename: string;
  category: AssetCategory;
  /** Sub-id (e.g. enemyId). May be empty. */
  subId?: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export function isAudioMime(mimeType: string): boolean {
  return AUDIO_ACCEPTED.has(mimeType);
}

/**
 * Process and save an uploaded asset.
 * Images: converts to WebP, resizes to ≤512×512.
 * Audio: saved as-is with original extension; filename stem becomes the slot name.
 */
export async function processAndSaveAsset(
  tenantId: string,
  category: AssetCategory,
  subId: string | undefined,
  originalName: string,
  mimeType: string,
  buffer: Buffer
): Promise<UploadedAsset> {
  const isAudio = AUDIO_ACCEPTED.has(mimeType);

  if (!isAudio && !ACCEPTED.has(mimeType)) {
    throw new Error(`Unsupported type: ${mimeType}. Use PNG, JPEG, WebP, GIF, or MP3/OGG/WAV/WebM.`);
  }

  // Build destination directory
  const assetBase = tenantAssetsDir(tenantId);
  const destDir   = subId
    ? path.join(assetBase, category, subId)
    : path.join(assetBase, category);
  await ensureDir(destDir);

  // Audio: save as-is, preserve extension
  if (isAudio) {
    const ext      = path.extname(originalName) || '.mp3';
    const stem     = path.basename(originalName, ext);
    const outName  = `${stem}${ext}`;
    await fs.writeFile(path.join(destDir, outName), buffer);
    return { filename: outName, category, subId, width: 0, height: 0, sizeBytes: buffer.length };
  }

  // Derive output filename
  const baseName = path.basename(originalName, path.extname(originalName));
  const outName  = `${baseName}.webp`;
  const destPath = path.join(destDir, outName);

  // Process image: resize + webp
  const image  = sharp(buffer);
  const meta   = await image.metadata();
  const w      = meta.width  ?? MAX_SIZE;
  const h      = meta.height ?? MAX_SIZE;
  const needsResize = w > MAX_SIZE || h > MAX_SIZE;

  const processed = needsResize
    ? image.resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
    : image;

  const outBuffer = await processed.webp({ quality: 90 }).toBuffer();
  const outMeta   = await sharp(outBuffer).metadata();

  await fs.writeFile(destPath, outBuffer);

  return {
    filename: outName,
    category,
    subId,
    width:     outMeta.width  ?? 0,
    height:    outMeta.height ?? 0,
    sizeBytes: outBuffer.length,
  };
}

/** List all assets in a category, optionally filtered by subId. */
export async function listAssets(
  tenantId: string,
  category: AssetCategory,
  subId?: string
): Promise<string[]> {
  const assetBase = tenantAssetsDir(tenantId);
  const dir = subId
    ? path.join(assetBase, category, subId)
    : path.join(assetBase, category);
  return listDir(dir);
}

/** Copy the _defaults version of an asset back over the tenant's copy. */
export async function resetAssetToDefault(
  tenantId: string,
  category: AssetCategory,
  filename: string,
  subId?: string
): Promise<void> {
  const srcPath = subId
    ? path.join(config.defaultsRoot, 'assets', category, subId, filename)
    : path.join(config.defaultsRoot, 'assets', category, filename);

  if (!await exists(srcPath)) {
    throw Object.assign(new Error(`No default asset for ${category}/${subId ? subId + '/' : ''}${filename}`), { code: 'NOT_FOUND' });
  }

  const destDir = subId
    ? path.join(tenantAssetsDir(tenantId), category, subId)
    : path.join(tenantAssetsDir(tenantId), category);
  await ensureDir(destDir);
  await fs.copyFile(srcPath, path.join(destDir, filename));
}

/** Delete an asset file. */
export async function removeAsset(
  tenantId: string,
  category: AssetCategory,
  filename: string,
  subId?: string
): Promise<void> {
  const assetBase = tenantAssetsDir(tenantId);
  const filePath  = subId
    ? path.join(assetBase, category, subId, filename)
    : path.join(assetBase, category, filename);
  await deleteFile(filePath);
}

/** Return the filesystem path for serving a tenant asset. */
export function assetFilePath(tenantId: string, relativePath: string): string {
  return path.join(tenantAssetsDir(tenantId), relativePath);
}
