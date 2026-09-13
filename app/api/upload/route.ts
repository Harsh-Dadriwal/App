import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, getS3BucketName, getS3PublicBaseUrl } from "@/lib/s3";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf"
]);

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

function sanitizeFilename(filename: string) {
  const nameOnly = filename.replace(/^.*[\\/]/, "");
  return nameOnly.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType, size } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: "Missing filename or content type." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Only JPEG, PNG, WebP, HEIC photos and PDF files are allowed." },
        { status: 400 }
      );
    }

    if (size && Number(size) > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "File size exceeds the 15 MB limit." }, { status: 400 });
    }

    const safeName = sanitizeFilename(filename);
    const extension = safeName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const objectKey = `uploads/${Date.now()}-${randomUUID()}.${extension}`;

    const s3Client = getS3Client();
    const bucketName = getS3BucketName();

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType,
    });

    // Create a presigned URL valid for 5 minutes
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    const publicUrl = `${getS3PublicBaseUrl()}/${objectKey}`;

    return NextResponse.json({ uploadUrl: signedUrl, publicUrl, objectKey });
  } catch (error: any) {
    console.error("Presigned URL error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate presigned URL." }, { status: 500 });
  }
}
