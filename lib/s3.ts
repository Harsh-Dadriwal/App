import { S3Client } from "@aws-sdk/client-s3";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getS3Client() {
  return new S3Client({
    region: getRequiredEnv("AWS_REGION"),
    credentials: {
      accessKeyId: getRequiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("AWS_SECRET_ACCESS_KEY")
    }
  });
}

export function getS3BucketName() {
  return getRequiredEnv("AWS_S3_BUCKET");
}

export function getS3PublicBaseUrl() {
  const configured = process.env.AWS_S3_PUBLIC_BASE_URL;

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const bucket = getS3BucketName();
  const region = getRequiredEnv("AWS_REGION");
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}
