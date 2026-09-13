import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getS3Client, getS3BucketName } from "@/lib/s3";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key || key.includes("..") || key.includes("\0")) {
      return NextResponse.json({ error: "Invalid or missing image key." }, { status: 400 });
    }

    const s3Client = getS3Client();
    const bucketName = getS3BucketName();

    let response;
    let resolvedKey = key;

    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      response = await s3Client.send(command);
    } catch (err: any) {
      if (err.name === "NoSuchKey") {
        return NextResponse.json({ error: "Image not found." }, { status: 404 });
      }
      throw err;
    }

    if (!response.Body) {
      return NextResponse.json({ error: "Image body empty." }, { status: 404 });
    }

    const bytes = await response.Body.transformToByteArray();

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": response.ContentType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    console.error("View image error:", error);
    return NextResponse.json({ error: error.message || "Failed to load image." }, { status: 500 });
  }
}
