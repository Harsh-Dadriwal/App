const fs = require('fs');
const file = 'db/full_project_rebuild.sql';
let content = fs.readFileSync(file, 'utf8');

// Fix the single $ issue
content = content.replace(/\$ LANGUAGE plpgsql SET search_path = '';/g, '$$$$ LANGUAGE plpgsql SET search_path = \'\';');
content = content.replace(/\$ LANGUAGE sql SET search_path = '';/g, '$$$$ LANGUAGE sql SET search_path = \'\';');
content = content.replace(/\$ LANGUAGE PLPGSQL SET search_path = '';/g, '$$$$ LANGUAGE plpgsql SET search_path = \'\';');

// Let's also make sure normalize_username and handle_wallet_ledger_entry have the search path set.
// normalize_username:
content = content.replace(/CREATE OR REPLACE FUNCTION public\.normalize_username\(raw_value text\)\nRETURNS text\nLANGUAGE sql\nIMMUTABLE\nAS \$\$/g, 'CREATE OR REPLACE FUNCTION public.normalize_username(raw_value text)\nRETURNS text\nLANGUAGE sql\nIMMUTABLE\nSET search_path = \'\'\nAS $$');

// handle_wallet_ledger_entry:
content = content.replace(/CREATE OR REPLACE FUNCTION public\.handle_wallet_ledger_entry\(\)\nRETURNS trigger\nLANGUAGE plpgsql\nAS \$\$/g, 'CREATE OR REPLACE FUNCTION public.handle_wallet_ledger_entry()\nRETURNS trigger\nLANGUAGE plpgsql\nSET search_path = \'\'\nAS $$');

fs.writeFileSync(file, content);
console.log('Fixed syntax and search paths.');
