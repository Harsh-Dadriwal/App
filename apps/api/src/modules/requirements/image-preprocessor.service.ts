import { Injectable } from "@nestjs/common";
import sharp from "sharp";

export type PreprocessedImageResult = {
  buffer: Buffer;
  width: number;
  height: number;
  density: number;
  format: string | undefined;
  variants: Array<{
    name: string;
    buffer: Buffer;
    width: number;
    height: number;
    density: number;
    format: string | undefined;
  }>;
};

const MIN_TARGET_WIDTH = 2000;
const MAX_TARGET_WIDTH = 3000;
const TARGET_DENSITY = 300;

/** Minimum pixels in each dimension before we even attempt OCR preprocessing */
const MIN_SOURCE_WIDTH = 50;
const MIN_SOURCE_HEIGHT = 50;

function clampTargetWidth(width: number) {
  if (width < MIN_TARGET_WIDTH) return MIN_TARGET_WIDTH;
  if (width > MAX_TARGET_WIDTH) return MAX_TARGET_WIDTH;
  return width;
}

@Injectable()
export class ImagePreprocessorService {
  async preprocessForTesseract(rawBuffer: Buffer): Promise<PreprocessedImageResult> {
    const input = sharp(rawBuffer, { failOn: "none" });
    const metadata = await input.metadata();
    const originalWidth = metadata.width ?? 0;
    const originalHeight = metadata.height ?? 0;

    if (!originalWidth || !originalHeight) {
      throw new Error("Could not determine source image dimensions for OCR preprocessing.");
    }

    // Tesseract requires a minimum image size to function — reject tiny images early
    if (originalWidth < MIN_SOURCE_WIDTH || originalHeight < MIN_SOURCE_HEIGHT) {
      throw new Error(
        `Image too small for OCR (${originalWidth}×${originalHeight}px). ` +
        `Minimum required: ${MIN_SOURCE_WIDTH}×${MIN_SOURCE_HEIGHT}px. ` +
        `Please upload a clearer, higher-resolution photo.`
      );
    }

    const targetWidth = clampTargetWidth(originalWidth);
    const shouldResize = targetWidth !== originalWidth;

    let pipeline = input.rotate().flatten({ background: "#ffffff" });

    if (shouldResize) {
      pipeline = pipeline.resize({
        width: targetWidth,
        withoutEnlargement: false,
        fit: "inside"
      });
    }

    pipeline = pipeline
      .removeAlpha()
      .grayscale()
      .linear(1.4, -0.2)
      .normalize()
      .sharpen()
      .withMetadata({ density: TARGET_DENSITY });

    const [primary, thresholded, denoised] = await Promise.all([
      pipeline.clone().png().toBuffer({ resolveWithObject: true }),
      pipeline
        .clone()
        .median(1)
        .threshold(180)
        .png()
        .toBuffer({ resolveWithObject: true }),
      pipeline
        .clone()
        .blur(0.25)
        .sharpen({ sigma: 1.1, m1: 1.2, m2: 2.2 })
        .png()
        .toBuffer({ resolveWithObject: true })
    ]);

    return {
      buffer: primary.data,
      width: primary.info.width,
      height: primary.info.height,
      density: TARGET_DENSITY,
      format: primary.info.format,
      variants: [
        {
          name: "primary",
          buffer: primary.data,
          width: primary.info.width,
          height: primary.info.height,
          density: TARGET_DENSITY,
          format: primary.info.format
        },
        {
          name: "thresholded",
          buffer: thresholded.data,
          width: thresholded.info.width,
          height: thresholded.info.height,
          density: TARGET_DENSITY,
          format: thresholded.info.format
        },
        {
          name: "denoised",
          buffer: denoised.data,
          width: denoised.info.width,
          height: denoised.info.height,
          density: TARGET_DENSITY,
          format: denoised.info.format
        }
      ]
    };
  }
}
