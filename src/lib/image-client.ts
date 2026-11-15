"use client";

/**
 * Client-side image preparation.
 *
 * Photos are validated, downscaled, and re-encoded in the browser before they
 * ever reach the server. This keeps requests small and fast, and means the
 * server-side size limits are a safety net rather than the happy path.
 */

import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "./api";
import { MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } from "./constants";

export class InvalidImageError extends Error {}

const ACCEPTED_LIST: string[] = [...ACCEPTED_IMAGE_TYPES];

/**
 * Turns a picked file into a compact data URL ready for /api/generate.
 * Throws `InvalidImageError` with a user-friendly message when the file is
 * not usable.
 */
export async function prepareImageFile(file: File): Promise<string> {
  if (!ACCEPTED_LIST.includes(file.type)) {
    throw new InvalidImageError("Please choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new InvalidImageError("That image is too large (max 25 MB).");
  }

  const dataUrl = await readAsDataUrl(file);

  // Small enough already and no oversized dimensions → send as-is.
  if (file.size <= MAX_IMAGE_BYTES && file.type !== "image/webp") {
    const dimensions = await imageSize(dataUrl);
    if (Math.max(dimensions.width, dimensions.height) <= MAX_IMAGE_DIMENSION) {
      return dataUrl;
    }
  }

  return reencode(dataUrl, file.type === "image/png");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new InvalidImageError("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new InvalidImageError("That file is not a valid image."));
    image.src = dataUrl;
  });
}

/**
 * Downscales to `MAX_IMAGE_DIMENSION` and re-encodes as JPEG (PNG keeps its
 * format for transparency). Guarded so it also works on browsers without
 * `createImageBitmap` support for data URLs.
 */
async function reencode(dataUrl: string, keepPng: boolean): Promise<string> {
  try {
    const response = await fetch(dataUrl);
    const bitmap = await createImageBitmap(await response.blob());

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas context");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return canvas.toDataURL(keepPng ? "image/png" : "image/jpeg", 0.9);
  } catch {
    // Canvas re-encoding failed (rare). Fall back to the original data URL —
    // the server enforces the same limits and will reject if truly too big.
    return dataUrl;
  }
}

/** Triggers a browser download for a data URL. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
