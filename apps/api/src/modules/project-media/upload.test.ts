import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("File Upload & Key Security Rules", () => {
  const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/pdf"
  ]);

  const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

  function validateUploadRequest(filename: string, contentType: string, size?: number) {
    if (!filename || !contentType) {
      throw new Error("Missing filename or content type.");
    }
    if (filename.includes("..") || filename.includes("\0")) {
      throw new Error("Path traversal in filename detected.");
    }
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      throw new Error("Unsupported file type.");
    }
    if (size && size > MAX_FILE_SIZE_BYTES) {
      throw new Error("File size exceeds limit.");
    }

    const safeName = filename.replace(/^.*[\\/]/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const extension = safeName.split(".").pop()?.toLowerCase() || "bin";
    const objectKey = `uploads/${Date.now()}-secure.${extension}`;
    return { objectKey, safeName };
  }

  it("accepts valid image upload requests", () => {
    const result = validateUploadRequest("blueprint.png", "image/png", 5 * 1024 * 1024);
    assert.ok(result.objectKey.startsWith("uploads/"));
    assert.equal(result.safeName, "blueprint.png");
  });

  it("rejects unauthorized MIME types", () => {
    assert.throws(() => {
      validateUploadRequest("malicious.exe", "application/x-msdownload", 100);
    }, /Unsupported file type/);
  });

  it("rejects directory traversal in filenames", () => {
    assert.throws(() => {
      validateUploadRequest("../../../etc/passwd", "image/png", 100);
    }, /Path traversal in filename detected/);
  });

  it("rejects files exceeding size limit", () => {
    assert.throws(() => {
      validateUploadRequest("large_photo.jpg", "image/jpeg", 25 * 1024 * 1024);
    }, /File size exceeds limit/);
  });
});
