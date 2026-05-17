const fs = require('fs');
const file = 'db/full_project_rebuild.sql';
let content = fs.readFileSync(file, 'utf8');

// Replace CREATE TYPE public.X AS ENUM with DROP TYPE IF EXISTS public.X CASCADE;\nCREATE TYPE public.X AS ENUM
content = content.replace(/^CREATE TYPE (public\.[a-zA-Z0-9_]+)\s+AS ENUM/gm, 'DROP TYPE IF EXISTS $1 CASCADE;\nCREATE TYPE $1 AS ENUM');

// Replace CREATE TABLE public.X ( with DROP TABLE IF EXISTS public.X CASCADE;\nCREATE TABLE public.X (
content = content.replace(/^CREATE TABLE (public\.[a-zA-Z0-9_]+)\s*\(/gm, 'DROP TABLE IF EXISTS $1 CASCADE;\nCREATE TABLE $1 (');

// Also sequence if any
content = content.replace(/^CREATE SEQUENCE IF NOT EXISTS (public\.[a-zA-Z0-9_]+)/gm, 'DROP SEQUENCE IF EXISTS $1 CASCADE;\nCREATE SEQUENCE IF NOT EXISTS $1');

fs.writeFileSync(file, content);
console.log('Idempotent drops added successfully.');
