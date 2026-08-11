import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { CreateProjectMediaUploadRequestDto } from "@mahalaxmi/core";
import type { RequestActor } from "../../common/auth/auth.types";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const ALLOWED_CONTEXT_TYPES = new Set(["project", "site", "room", "task", "issue", "chat"]);

type ProjectRow = { id: string; tenant_id: string; customer_id: string | null; created_by: string | null };
type MediaRow = {
  id: string;
  project_id: string;
  tenant_id: string;
  uploaded_by: string;
  shared_by: string;
  object_key: string;
  original_filename: string;
  mime_type: string;
  status: string;
  visibility: string;
  project_media_recipients?: Array<{ recipient_user_id: string }>;
};

@Injectable()
export class ProjectMediaService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService
  ) {}

  private requireUserId(actor: RequestActor) {
    if (!actor.appUserId) throw new UnauthorizedException("App profile not linked.");
    return actor.appUserId;
  }

  private getStorageClient() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("Cloudflare R2 is not fully configured for private project media.");
    }

    return new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey }
    });
  }

  private getBucket() {
    const bucket = process.env.R2_PROJECT_MEDIA_BUCKET;
    if (!bucket) throw new Error("R2_PROJECT_MEDIA_BUCKET must be configured for private project media.");
    return bucket;
  }

  private async getProject(actor: RequestActor, projectId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("projects")
      .select("id, tenant_id, customer_id, created_by")
      .eq("id", projectId)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new NotFoundException("Project not found.");

    const project = result.data as ProjectRow;
    await this.tenantAccess.assertTenantAccess(actor, project.tenant_id);
    await this.assertProjectAccess(actor, project);
    return project;
  }

  private async assertProjectAccess(actor: RequestActor, project: ProjectRow) {
    const userId = this.requireUserId(actor);
    if (actor.role === "admin" || project.customer_id === userId || project.created_by === userId) return;

    const membership = await this.supabaseAdmin
      .getClient()
      .from("project_members")
      .select("id")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membership.error) throw new Error(membership.error.message);
    if (!membership.data) throw new ForbiddenException("You do not have access to this project.");
  }

  private async getMedia(actor: RequestActor, mediaId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("project_media")
      .select("*, project_media_recipients(recipient_user_id)")
      .eq("id", mediaId)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new NotFoundException("Project media not found.");

    const media = result.data as MediaRow;
    const project = await this.getProject(actor, media.project_id);
    const userId = this.requireUserId(actor);
    const isRecipient = (media.project_media_recipients ?? []).some((recipient) => recipient.recipient_user_id === userId);
    const allowed =
      actor.role === "admin" ||
      media.visibility === "project" ||
      media.uploaded_by === userId ||
      media.shared_by === userId ||
      isRecipient;
    if (!allowed) throw new ForbiddenException("This photo was shared with selected recipients only.");
    return { media, project };
  }

  private validateUpload(body: CreateProjectMediaUploadRequestDto) {
    if (!body.file_name?.trim() || !ALLOWED_MIME_TYPES.has(body.mime_type)) {
      throw new BadRequestException("Only JPEG, PNG, WebP, and HEIC photos are supported.");
    }
    if (!Number.isInteger(body.size_bytes) || body.size_bytes <= 0 || body.size_bytes > MAX_MEDIA_BYTES) {
      throw new BadRequestException("Photos must be between 1 byte and 20 MB.");
    }
    if (body.context_type && !ALLOWED_CONTEXT_TYPES.has(body.context_type)) {
      throw new BadRequestException("Unsupported media context.");
    }
    if (body.visibility === "recipients" && !body.recipient_user_ids?.length) {
      throw new BadRequestException("Select at least one recipient for private sharing.");
    }
    if (body.visibility !== "recipients" && body.recipient_user_ids?.length) {
      throw new BadRequestException("Recipients can only be used with private sharing.");
    }
  }

  private buildObjectKey(project: ProjectRow, fileName: string) {
    const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
    return `project-media/${project.tenant_id}/${project.id}/${randomUUID()}.${extension}`;
  }

  private async assertRecipientsAreMembers(projectId: string, recipientIds: string[]) {
    const uniqueIds = [...new Set(recipientIds)];
    const result = await this.supabaseAdmin
      .getClient()
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId)
      .eq("status", "active")
      .in("user_id", uniqueIds);
    if (result.error) throw new Error(result.error.message);
    if ((result.data ?? []).length !== uniqueIds.length) {
      throw new BadRequestException("Every recipient must be an active project member.");
    }
    return uniqueIds;
  }

  async createUploadUrl(actor: RequestActor, projectId: string, body: CreateProjectMediaUploadRequestDto) {
    this.validateUpload(body);
    const userId = this.requireUserId(actor);
    const project = await this.getProject(actor, projectId);
    const recipientIds = body.visibility === "recipients"
      ? await this.assertRecipientsAreMembers(project.id, body.recipient_user_ids ?? [])
      : [];
    const objectKey = this.buildObjectKey(project, body.file_name);

    const mediaInsert = await this.supabaseAdmin
      .getClient()
      .from("project_media")
      .insert({
        tenant_id: project.tenant_id,
        project_id: project.id,
        uploaded_by: userId,
        shared_by: userId,
        object_key: objectKey,
        original_filename: body.file_name.trim().slice(0, 255),
        mime_type: body.mime_type,
        size_bytes: body.size_bytes,
        visibility: body.visibility ?? "project",
        context_type: body.context_type ?? "project",
        context_id: body.context_id ?? null,
        caption: body.caption?.trim().slice(0, 2000) || null
      })
      .select("id, object_key, status")
      .single();
    if (mediaInsert.error) throw new Error(mediaInsert.error.message);

    if (recipientIds.length) {
      const recipients = await this.supabaseAdmin.getClient().from("project_media_recipients").insert(
        recipientIds.map((recipientUserId) => ({ media_id: mediaInsert.data.id, recipient_user_id: recipientUserId }))
      );
      if (recipients.error) throw new Error(recipients.error.message);
    }

    const uploadUrl = await getSignedUrl(
      this.getStorageClient(),
      new PutObjectCommand({ Bucket: this.getBucket(), Key: objectKey, ContentType: body.mime_type }),
      { expiresIn: 10 * 60 }
    );

    return { media_id: mediaInsert.data.id, upload_url: uploadUrl, expires_in_seconds: 600 };
  }

  async completeUpload(actor: RequestActor, mediaId: string) {
    const { media } = await this.getMedia(actor, mediaId);
    const userId = this.requireUserId(actor);
    if (media.uploaded_by !== userId && actor.role !== "admin") {
      throw new ForbiddenException("Only the uploader can complete this photo upload.");
    }

    try {
      const object = await this.getStorageClient().send(new HeadObjectCommand({ Bucket: this.getBucket(), Key: media.object_key }));
      if (!object.ContentLength || object.ContentLength > MAX_MEDIA_BYTES) {
        throw new BadRequestException("Uploaded photo is missing or exceeds the 20 MB limit.");
      }
      if (object.ContentType !== media.mime_type) {
        throw new BadRequestException("Uploaded photo type does not match the requested type.");
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("The uploaded photo could not be verified.");
    }

    const update = await this.supabaseAdmin
      .getClient()
      .from("project_media")
      .update({ status: "ready", uploaded_at: new Date().toISOString() })
      .eq("id", media.id)
      .select("*")
      .single();
    if (update.error) throw new Error(update.error.message);
    return update.data;
  }

  async list(actor: RequestActor, projectId: string, filters: { contextType?: string; contextId?: string }) {
    const userId = this.requireUserId(actor);
    const project = await this.getProject(actor, projectId);
    let query = this.supabaseAdmin
      .getClient()
      .from("project_media")
      .select("*, project_media_recipients(recipient_user_id)")
      .eq("project_id", project.id)
      .eq("status", "ready")
      .order("created_at", { ascending: false });
    if (filters.contextType) query = query.eq("context_type", filters.contextType);
    if (filters.contextId) query = query.eq("context_id", filters.contextId);
    const result = await query;
    if (result.error) throw new Error(result.error.message);

    return (result.data ?? []).filter((media: MediaRow) =>
      actor.role === "admin" ||
      media.visibility === "project" ||
      media.uploaded_by === userId ||
      media.shared_by === userId ||
      (media.project_media_recipients ?? []).some((recipient) => recipient.recipient_user_id === userId)
    );
  }

  async createDownloadUrl(actor: RequestActor, mediaId: string) {
    const { media } = await this.getMedia(actor, mediaId);
    if (media.status !== "ready") throw new BadRequestException("This photo is not ready yet.");
    const downloadUrl = await getSignedUrl(
      this.getStorageClient(),
      new GetObjectCommand({ Bucket: this.getBucket(), Key: media.object_key }),
      { expiresIn: 5 * 60 }
    );
    return { media_id: media.id, download_url: downloadUrl, expires_in_seconds: 300 };
  }
}
