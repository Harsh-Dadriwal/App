const fs = require('fs');
const file = 'db/full_project_rebuild.sql';
let content = fs.readFileSync(file, 'utf8');

// Replace any AS followed by one or more $ at the start of a line with AS $$
// Using a replacer function to avoid Javascript's special $$ replacement pattern!
content = content.replace(/^AS \$+/gm, () => 'AS $$');

// Replace any one or more $ followed by ; at the start of a line with $$;
content = content.replace(/^\$+[;]/gm, () => '$$;');

fs.writeFileSync(file, content);
console.log('Fixed syntax with replacer function.');
