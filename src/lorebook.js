// Lorebook en formato World Info (ver lorebook_plantilla.json en la raíz).
// Se usa data/lorebook.json si existe; si no, queda data/lorebook.md como texto fijo.
//
// Selección de entradas para un prompt:
//   - `constant: true`  -> siempre se incluye.
//   - con `key`         -> se incluye si alguna palabra clave aparece en el texto de contexto
//                          (escena, personaje e historial reciente). `/regex/` también vale.
//   - `disable: true`   -> nunca.
// Se respeta `order` (menor primero) y se descartan entradas que aún tengan placeholders {{...}}.

const PLACEHOLDER = /\{\{[A-Z0-9_]+\}\}/;

// El lorebook usa {{user}} para el hombre/master. En este juego es un NPC: lo nombramos así.
const userLabel = () => process.env.MASTER_NAME || 'el master';
const resolveUser = (text) => text.replace(/\{\{user\}\}/gi, userLabel());

function matches(key, text, entry) {
  const k = String(key).trim();
  if (!k) return false;
  const re = k.match(/^\/(.+)\/([a-z]*)$/);
  if (re) {
    try { return new RegExp(re[1], re[2] || 'i').test(text); } catch { return false; }
  }
  if (entry.matchWholeWords) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, entry.caseSensitive ? 'u' : 'iu').test(text);
  }
  return entry.caseSensitive ? text.includes(k) : text.toLowerCase().includes(k.toLowerCase());
}

export function selectEntries(book, contextText) {
  const entries = Object.values(book?.entries || {})
    .filter((e) => e && typeof e === 'object' && !e.disable && e.content && !PLACEHOLDER.test(e.content))
    .filter((e) => e.constant || (e.key || []).some((k) => matches(k, contextText, e)));
  return entries.sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || (a.uid ?? 0) - (b.uid ?? 0));
}

// Devuelve el texto del lorebook listo para insertar en {{lorebook}}.
export function renderLorebook(cfg, contextText) {
  if (!cfg.lorebookBook) return resolveUser(cfg.lorebook);
  const picked = selectEntries(cfg.lorebookBook, contextText);
  if (!picked.length) return '(sin entradas de lorebook activas)';
  return picked.map((e) => resolveUser(e.content.trim())).join('\n\n');
}
