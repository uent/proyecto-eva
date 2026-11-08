import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EXPRESSION } from './expression.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');

// Carga .env sin dependencias
export function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const readText = (p) => fs.readFileSync(p, 'utf8');
const readJsonDir = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
        .map((f) => ({ id: f.replace(/\.json$/, ''), ...JSON.parse(readText(path.join(dir, f))) }))
    : [];

// Lee TODO desde disco cada vez: es lo que usa el botón "Recargar".
export function loadAll() {
  const p = (n) => readText(path.join(DATA, 'prompts', n));
  const bookPath = path.join(DATA, 'lorebook.json');
  const mdPath = path.join(DATA, 'lorebook.md');
  const lorebookBook = fs.existsSync(bookPath) ? JSON.parse(readText(bookPath)) : null;
  return {
    lorebook: fs.existsSync(mdPath) ? readText(mdPath) : '',
    // Opcional: data/lorebook.json (formato World Info) tiene prioridad sobre lorebook.md y se filtra por palabras clave.
    lorebookBook,
    lorebookSource: lorebookBook ? 'json' : (fs.existsSync(mdPath) ? 'md' : 'none'),
    lorebookEntries: lorebookBook ? Object.keys(lorebookBook.entries || {}).length : 0,
    prompts: {
      prompt_1: p('prompt_1.txt'),
      prompt_2: p('prompt_2.txt'),
      prompt_mind: p('prompt_mind.txt'),
      image: p('prompt_image.txt'),
    },
    stats: JSON.parse(readText(path.join(DATA, 'stats.json'))),
    expression: fs.existsSync(path.join(DATA, 'expression.json'))
      ? { ...DEFAULT_EXPRESSION, ...JSON.parse(readText(path.join(DATA, 'expression.json'))) }
      : DEFAULT_EXPRESSION,
    rules: fs.existsSync(path.join(DATA, 'rules.json')) ? JSON.parse(readText(path.join(DATA, 'rules.json'))).rules || [] : [],
    bodyParts: JSON.parse(readText(path.join(DATA, 'body_parts.json'))),
    masterParts: fs.existsSync(path.join(DATA, 'master_parts.json'))
      ? JSON.parse(readText(path.join(DATA, 'master_parts.json')))
      : { general: 'Diseño general', head: 'Cabeza y rostro', chest: 'Torso y brazos', hands: 'Manos', hips: 'Cadera', legs: 'Piernas' },
    master: fs.existsSync(path.join(DATA, 'master.json'))
      ? JSON.parse(readText(path.join(DATA, 'master.json')))
      : { name: 'Master', body: {} },
    framings: JSON.parse(readText(path.join(DATA, 'framings.json'))),
    characters: readJsonDir(path.join(DATA, 'characters')),
    environments: readJsonDir(path.join(DATA, 'environments')),
    scenes: readJsonDir(path.join(DATA, 'scenes')),
  };
}
