import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'frontend', 'dist');
const out = path.join(root, 'public');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(dist, out, { recursive: true });
console.log('Copied frontend/dist -> public');