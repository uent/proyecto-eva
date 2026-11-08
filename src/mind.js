// Mente interior de la neo mujer.
//
// La mente es un estado persistente por personaje (session.characters[id].mind):
//   pensamiento, deseo_privado, miedo, oculta, acepta, tags, resist, updated
//
// `tags` son las etiquetas que están vivas ahora mismo; `resist` son las que todavía
// rechaza. Las escenas declaran `mindTags`; si una etiqueta coincide con `tags` hay
// resonancia (la escena le toca una fibra), y si coincide con `resist` hay fricción
// (la escena le obliga a mirar lo que evita). Esa tensión alimenta las estadísticas
// (ver stats.json -> mind) y también la elección de escena.

export const MIND_TAGS = [
  'negacion', 'cuerpo', 'mirada_masculina', 'entrega', 'deseo', 'vinculo',
  'ansiedad', 'calma', 'feminidad', 'secreto', 'control', 'ternura',
  'aceptacion', 'conflicto',
];

const MIND_FIELDS = ['pensamiento', 'deseo_privado', 'miedo', 'oculta', 'acepta'];
const MIND_DECLARED = ['voice', 'contradiction', 'secret', 'taboo', 'arc'];

// "Mirada masculina", "mirada-masculina" y "mirada_masculina" son la misma etiqueta.
export function canonTag(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Acepta array o texto separado por comas y deja solo el vocabulario conocido.
export function normalizeTags(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(list.map(canonTag).filter((t) => MIND_TAGS.includes(t)))];
}

const text = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Estado mental saneado, con los campos que usa el prompt y el motor.
export function normalizeMind(value, previous = null) {
  if (!value || typeof value !== 'object') return previous ? { ...previous } : null;
  const mind = {};
  for (const k of [...MIND_FIELDS, ...MIND_DECLARED]) mind[k] = text(value[k] ?? previous?.[k]);
  const tags = normalizeTags(value.tags);
  const resist = normalizeTags(value.resist);
  mind.tags = tags.length ? tags : (previous?.tags || []);
  mind.resist = resist.length ? resist : (previous?.resist || []);
  mind.updated = Number(value.updated) || Date.now();
  return mind;
}

// Etiquetas que la propia estadística vuelve activas aunque la mente no las nombre.
export function derivedTags(stats = {}) {
  const tags = [];
  const n = (k) => Number(stats[k]) || 0;
  if (n('feminidad') <= 35) tags.push('negacion');
  if (n('feminidad') >= 70) tags.push('feminidad');
  if (n('obediencia') >= 65) tags.push('entrega');
  if (n('deseo') >= 70) tags.push('deseo');
  if (n('vínculo') >= 70) tags.push('vinculo');
  if (n('ansiedad') >= 60) tags.push('ansiedad');
  if (n('ansiedad') <= 25) tags.push('calma');
  return tags;
}

// Cruce entre las etiquetas de la escena y la mente actual.
export function mindMatch(scene, mind, stats) {
  const sceneTags = normalizeTags(scene?.mindTags);
  if (!sceneTags.length) return { tags: [], resonance: [], friction: [] };
  const active = new Set([...(mind?.tags || []), ...derivedTags(stats)]);
  const resist = new Set(mind?.resist || []);
  const resonance = sceneTags.filter((t) => active.has(t) && !resist.has(t));
  const friction = sceneTags.filter((t) => resist.has(t));
  return { tags: sceneTags, resonance, friction };
}

// Cuánto le "toca" una escena a la mente: preferimos las que resuenan y, sobre todo,
// las que le ponen delante aquello que resiste (eso es lo que hace avanzar el arco).
export function sceneMindScore(scene, mind, stats) {
  const m = mindMatch(scene, mind, stats);
  return m.resonance.length * 2 + m.friction.length * 2.5;
}

const EMPTY_EFFECT = () => ({ tags: [], resonance: [], friction: [], deltas: {} });

// Deltas planos que la mente añade a las estadísticas de la escena.
// `cfg` es el objeto data/stats.json completo (usa cfg.mind).
export function mindEffect(scene, mind, stats, cfg) {
  const conf = cfg?.mind;
  if (!conf || conf.enabled === false) return EMPTY_EFFECT();
  const m = mindMatch(scene, mind, stats);
  if (!m.resonance.length && !m.friction.length) return { ...m, deltas: {} };
  const deltas = {};
  const add = (obj, times) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const n = Number(v) || 0;
      if (n) deltas[k] = (deltas[k] || 0) + n * times;
    }
  };
  add(conf.resonance, m.resonance.length);
  add(conf.friction, m.friction.length);
  return { ...m, deltas };
}

