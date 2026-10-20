import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // Vercel functions accept bodies up to 4.5 MB.
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif"
};

export type UploadedPhoto = { buffer: Buffer; mimetype: string; size: number };

/** Requirement-list photos live in the private R2 bucket and are only read through short-lived signed links. */
@Injectable()
export class QuotationPhotosService {
  private client: S3Client | null = null;

  private get bucket() {
    const bucket = process.env.R2_BUCKET;
    if (!bucket) throw new ServiceUnavailableException("Photo upload is not available right now.");
    return bucket;
  }

  private storage() {
    if (this.client) return this.client;
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new ServiceUnavailableException("Photo upload is not available right now.");
    }
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
    });
    return this.client;
  }

  /** Where a person's photos go; a quotation may only use keys under its owner's folder. */
  ownerPrefix(tenantId: string, userId: string) {
    return `quotations/${tenantId}/${userId}/`;
  }

  async upload(tenantId: string, userId: string, file: UploadedPhoto | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException("Choose a photo to upload.");
    const extension = PHOTO_TYPES[file.mimetype];
    if (!extension) throw new BadRequestException("Upload a JPG, PNG, WebP or HEIC photo.");
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException("The photo is too large. Please use a photo under 4 MB.");

    const key = `${this.ownerPrefix(tenantId, userId)}${randomUUID()}.${extension}`;
    await this.storage().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    return { key };
  }

  /** Deletes every photo a person uploaded in a workspace (used when they delete their account). */
  async deleteOwnerPhotos(tenantId: string, userId: string) {
    const prefix = this.ownerPrefix(tenantId, userId);
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.storage().send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((object) => ({ Key: object.Key! }));
      if (keys.length) {
        await this.storage().send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  /** Signed links valid for an hour; empty when storage is not set up, so lists still load. */
  async viewUrls(keys: string[]) {
    if (!keys.length) return [];
    try {
      return await Promise.all(
        keys.map((key) => getSignedUrl(this.storage(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 3600 }))
      );
    } catch {
      return [];
    }
  }
}
