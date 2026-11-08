import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, loadAll } from './src/config.js';
import { render, bodyContext, masterContext } from './src/template.js';
import { applyScene, initialStats, RULE_OPS } from './src/stats.js';
import { expressionOf, DEFAULT_EXPRESSION } from './src/expression.js';
import * as ai from './src/nanogpt.js';
import { renderLorebook } from './src/lorebook.js';
import {
  MIND_TAGS, normalizeTags, normalizeMind, mindText, innerMemoryText,
  parseMindJson, fallbackMind, demoMind, sceneMindScore,
} from './src/mind.js';

loadEnv();
let cfg = loadAll();
const MAX_ADVANCES = 10;
const SESSION_FILE = path.join(ROOT, 'state', 'session.json');
let session = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) : { characters: {} };
fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
const save = () => { fs.writeFileSync(SESSION_FILE + '.tmp', JSON.stringify(session, null, 2)); fs.renameSync(SESSION_FILE + '.tmp', SESSION_FILE); };

const concepts = () => [...new Set(cfg.scenes.map((s) => s.concept).filter(Boolean))].sort();
// "concept:<nombre>" elige una escena del concepto; si no, busca por id.
// La elección ya no es puramente aleatoria: pesa qué escena toca la mente actual
// (resonancia/fricción) y evita repetir la última escena.
function pickScene(ref, st = null) {
  if (String(ref).startsWith('concept:')) {
    const pool = cfg.scenes.filter((s) => s.concept === ref.slice(8));
    if (!pool.length) throw new Error('No hay escenas en el concepto: ' + ref.slice(8));
    if (pool.length === 1) return pool[0];
    const last = st?.history?.at(-1)?.scene?.id;
    return pool
      .map((s) => ({
        s,
        score: sceneMindScore(s, st?.mind, st?.stats) + (s.id === last ? -1.5 : 0) + Math.random() * 0.75,
      }))
      .sort((a, b) => b.score - a.score)[0].s;
  }
  return cfg.scenes.find((s) => s.id === ref);
}

const summary = () => ({
  demo: ai.demoMode(),
  characters: cfg.characters,
  scenes: cfg.scenes,
  bodyParts: cfg.bodyParts,
  masterParts: cfg.masterParts,
  master: cfg.master,
  expression: cfg.expression,
  moods: Object.fromEntries(cfg.characters.map((c) => [c.id, expressionOf(cfg.expression, session.characters[c.id]?.stats || initialStats(c, cfg.stats))])),
  minds: Object.fromEntries(cfg.characters.map((c) => [c.id, session.characters[c.id]?.mind || normalizeMind(c.mind) || null])),
  mindTags: MIND_TAGS,
  aspects: Object.keys(ai.ASPECTS),
  maxAdvances: MAX_ADVANCES,
  concepts: concepts(),
  rules: cfg.rules,
  ruleOps: RULE_OPS,
  environments: cfg.environments,
  traits: [...new Set([...cfg.environments.flatMap((e) => Object.keys(e.affinity || {})), ...cfg.characters.flatMap((c) => c.traits || [])])].sort(),
  prompts: cfg.prompts,
  lorebook: cfg.lorebook,
  lorebookSource: cfg.lorebookSource,
  lorebookEntries: cfg.lorebookEntries,
  statDefs: cfg.stats.stats,
  session,
});

function charState(id) {
  const c = cfg.characters.find((x) => x.id === id);
  if (!c) throw new Error('Personaje no encontrado: ' + id);
  session.characters[id] ??= { stats: initialStats(c, cfg.stats), history: [] };
  const st = session.characters[id];
  // La primera escena ya parte de la mente declarada en la ficha (tags y resistencias).
  if (!st.mind && c.mind) st.mind = normalizeMind(c.mind);
  return [c, st];
}

