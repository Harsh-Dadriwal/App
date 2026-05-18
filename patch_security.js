const fs = require('fs');
const file = 'db/full_project_rebuild.sql';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix Views (Security Definer)
// Find `CREATE OR REPLACE VIEW public.vw_xyz AS`
// Replace with `CREATE OR REPLACE VIEW public.vw_xyz WITH (security_invoker = true) AS`
// Careful not to replace if it already has WITH
content = content.replace(/CREATE OR REPLACE VIEW (public\.[a-zA-Z0-9_]+) AS/gm, 'CREATE OR REPLACE VIEW $1 WITH (security_invoker = true) AS');

// 2. Fix Functions (Mutable Search Path)
// Find `$$ LANGUAGE plpgsql;`
// Replace with `$$ LANGUAGE plpgsql SET search_path = '';`
// Need to be careful because some might have SET search_path already.
// I will replace all instances of `$$ LANGUAGE plpgsql;` (which is standard in the file)
content = content.replace(/\$\$\s+LANGUAGE\s+plpgsql\s*;/gm, '$$ LANGUAGE plpgsql SET search_path = \'\';');

// Also check for `$$ LANGUAGE sql;` just in case
content = content.replace(/\$\$\s+LANGUAGE\s+sql\s*;/gm, '$$ LANGUAGE sql SET search_path = \'\';');

// Also handle the case where it's uppercase `LANGUAGE PLPGSQL`
content = content.replace(/\$\$\s+LANGUAGE\s+PLPGSQL\s*;/gim, '$$ LANGUAGE plpgsql SET search_path = \'\';');

fs.writeFileSync(file, content);
console.log('Security patches applied successfully.');
