const fs = require('fs');
const file = 'db/full_project_rebuild.sql';
let content = fs.readFileSync(file, 'utf8');

// Replace exactly AS $ followed by newline with AS $$
content = content.replace(/^AS \$/gm, 'AS $$$$');

fs.writeFileSync(file, content);
console.log('Fixed AS $ syntax.');
