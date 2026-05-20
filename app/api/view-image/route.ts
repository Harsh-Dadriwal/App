import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getS3Client, getS3BucketName } from "@/lib/s3";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Missing image key." }, { status: 400 });
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
        console.log(`Key "${key}" not found in R2. Attempting self-healing fallback search...`);
        
        // Parse the filename (everything after the last '-' or last '/')
        const parts = key.split("/");
        const lastPart = parts[parts.length - 1];
        const filename = lastPart.split("-").pop() || lastPart;
        
        // Determine tenant prefix folder: e.g. "requirements/[tenant-id]/"
        let prefix: string | undefined = undefined;
        if (parts[0] === "requirements" && parts[1]) {
          prefix = `requirements/${parts[1]}/`;
        }

        console.log(`Searching for file ending with "${filename}" under prefix "${prefix || "root"}"`);

        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
        });

        const listRes = await s3Client.send(listCommand);
        const foundItem = listRes.Contents?.find((item) => item.Key && item.Key.endsWith(filename));

        if (foundItem && foundItem.Key) {
          resolvedKey = foundItem.Key;
          console.log(`Self-healing fallback matched: "${resolvedKey}"`);

          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: resolvedKey,
          });
          response = await s3Client.send(command);

          // Update database row in background so next time we hit it directly
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (supabaseUrl && serviceRoleKey) {
            try {
              const supabase = createClient(supabaseUrl, serviceRoleKey, {
                auth: { persistSession: false, autoRefreshToken: false },
              });

              const publicBaseUrl = (
                process.env.R2_PUBLIC_BASE_URL ||
                process.env.AWS_S3_PUBLIC_BASE_URL ||
                ""
              ).replace(/\/$/, "");

              const nextPublicUrl = `${publicBaseUrl}/${resolvedKey}`;

              const { error: dbErr } = await supabase
                .from("requirement_batch_sources")
                .update({
                  storage_key: resolvedKey,
                  public_url: nextPublicUrl,
                })
                .eq("storage_key", key);

              if (dbErr) {
                console.error("Failed to update self-healed key in Supabase:", dbErr.message);
              } else {
                console.log("Successfully updated self-healed storage_key and public_url in Supabase!");
              }
            } catch (dbEx) {
              console.error("Supabase self-healing update exception:", dbEx);
            }
          }
        } else {
          // No match found, propagate original NoSuchKey error
          throw err;
        }
      } else {
        throw err;
      }
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
