BEGIN;

-- Clean duplicate linked auth users if they somehow exist before adding the constraint.
DELETE FROM public.users a
USING public.users b
WHERE a.ctid < b.ctid
  AND a.auth_user_id IS NOT NULL
  AND a.auth_user_id = b.auth_user_id;

-- Drop the partial index variant if it was created earlier.
DROP INDEX IF EXISTS public.users_auth_user_id_unique_idx;

-- auth.users signup trigger uses ON CONFLICT (auth_user_id), which needs a plain unique constraint.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_auth_user_id_key;

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);

-- tenant_memberships trigger path uses ON CONFLICT (tenant_id, user_id)
DELETE FROM public.tenant_memberships a
USING public.tenant_memberships b
WHERE a.ctid < b.ctid
  AND a.tenant_id = b.tenant_id
  AND a.user_id = b.user_id;

DROP INDEX IF EXISTS public.tenant_memberships_tenant_user_unique_idx;

ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_tenant_id_user_id_key;

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_tenant_id_user_id_key UNIQUE (tenant_id, user_id);

COMMIT;
