import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getS3BucketName, getS3Client, getS3PublicBaseUrl } from "@/lib/s3";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function sanitizeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getExtension(fileName: string, mimeType: string) {
  const rawExt = fileName.includes(".") ? fileName.split(".").pop() ?? "" : "";
  const cleanedExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (cleanedExt) {
    return cleanedExt;
  }

  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return "jpg";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const productId = String(formData.get("productId") ?? "");
    const productSku = String(formData.get("productSku") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!productId) {
      return NextResponse.json({ error: "Missing product id." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, WEBP, and AVIF files are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const extension = getExtension(file.name, file.type);
    const safeSku = sanitizeSegment(productSku || productId);
    const key = `products/${safeSku || "product"}-${randomUUID()}.${extension}`;

    const client = getS3Client();
    const bucket = getS3BucketName();

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: file.type
      })
    );

    return NextResponse.json({
      key,
      url: `${getS3PublicBaseUrl()}/${key}`
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Image upload failed."
      },
      { status: 500 }
    );
  }
}
