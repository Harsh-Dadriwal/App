const fs = require('fs');
const file = 'db/full_project_rebuild.sql';
let content = fs.readFileSync(file, 'utf8');

// Fix AS followed by any number of $ (1 or more) to exactly AS $$
content = content.replace(/^AS \$+$/gm, 'AS $$');

// Also fix any `$$$;` or `$;` to exactly `$$;`
content = content.replace(/^\$+[;]$/gm, '$$;');

fs.writeFileSync(file, content);
console.log('Fixed syntax perfectly this time.');
