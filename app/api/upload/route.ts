import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, getS3BucketName, getS3PublicBaseUrl } from "@/lib/s3";

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: "Missing filename or content type." }, { status: 400 });
    }

    const s3Client = getS3Client();
    const bucketName = getS3BucketName();
    const objectKey = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType,
    });

    // Create a presigned URL valid for 5 minutes
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    const publicUrl = `${getS3PublicBaseUrl()}/${objectKey}`;

    return NextResponse.json({ uploadUrl: signedUrl, publicUrl });
  } catch (error: any) {
    console.error("Presigned URL error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate presigned URL." }, { status: 500 });
  }
}
