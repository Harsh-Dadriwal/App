import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3BucketName, getS3Client, getS3PublicBaseUrl } from "@/lib/s3";

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const productId = String(formData.get("productId") ?? "");
    const productSku = String(formData.get("productSku") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!productId && !productSku) {
      return NextResponse.json(
        { error: "Product reference is required for upload." },
        { status: 400 }
      );
    }

    const extension =
      file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const objectKey = [
      "products",
      sanitizeSegment(productId || productSku || "catalog"),
      `${Date.now()}-${randomUUID()}.${extension}`
    ].join("/");

    const bytes = Buffer.from(await file.arrayBuffer());
    const s3Client = getS3Client();

    await s3Client.send(
      new PutObjectCommand({
        Bucket: getS3BucketName(),
        Key: objectKey,
        Body: bytes,
        ContentType: file.type || "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable"
      })
    );

    return NextResponse.json({
      url: `${getS3PublicBaseUrl()}/${objectKey}`
    });
  } catch (error: any) {
    console.error("Product image upload error:", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to upload product image." },
      { status: 500 }
    );
  }
}
