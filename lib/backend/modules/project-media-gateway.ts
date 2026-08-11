import { apiFetch } from "@/lib/api-client";
import type { CreateProjectMediaUploadRequestDto } from "@mahalaxmi/core/types/contracts";

type BackendResult<T> = { data: T | null; error: string | null };

type UploadUrlResponse = {
  media_id: string;
  upload_url: string;
  expires_in_seconds: number;
};

async function readResponse<T>(response: Response): Promise<BackendResult<T>> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: payload?.message || `Backend error ${response.status}` };
  }
  return { data: payload?.data ?? payload, error: null };
}

export async function listProjectMedia(projectId: string, filters: { contextType?: string; contextId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.contextType) params.set("context_type", filters.contextType);
  if (filters.contextId) params.set("context_id", filters.contextId);
  const suffix = params.size ? `?${params}` : "";
  return readResponse<any[]>(await apiFetch(`/api/v1/projects/${projectId}/media${suffix}`));
}

export async function getProjectMediaDownloadUrl(mediaId: string) {
  return readResponse<{ media_id: string; download_url: string; expires_in_seconds: number }>(
    await apiFetch(`/api/v1/project-media/${mediaId}/download-url`)
  );
}

export async function uploadProjectPhoto(
  projectId: string,
  file: File,
  options: Omit<CreateProjectMediaUploadRequestDto, "file_name" | "mime_type" | "size_bytes"> = {}
) {
  const upload = await readResponse<UploadUrlResponse>(
    await apiFetch(`/api/v1/projects/${projectId}/media/upload-url`, {
      method: "POST",
      body: JSON.stringify({
        ...options,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size
      })
    })
  );
  if (!upload.data) return upload;

  const objectUpload = await fetch(upload.data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  });
  if (!objectUpload.ok) {
    return { data: null, error: "Photo upload to private storage failed." };
  }

  return readResponse<any>(
    await apiFetch(`/api/v1/project-media/${upload.data.media_id}/complete`, { method: "POST" })
  );
}
