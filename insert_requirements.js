const fs = require('fs');
const reqFile = fs.readFileSync('db/requirement_ingestion_foundation.sql', 'utf8');
const reqLines = reqFile.split('\n');
const toInsert = reqLines.slice(2, -3).join('\n'); // omit BEGIN; and COMMIT;

const mainFile = fs.readFileSync('db/full_project_rebuild.sql', 'utf8');
const insertionPointStr = 'CREATE TRIGGER trg_users_updated_at';
const insertionPoint = mainFile.indexOf(insertionPointStr);
if (insertionPoint === -1) {
    console.error('Insertion point not found');
    process.exit(1);
}

const newFile = mainFile.substring(0, insertionPoint) + '\n-- Requirements Ingestion Foundation Tables\n' + toInsert + '\n\n' + mainFile.substring(insertionPoint);

fs.writeFileSync('db/full_project_rebuild.sql', newFile);
console.log('Inserted requirements tables successfully');
