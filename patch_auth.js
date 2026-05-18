const fs = require('fs');
const rebuildFile = 'db/full_project_rebuild.sql';
const repairFile = 'db/auth_trigger_username_roles_repair.sql';

let rebuildContent = fs.readFileSync(rebuildFile, 'utf8');
const repairContent = fs.readFileSync(repairFile, 'utf8');

// Extract from repair
const normalizeUsernameSrc = repairContent.match(/CREATE OR REPLACE FUNCTION public\.normalize_username[\s\S]*?\$\$;/)[0];
const normalizePhoneSrc = repairContent.match(/CREATE OR REPLACE FUNCTION public\.normalize_phone[\s\S]*?\$\$;/)[0];
const makeUniqueUsernameSrc = repairContent.match(/CREATE OR REPLACE FUNCTION public\.make_unique_username[\s\S]*?\$\$;/)[0];
const enforceUniquenessSrc = repairContent.match(/CREATE OR REPLACE FUNCTION public\.enforce_public_user_identity_uniqueness[\s\S]*?\$\$;/)[0];
const enforceUniquenessTrg = repairContent.match(/DROP TRIGGER IF EXISTS trg_users_identity_uniqueness[\s\S]*?EXECUTE FUNCTION public\.enforce_public_user_identity_uniqueness\(\);/)[0];
const handleNewAuthUserSrc = repairContent.match(/CREATE OR REPLACE FUNCTION public\.handle_new_auth_user[\s\S]*?\$\$;/)[0];
const handleNewAuthUserTrg = repairContent.match(/DROP TRIGGER IF EXISTS on_auth_user_created[\s\S]*?EXECUTE FUNCTION public\.handle_new_auth_user\(\);/)[0];

// Replace in rebuild
rebuildContent = rebuildContent.replace(/CREATE OR REPLACE FUNCTION public\.normalize_username[\s\S]*?\$\$;/, normalizeUsernameSrc);
rebuildContent = rebuildContent.replace(/CREATE OR REPLACE FUNCTION public\.make_unique_username[\s\S]*?\$\$;/, normalizePhoneSrc + '\n\n' + makeUniqueUsernameSrc + '\n\n' + enforceUniquenessSrc + '\n\n' + enforceUniquenessTrg);
rebuildContent = rebuildContent.replace(/CREATE OR REPLACE FUNCTION public\.handle_new_auth_user[\s\S]*?\$\$;/, handleNewAuthUserSrc);
rebuildContent = rebuildContent.replace(/CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth\.users FOR EACH ROW EXECUTE FUNCTION public\.handle_new_auth_user\(\);/, handleNewAuthUserTrg);

fs.writeFileSync(rebuildFile, rebuildContent);
console.log('Successfully patched rebuild script with repaired auth triggers.');
