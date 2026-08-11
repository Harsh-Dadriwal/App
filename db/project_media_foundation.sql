-- Private project media metadata. Binary objects live in Cloudflare R2.

CREATE TABLE IF NOT EXISTS public.project_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  shared_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  visibility TEXT NOT NULL DEFAULT 'project' CHECK (visibility IN ('project', 'recipients')),
  context_type TEXT NOT NULL DEFAULT 'project' CHECK (context_type IN ('project', 'site', 'room', 'task', 'issue', 'chat')),
  context_id UUID,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'failed')),
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_media_recipients (
  media_id UUID NOT NULL REFERENCES public.project_media(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (media_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_media_project_created ON public.project_media (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_media_recipient_user ON public.project_media_recipients (recipient_user_id, media_id);

CREATE OR REPLACE FUNCTION public.can_access_project_media(target_media_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_media media
    LEFT JOIN public.project_media_recipients recipient
      ON recipient.media_id = media.id
      AND recipient.recipient_user_id = public.current_profile_id()
    WHERE media.id = target_media_id
      AND (
        public.is_admin_user()
        OR media.uploaded_by = public.current_profile_id()
        OR media.shared_by = public.current_profile_id()
        OR recipient.recipient_user_id IS NOT NULL
        OR (media.visibility = 'project' AND public.can_access_project(media.project_id))
      )
  )
$$;

ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_media_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_media_read ON public.project_media FOR SELECT TO authenticated
USING (public.can_access_project_media(id));
CREATE POLICY project_media_insert ON public.project_media FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = public.current_profile_id()
  AND shared_by = public.current_profile_id()
  AND public.can_access_project(project_id)
  AND public.can_access_tenant(tenant_id)
);
CREATE POLICY project_media_update ON public.project_media FOR UPDATE TO authenticated
USING (uploaded_by = public.current_profile_id() OR shared_by = public.current_profile_id() OR public.is_admin_user())
WITH CHECK (uploaded_by = public.current_profile_id() OR shared_by = public.current_profile_id() OR public.is_admin_user());

CREATE POLICY project_media_recipients_read ON public.project_media_recipients FOR SELECT TO authenticated
USING (public.can_access_project_media(media_id));
CREATE POLICY project_media_recipients_insert ON public.project_media_recipients FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_media media
    WHERE media.id = media_id
      AND (media.uploaded_by = public.current_profile_id() OR media.shared_by = public.current_profile_id() OR public.is_admin_user())
  )
);

REVOKE EXECUTE ON FUNCTION public.can_access_project_media(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_project_media(UUID) TO authenticated;