// Único punto donde se arma el prompt de imagen: step, vista previa y editor usan esta función,
// así la estructura es siempre la misma y solo cambian los datos del personaje y de la escena.
const aspectOf = (scene) => (ai.ASPECTS[scene?.aspect] ? scene.aspect : '1:1');
const envOf = (scene) => cfg.environments.find((e) => e.id === scene?.environment) || { name: '', description: '' };
const imagePromptFor = (c, scene, expression) => render(cfg.prompts.image, { character: c, scene, environment: envOf(scene), body: bodyContext(c), master: masterContext(cfg.master, scene), expression });

// Igual que imagePromptFor pero deja las etiquetas {{character.*}}, {{body.*}}, {{master.*}} y {{expression.*}} sin resolver (se ve el template).
const tagProxy = (prefix, all) => new Proxy({}, { has: () => true, get: (_, k) => (k === 'all' ? all : `{{${prefix}.${String(k)}}}`) });
const imageTemplateFor = (scene) => render(cfg.prompts.image, { character: tagProxy('character'), scene, environment: envOf(scene), body: tagProxy('body', '{{body}}'), master: tagProxy('master', '{{master}}'), expression: tagProxy('expression', '{{expression}}') });

const IMG_DIR = path.join(ROOT, 'state', 'images');
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

