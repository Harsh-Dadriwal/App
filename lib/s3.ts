import { S3Client } from "@aws-sdk/client-s3";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getStorageMode() {
  if (process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    return "r2" as const;
  }

  return "s3" as const;
}

export function getS3Client() {
  if (getStorageMode() === "r2") {
    const accountId = getRequiredEnv("R2_ACCOUNT_ID");

    return new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY")
      }
    });
  }

  return new S3Client({
    region: getRequiredEnv("AWS_REGION"),
    credentials: {
      accessKeyId: getRequiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("AWS_SECRET_ACCESS_KEY")
    }
  });
}

export function getS3BucketName() {
  if (getStorageMode() === "r2") {
    return getRequiredEnv("R2_BUCKET");
  }

  return getRequiredEnv("AWS_S3_BUCKET");
}

export function getS3PublicBaseUrl() {
  if (getStorageMode() === "r2") {
    const configured = process.env.R2_PUBLIC_BASE_URL;

    if (configured) {
      return configured.replace(/\/$/, "");
    }

    throw new Error("Missing required environment variable: R2_PUBLIC_BASE_URL");
  }

  const configured = process.env.AWS_S3_PUBLIC_BASE_URL;

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const bucket = getS3BucketName();
  const region = getRequiredEnv("AWS_REGION");
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

export function getServeUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.includes("cloudflarestorage.com") || url.includes("amazonaws.com")) {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts[0] === "product-image-store" || pathParts[0] === "photo-product-bucket") {
        return `/api/view-image?key=${pathParts.slice(1).join("/")}`;
      }
      return `/api/view-image?key=${pathParts.join("/")}`;
    } catch {
      return url;
    }
  }
  return url;
}
