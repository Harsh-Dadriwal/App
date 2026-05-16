-- UX Polish: Automated Site Code Generation
-- This patch creates a sequence and a trigger to auto-assign site_code

CREATE SEQUENCE IF NOT EXISTS public.site_code_seq START 1000;

CREATE OR REPLACE FUNCTION public.set_default_site_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.site_code IS NULL OR NEW.site_code = '' THEN
    NEW.site_code := 'SIT-' || nextval('public.site_code_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_default_site_code ON public.sites;

CREATE TRIGGER trigger_set_default_site_code
BEFORE INSERT ON public.sites
FOR EACH ROW
EXECUTE FUNCTION public.set_default_site_code();

COMMIT;