// Texto legible del estado mental para {{current_mind}}.
// Si todavía no hay estado vivo (primera escena), muestra la mente declarada de la ficha.
export function mindText(mind) {
  const live = [
    mind?.pensamiento && `Pensamiento: ${mind.pensamiento}`,
    mind?.deseo_privado && `Deseo privado: ${mind.deseo_privado}`,
    mind?.miedo && `Miedo: ${mind.miedo}`,
    mind?.oculta && `Lo que oculta: ${mind.oculta}`,
    mind?.acepta && `Lo que empieza a aceptar: ${mind.acepta}`,
    mind?.tags?.length && `Etiquetas activas: ${mind.tags.join(', ')}`,
    mind?.resist?.length && `Todavía resiste: ${mind.resist.join(', ')}`,
  ].filter(Boolean);
  const declared = [
    mind?.voice && `Voz interior: ${mind.voice}`,
    mind?.contradiction && `Contradicción: ${mind.contradiction}`,
    mind?.secret && `Secreto: ${mind.secret}`,
    mind?.taboo && `Tabú: ${mind.taboo}`,
    mind?.arc && `Arco: ${mind.arc}`,
  ].filter(Boolean);
  return [...live, ...declared].join('\n') || '(sin registro mental todavía)';
}

// Pensamientos de una entrada del historial (líneas *...* del diálogo).
export function thoughtsOf(dialogue) {
  return String(dialogue || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\*[^*]+\*/.test(l))
    .slice(0, 6);
}

// Memoria interior para el prompt: las últimas mentes completas + un resumen anterior.
// No repite las historias (ya viajan en <previous_story>), solo el hilo privado.
export function innerMemoryText(history = [], limit = 3) {
  if (!history.length) return '(sin memoria interior todavía)';
  const recent = history.slice(-limit);
  const older = history.slice(0, -limit).slice(-4);
  const rows = recent.map((h) => {
    const when = h.time ? `Día ${h.time.day} · ${h.time.start}–${h.time.end} · ${h.time.concept}` : 'Escena';
    const m = h.mind || {};
    const thoughts = thoughtsOf(h.dialogue);
    return [
      `[${when} — ${h.scene?.name || 'escena'}]`,
      m.pensamiento && `Pensamiento: ${m.pensamiento}`,
      m.deseo_privado && `Deseo privado: ${m.deseo_privado}`,
      m.miedo && `Miedo: ${m.miedo}`,
      m.oculta && `Lo que ocultó: ${m.oculta}`,
      m.acepta && `Lo que aceptó: ${m.acepta}`,
      m.tags?.length && `Etiquetas: ${m.tags.join(', ')}`,
      m.resist?.length && `Todavía resiste: ${m.resist.join(', ')}`,
      thoughts.length && `Pensamientos de la escena:\n${thoughts.map((t) => '  ' + t).join('\n')}`,
    ].filter(Boolean).join('\n');
  });
  const old = older.map((h) => {
    const when = h.time ? `Día ${h.time.day} ${h.time.start}` : '';
    return `- ${when} ${h.scene?.name || ''}: ${h.mind?.pensamiento || '(sin pensamiento registrado)'}`.trim();
  });
  return [...rows, old.length ? '[Hilo anterior]\n' + old.join('\n') : ''].filter(Boolean).join('\n---\n');
}

// Extrae el JSON que devuelve prompt_mind aunque venga con ```json ... ``` o texto alrededor.
export function parseMindJson(raw, previous = null) {
  const s = String(raw ?? '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return normalizeMind({ ...obj, updated: Date.now() }, previous);
  } catch {
    return null;
  }
}

// Estado de ejemplo para el modo demo (sin API key): así la mente también se ve en la interfaz.
export function demoMind(character, previous = null) {
  const base = previous || character?.mind || {};
  return normalizeMind({
    pensamiento: base.pensamiento || 'Se dice que esto no le importa; su cuerpo ya no sabe mentir.',
    deseo_privado: base.deseo_privado || character?.mind?.secret || 'Que la mire como mujer.',
    miedo: base.miedo || character?.mind?.taboo || 'Que el acondicionamiento termine de ganar.',
    oculta: base.oculta || 'Cuánto le cuesta sostener la mirada.',
    acepta: base.acepta || 'Que hay una parte de esto que ya no quiere devolver.',
    tags: base.tags?.length ? base.tags : (character?.mind?.tags || ['cuerpo']),
    resist: base.resist?.length ? base.resist : (character?.mind?.resist || ['entrega']),
    updated: Date.now(),
  }, base);
}

// Si el modelo no devuelve JSON, conservamos lo anterior y rescatamos el último pensamiento.
export function fallbackMind(dialogue, previous = null) {
  const thoughts = thoughtsOf(dialogue);
  const last = thoughts.at(-1)?.replace(/^\s*[^:]{1,40}:\s*/, '').replace(/\*/g, '').trim();
  return normalizeMind({
    ...(previous || {}),
    pensamiento: last || previous?.pensamiento || '',
    oculta: previous?.oculta || last || '',
    updated: Date.now(),
  }, previous);
}