// Guarda la imagen en state/images/<personaje>/ y devuelve la ruta servida (/media/...).
async function saveImage(characterId, t, img) {
  let buf, ext = 'png';
  if (img.startsWith('data:')) {
    const m = img.match(/^data:([^;,]+)([^,]*),(.*)$/s);
    if (!m) throw new Error('Imagen en formato no reconocido');
    ext = EXT[m[1]] || 'png';
    buf = m[2].includes(';base64') ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  } else {
    const r = await fetch(img); // URL remota: descargarla para que no caduque
    if (!r.ok) return img;
    ext = EXT[r.headers.get('content-type')?.split(';')[0]] || 'png';
    buf = Buffer.from(await r.arrayBuffer());
  }
  const dir = path.join(IMG_DIR, characterId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${t}.${ext}`), buf);
  return `/media/${characterId}/${t}.${ext}`;
}
const wipeImages = (id) => fs.rmSync(path.join(IMG_DIR, path.basename(String(id))), { recursive: true, force: true });

// Avanza el reloj del personaje al siguiente bloque del horario que tenga concepto (con vuelta al día siguiente).
function nextBlock(c, st) {
  const sch = c.schedule || [];
  const from = Number.isInteger(st.block) ? st.block : -1;
  for (let i = 1; i <= sch.length; i++) {
    const idx = (from + i) % sch.length;
    if (sch[idx].concept && cfg.scenes.some((x) => x.concept === sch[idx].concept))
      return { idx, day: (st.day || 1) + (from + i >= sch.length && from >= 0 ? 1 : 0), block: sch[idx] };
  }
  throw new Error(`${c.name} no tiene bloques con concepto en su horario (✎ Editar personaje)`);
}

// Estadísticas actuales en JSON, con su rango: {"alegría": {"valor": 50, "min": 0, "max": 100}, ...}
function statsJson(stats) {
  const def = cfg.stats.stats || {};
  return JSON.stringify(Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, { valor: v, min: def[k]?.min ?? 0, max: def[k]?.max ?? 100 }])), null, 2);
}

// Últimas acciones (escenas vividas) en JSON, de la más antigua a la más reciente.
function recentActionsJson(history, n = 5) {
  const rows = history.slice(-n).map((h) => ({
    dia: h.time?.day, horario: h.time ? `${h.time.start}-${h.time.end}` : undefined,
    concepto: h.time?.concept, escena: h.scene?.name, cambios_en_estadisticas: h.changes,
  }));
  return rows.length ? JSON.stringify(rows, null, 2) : '[]';
}

// Etapa 2: deja solo líneas `nombre: texto` (texto normal = se dice; *texto* = pensamiento o gesto).
function cleanDialogue(raw) {
  const lines = String(raw).split('\n').map((l) => l.trim()).filter((l) => /^[^:*\n]{1,40}:\s*\S/.test(l));
  return lines.length ? lines.join('\n') : String(raw).trim();
}

// Un avance completo: elige bloque/escena y genera historia, diálogo, mente, imagen y estadísticas.
async function stepOne({ characterId }) {
  const [c, st] = charState(characterId);
  const { idx, day, block } = nextBlock(c, st);
  const scene = pickScene('concept:' + block.concept, st);

  const history = st.history.slice(-3).map((h) => h.story).join('\n---\n') || '(sin historia previa)';

  // Las estadísticas de la escena se calculan antes de generar: la expresión de la historia
  // es la del estado actual y la de la imagen, la del estado resultante. La mente actual
  // añade resonancia o fricción según las etiquetas de la escena.
  const result = applyScene(c, st.stats, scene, cfg.stats, cfg.rules, cfg.environments, st.mind);
  const expressionNow = expressionOf(cfg.expression, st.stats);
  const expressionAfter = expressionOf(cfg.expression, result.stats);

  const ctx = {
    character: { ...c, traits: c.traits, statsText: Object.entries(st.stats).map(([k, v]) => `${k}: ${v}`).join(', ') },
    scene, environment: envOf(scene),
    history,
    stats_json: statsJson(st.stats),
    recent_actions: recentActionsJson(st.history),
    current_mind: mindText(st.mind),
    inner_memory: innerMemoryText(st.history),
    body: bodyContext(c),
    master: masterContext(cfg.master, scene),
    expression: expressionNow,
  };
  // El lorebook se filtra por palabras clave según escena, personaje, historia y mente reciente.
  const loreText = [c.name, c.personality, (c.traits || []).join(' '), scene.name, scene.location, scene.description, history, mindText(st.mind)].join('\n');
  ctx.lorebook = renderLorebook(cfg, loreText);

  // La imagen no depende del texto: se genera en paralelo con la historia y el diálogo.
  const imagePrompt = imagePromptFor(c, scene, expressionAfter);
  const imagePromise = ai.image(imagePrompt, aspectOf(scene)).catch((e) => ({ error: e.message }));

  const story = await ai.chat(render(cfg.prompts.prompt_1, ctx));
  const dialogue = cleanDialogue(await ai.chat(render(cfg.prompts.prompt_2, { ...ctx, story, lorebook: renderLorebook(cfg, loreText + '\n' + story) })));

  // Etapa 3: la mente se actualiza después de la escena y viaja al siguiente prompt.
  const mindPromise = ai.demoMode()
    ? Promise.resolve(demoMind(c, st.mind))
    : ai.chat(render(cfg.prompts.prompt_mind, {
      ...ctx, story, dialogue,
      stats_json: statsJson(result.stats), expression: expressionAfter,
      lorebook: renderLorebook(cfg, loreText + '\n' + story + '\n' + dialogue),
    }))
      .then((raw) => parseMindJson(raw, st.mind) || fallbackMind(dialogue, st.mind))
      .catch(() => fallbackMind(dialogue, st.mind));

  const imageUrl = await imagePromise;
  const mind = await mindPromise;

  st.stats = result.stats; st.mind = mind; st.block = idx; st.day = day;
  const t = Date.now();
  let saved = null, imageError = imageUrl.error;
  if (typeof imageUrl === 'string') saved = await saveImage(characterId, t, imageUrl).catch((e) => { imageError = e.message; return null; });
  const entry = {
    t, aspect: aspectOf(scene), scene: { id: scene.id, name: scene.name }, time: { day, start: block.start, end: block.end, concept: block.concept }, story, dialogue, imagePrompt,
    image: saved, imageError, changes: result.changes, affinity: result.affinity, rules: result.rules, expression: expressionAfter,
    mind, mindEffect: result.mind,
  };
  st.history.push({ ...entry, stats: st.stats });
  save();
  return { ...entry, stats: st.stats, block: idx, day };
}

// Varios avances seguidos. Cada uno se completa antes de empezar el siguiente
// porque la historia, el bloque horario y las estadísticas dependen del anterior.
async function step({ characterId, count = 1 }) {
  const n = Math.min(Math.max(Math.trunc(Number(count)) || 1, 1), MAX_ADVANCES);
  const entries = [];
  for (let i = 0; i < n; i++) entries.push(await stepOne({ characterId }));
  return { entries };
}

const slug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Mente declarada del personaje: lo que la ficha dice de su voz interior y sus etiquetas.
// El estado mental vivo (lo que cambia escena a escena) vive en state/session.json.
const cleanText = (v, n = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const characterMind = (m) => ({
  voice: cleanText(m?.voice),
  contradiction: cleanText(m?.contradiction),
  secret: cleanText(m?.secret),
  taboo: cleanText(m?.taboo),
  arc: cleanText(m?.arc),
  tags: normalizeTags(m?.tags),
  resist: normalizeTags(m?.resist),
});

// Prueba una escena (aunque no esté guardada) con un personaje al azar: no toca stats ni historial.
async function preview({ scene, characterId }) {
  const c = cfg.characters.find((x) => x.id === characterId) || cfg.characters[Math.floor(Math.random() * cfg.characters.length)];
  if (!c) throw new Error('No hay personajes');
  const mindState = session.characters[c.id]?.mind || c.mind || null;
  const r = applyScene(c, initialStats(c, cfg.stats), scene, cfg.stats, cfg.rules, cfg.environments, mindState);
  const expression = expressionOf(cfg.expression, r.stats);
  const imagePrompt = imagePromptFor(c, scene, expression);
  const img = await ai.image(imagePrompt, aspectOf(scene)).catch((e) => ({ error: e.message }));
  return { character: { id: c.id, name: c.name }, imagePrompt, image: typeof img === 'string' ? img : null, imageError: img.error, changes: r.changes, affinity: r.affinity, mind: r.mind, aspect: aspectOf(scene), expression };
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const body = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => ok(d ? JSON.parse(d) : {})); });
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/state') return json(res, 200, summary());
    if (url.pathname === '/api/reload' && req.method === 'POST') { cfg = loadAll(); loadEnv(); return json(res, 200, summary()); }
    if (url.pathname === '/api/step' && req.method === 'POST') return json(res, 200, await step(await body(req)));
    if (url.pathname === '/api/character' && req.method === 'POST') {
      const { id, data } = await body(req);
      const safe = slug(id || data?.name);
      if (!safe || !data?.name) throw new Error('El personaje necesita un nombre');
      const { id: _omit, style: _style, ...clean } = data;
      const hhmm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
      clean.schedule = (Array.isArray(data.schedule) ? data.schedule : []).slice(0, 5).map((b) => ({
        start: hhmm(b?.start, '00:00'), end: hhmm(b?.end, '00:00'),
        concept: concepts().includes(b?.concept) ? b.concept : '',
      }));
      clean.body = Object.fromEntries(Object.keys(cfg.bodyParts).map((k) => [k, String(data.body?.[k] ?? '')]));
      clean.mind = characterMind(data.mind);
      fs.writeFileSync(path.join(ROOT, 'data', 'characters', safe + '.json'), JSON.stringify(clean, null, 2) + '\n');
      cfg = loadAll();
      return json(res, 200, { ...summary(), savedId: safe });
    }
    if (url.pathname === '/api/character/delete' && req.method === 'POST') {
      const { id } = await body(req);
      const f = path.join(ROOT, 'data', 'characters', path.basename(String(id)) + '.json');
      if (!fs.existsSync(f)) throw new Error('Personaje no encontrado');
      if (cfg.characters.length <= 1) throw new Error('Debe quedar al menos un personaje');
      fs.unlinkSync(f); delete session.characters[id]; wipeImages(id); save(); cfg = loadAll();
      return json(res, 200, summary());
    }
    if (url.pathname === '/api/scene' && req.method === 'POST') {
      const { id, data } = await body(req);
      const safe = slug(id || data?.name);
      if (!safe || !data?.name) throw new Error('La escena necesita un nombre');
      const clean = {
        name: String(data.name), concept: String(data.concept || '').trim(), environment: cfg.environments.some((e) => e.id === data.environment) ? data.environment : '',
        aspect: aspectOf(data),
        master: [...new Set((Array.isArray(data.master) ? data.master : []).filter((k) => cfg.masterParts[k]))],
        location: String(data.location || ''), description: String(data.description || ''),
        mindTags: normalizeTags(data.mindTags),
        effects: Object.fromEntries(Object.keys(cfg.stats.stats).map((k) => [k, num(data.effects?.[k])])),
      };
      fs.writeFileSync(path.join(ROOT, 'data', 'scenes', safe + '.json'), JSON.stringify(clean, null, 2) + '\n');
      cfg = loadAll();
      return json(res, 200, { ...summary(), savedId: safe });
    }
    if (url.pathname === '/api/scene/delete' && req.method === 'POST') {
      const { id } = await body(req);
      const f = path.join(ROOT, 'data', 'scenes', path.basename(String(id)) + '.json');
      if (!fs.existsSync(f)) throw new Error('Escena no encontrada');
      if (cfg.scenes.length <= 1) throw new Error('Debe quedar al menos una escena');
      fs.unlinkSync(f); cfg = loadAll();
      return json(res, 200, summary());
    }
    if (url.pathname === '/api/scene/prompt' && req.method === 'POST') {
      const { scene, characterId, withCharacter } = await body(req);
      if (!withCharacter) return json(res, 200, { imagePrompt: imageTemplateFor(scene || {}) });
      const c = cfg.characters.find((x) => x.id === characterId) || cfg.characters[0];
      if (!c) throw new Error('No hay personajes');
      const [, st] = charState(c.id);
      return json(res, 200, { character: c.name, imagePrompt: imagePromptFor(c, scene, expressionOf(cfg.expression, st.stats)) });
    }
    if (url.pathname === '/api/rules' && req.method === 'POST') {
      const { rules } = await body(req);
      const st = cfg.stats.stats, field = (f) => (f === 'delta' ? 'delta' : 'value');
      const clean = (Array.isArray(rules) ? rules : []).slice(0, 50).map((r) => ({
        name: String(r.name || 'Regla').slice(0, 80), enabled: r.enabled !== false,
        when: (r.when || []).filter((c) => st[c.stat] && RULE_OPS.includes(c.op)).map((c) => ({ stat: c.stat, field: field(c.field), op: c.op, value: num(c.value) })),
        then: (r.then || []).filter((e) => st[e.stat]).map((e) => ({
          stat: e.stat, mode: e.mode === 'set' ? 'set' : 'add', amount: num(e.amount),
          ...(st[e.per?.stat] ? { per: { stat: e.per.stat, field: field(e.per.field) } } : {}),
        })),
      }));
      fs.writeFileSync(path.join(ROOT, 'data', 'rules.json'), JSON.stringify({ rules: clean }, null, 2) + '\n');
      cfg = loadAll();
      return json(res, 200, summary());
    }
    if (url.pathname === '/api/environment' && req.method === 'POST') {
      const { id, data } = await body(req);
      const safe = slug(id || data?.name);
      if (!safe || !data?.name) throw new Error('El entorno necesita un nombre');
      const clean = {
        name: String(data.name).trim(), description: String(data.description || '').trim(),
        affinity: Object.fromEntries(Object.entries(data.affinity || {}).map(([t, v]) => [String(t).trim(), num(v)]).filter(([t, v]) => t && v !== 0)),
      };
      fs.mkdirSync(path.join(ROOT, 'data', 'environments'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'data', 'environments', safe + '.json'), JSON.stringify(clean, null, 2) + '\n');
      cfg = loadAll();
      return json(res, 200, { ...summary(), savedId: safe });
    }
    if (url.pathname === '/api/environment/delete' && req.method === 'POST') {
      const { id } = await body(req);
      const f = path.join(ROOT, 'data', 'environments', path.basename(String(id)) + '.json');
      if (!fs.existsSync(f)) throw new Error('Entorno no encontrado');
      const used = cfg.scenes.filter((x) => x.environment === id).map((x) => x.name);
      if (used.length) throw new Error('Lo usan estas escenas: ' + used.join(', '));
      fs.unlinkSync(f); cfg = loadAll();
      return json(res, 200, summary());
    }
    if (url.pathname === '/api/master' && req.method === 'POST') {
      const { data } = await body(req);
      const name = String(data?.name || '').trim();
      if (!name) throw new Error('El master necesita un nombre');
      const clean = {
        name,
        body: Object.fromEntries(Object.keys(cfg.masterParts).map((k) => [k, String(data.body?.[k] ?? '').trim()])),
      };
      fs.writeFileSync(path.join(ROOT, 'data', 'master.json'), JSON.stringify(clean, null, 2) + '\n');
      cfg = loadAll();
      return json(res, 200, summary());
    }
    if (url.pathname === '/api/expression' && req.method === 'POST') {
      const { data } = await body(req);
      const levels = (Array.isArray(data?.levels) ? data.levels : []).map((l, i) => ({
        id: slug(l.id || l.label) || `nivel_${i + 1}`,
        label: String(l.label || l.id || `Nivel ${i + 1}`).trim().slice(0, 40),
        from: num(l.from),
        face: String(l.face || '').trim(),
        story: String(l.story || '').trim(),
        inner: String(l.inner || '').trim(),
      })).sort((a, b) => a.from - b.from);
      if (!levels.length) throw new Error('Debe haber al menos un nivel de expresión');
      const formula = String(data?.formula || '').trim() || DEFAULT_EXPRESSION.formula;
      const clean = { formula, levels };
      fs.writeFileSync(path.join(ROOT, 'data', 'expression.json'), JSON.stringify(clean, null, 2) + '\n');
      cfg = loadAll();
      return json(res, 200, summary());
    }
    if (url.pathname === '/api/preview' && req.method === 'POST') return json(res, 200, await preview(await body(req)));
    if (url.pathname === '/api/prompts' && req.method === 'POST') {
      const b = await body(req);
      const files = {
        prompt_1: 'prompts/prompt_1.txt',
        prompt_2: 'prompts/prompt_2.txt',
        prompt_mind: 'prompts/prompt_mind.txt',
        image: 'prompts/prompt_image.txt',
        lorebook: 'lorebook.md',
      };
      for (const [k, f] of Object.entries(files)) {
        if (typeof b[k] !== 'string') continue;
        if (!b[k].trim()) throw new Error(`El texto de "${k}" no puede estar vacío`);
        fs.writeFileSync(path.join(ROOT, 'data', f), b[k].replace(/\s+$/, '') + '\n');
      }
      cfg = loadAll();
      return json(res, 200, summary());
    }
    if (url.pathname === '/api/reset' && req.method === 'POST') {
      const { characterId } = await body(req); delete session.characters[characterId]; wipeImages(characterId); save(); return json(res, 200, summary());
    }
    if (url.pathname.startsWith('/media/')) {
      const [, , cid, name] = url.pathname.split('/');
      const f = path.join(IMG_DIR, path.basename(cid || ''), path.basename(name || ''));
      if (!name || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': Object.entries(EXT).find(([, e]) => f.endsWith('.' + e))?.[0] || 'image/png' });
      return fs.createReadStream(f).pipe(res);
    }
    const file = path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { json(res, 500, { error: e.message }); }
}).listen(process.env.PORT || 3000, () => console.log(`Arco en http://localhost:${process.env.PORT || 3000}${ai.demoMode() ? ' (modo DEMO: falta NANOGPT_API_KEY)' : ''}`));
