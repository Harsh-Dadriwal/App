BEGIN;

-- Remove duplicate tenant memberships so the unique index can be created safely.
DELETE FROM public.tenant_memberships a
USING public.tenant_memberships b
WHERE a.ctid < b.ctid
  AND a.tenant_id = b.tenant_id
  AND a.user_id = b.user_id;

-- The signup trigger uses ON CONFLICT (auth_user_id), so auth_user_id must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_unique_idx
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- The signup trigger also uses ON CONFLICT (tenant_id, user_id) on tenant memberships.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_tenant_user_unique_idx
  ON public.tenant_memberships (tenant_id, user_id);

COMMIT;
