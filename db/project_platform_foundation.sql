-- Additive construction-platform foundation.
-- This migration deliberately leaves the existing procurement/site schema unchanged.

CREATE TABLE IF NOT EXISTS public.platform_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL CHECK (role_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  display_name TEXT NOT NULL,
  description TEXT,
  permission_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legacy_site_id UUID UNIQUE REFERENCES public.sites(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  project_code TEXT NOT NULL,
  name TEXT NOT NULL,
  project_type TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  start_date DATE,
  target_end_date DATE,
  completed_at TIMESTAMPTZ,
  estimated_budget NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (estimated_budget >= 0),
  actual_spend NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (actual_spend >= 0),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, project_code)
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  permission_overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'removed')),
  joined_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.project_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_room_id UUID REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  room_type TEXT,
  floor_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, parent_room_id, name)
);

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'waiting_material', 'waiting_approval', 'completed', 'rejected')),
  start_date DATE,
  deadline DATE,
  estimated_hours NUMERIC(10, 2) CHECK (estimated_hours >= 0),
  actual_hours NUMERIC(10, 2) CHECK (actual_hours >= 0),
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_task_assignees (
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant_status ON public.projects (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_project_members_user_status ON public.project_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_project_rooms_project ON public.project_rooms (project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status ON public.project_tasks (project_id, status, deadline);

CREATE OR REPLACE FUNCTION public.can_access_project(target_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    LEFT JOIN public.project_members pm
      ON pm.project_id = p.id
      AND pm.user_id = public.current_profile_id()
      AND pm.status = 'active'
    WHERE p.id = target_project_id
      AND (
        public.is_admin_user()
        OR p.customer_id = public.current_profile_id()
        OR p.created_by = public.current_profile_id()
        OR pm.user_id IS NOT NULL
      )
  )
$$;

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_roles_read ON public.platform_roles FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));
CREATE POLICY platform_roles_admin_write ON public.platform_roles FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

CREATE POLICY projects_read ON public.projects FOR SELECT TO authenticated
USING (public.can_access_project(id));
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND (public.is_admin_user() OR created_by = public.current_profile_id() OR customer_id = public.current_profile_id())
);
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated
USING (public.can_access_project(id))
WITH CHECK (public.can_access_project(id));

CREATE POLICY project_members_read ON public.project_members FOR SELECT TO authenticated
USING (public.can_access_project(project_id));
CREATE POLICY project_members_write ON public.project_members FOR ALL TO authenticated
USING (public.can_access_project(project_id))
WITH CHECK (public.can_access_project(project_id));

CREATE POLICY project_rooms_access ON public.project_rooms FOR ALL TO authenticated
USING (public.can_access_project(project_id))
WITH CHECK (public.can_access_project(project_id));

CREATE POLICY project_tasks_access ON public.project_tasks FOR ALL TO authenticated
USING (public.can_access_project(project_id))
WITH CHECK (public.can_access_project(project_id));

CREATE POLICY project_task_assignees_access ON public.project_task_assignees FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_tasks pt WHERE pt.id = task_id AND public.can_access_project(pt.project_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.project_tasks pt WHERE pt.id = task_id AND public.can_access_project(pt.project_id)));

REVOKE EXECUTE ON FUNCTION public.can_access_project(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_project(UUID) TO authenticated;

-- Seed the construction roles for every tenant. Administrators may add custom roles without code changes.
INSERT INTO public.platform_roles (tenant_id, role_key, display_name, is_system)
SELECT t.id, role.role_key, role.display_name, TRUE
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('customer', 'Customer'), ('architect', 'Architect'), ('interior_designer', 'Interior Designer'),
    ('civil_engineer', 'Civil Engineer'), ('structural_engineer', 'Structural Engineer'),
    ('mep_consultant', 'MEP Consultant'), ('builder', 'Builder'), ('developer', 'Developer'),
    ('project_manager', 'Project Manager'), ('site_supervisor', 'Site Supervisor'),
    ('contractor', 'Contractor'), ('electrician', 'Electrician'), ('plumber', 'Plumber'),
    ('carpenter', 'Carpenter'), ('painter', 'Painter'), ('fabricator', 'Fabricator'), ('welder', 'Welder'),
    ('hvac_technician', 'HVAC Technician'), ('solar_installer', 'Solar Installer'),
    ('cctv_installer', 'CCTV Installer'), ('false_ceiling_worker', 'False Ceiling Worker'),
    ('tile_installer', 'Tile Installer'), ('mason', 'Mason'), ('pop_worker', 'POP Worker'),
    ('glass_installer', 'Glass Installer'), ('aluminium_worker', 'Aluminium Worker'),
    ('landscaper', 'Landscaper'), ('supplier', 'Supplier'), ('dealer', 'Dealer'),
    ('manufacturer', 'Manufacturer'), ('labour', 'Labour'), ('admin', 'Admin')
) AS role(role_key, display_name)
ON CONFLICT (tenant_id, role_key) DO NOTHING;
