const fs = require('fs');
const file = 'db/full_project_rebuild.sql';
let content = fs.readFileSync(file, 'utf8');

// Replace ^\$; with $$;
content = content.replace(/^\$;/gm, '$$$$;');

fs.writeFileSync(file, content);
console.log('Fixed syntax again.');
