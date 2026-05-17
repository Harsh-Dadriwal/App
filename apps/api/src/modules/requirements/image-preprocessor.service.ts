import { Injectable } from "@nestjs/common";
import sharp from "sharp";

export type PreprocessedImageResult = {
  buffer: Buffer;
  width: number;
  height: number;
  density: number;
  format: string | undefined;
};

const MIN_TARGET_WIDTH = 2000;
const MAX_TARGET_WIDTH = 3000;
const TARGET_DENSITY = 300;

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

    const targetWidth = Math.min(
      MAX_TARGET_WIDTH,
      Math.max(MIN_TARGET_WIDTH, originalWidth)
    );
    const shouldResize = targetWidth !== originalWidth;

    let pipeline = input.rotate();

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
      .sharpen()
      .withMetadata({ density: TARGET_DENSITY });

    const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      width: info.width,
      height: info.height,
      density: TARGET_DENSITY,
      format: info.format
    };
  }
}
