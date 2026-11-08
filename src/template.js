// Plantillas {{ruta.a.valor}}. Los tags de cuerpo se autocompletan según el encuadre de la escena:
//   {{body}}          -> todas las partes VISIBLES unidas
//   {{body.head}}     -> solo esa parte, vacío si no es visible en el encuadre
//   {{body.hidden}}   -> lista de partes ocultas (útil para negative prompt)
const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const TAG = /\{\{\s*([\w.]+)\s*\}\}/g;

// Una pasada de sustitución. Si un valor se contiene a sí mismo (p. ej. {{scene.description}}
// dentro de la propia descripción) se deja el tag para no entrar en bucle.
function pass(tpl, ctx) {
  return tpl.replace(TAG, (full, key) => {
    const v = get(ctx, key);
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return 'all' in v ? (v.all ?? '') : JSON.stringify(v);
    if (typeof v === 'string' && v.includes(full)) return full;
    return String(v);
  });
}

export function render(tpl, ctx) {
  // Varias pasadas: así los tags escritos dentro de una escena ({{master}}, {{body}}…)
  // también se resuelven cuando su texto se inyecta con {{scene.description}}.
  let out = String(tpl);
  for (let i = 0; i < 4; i++) {
    const next = pass(out, ctx);
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(,[ \t]*){2,}/g, ', ')
    .replace(/,[ \t]*\n/g, ',\n')
    .replace(/(^|\n)[ \t]*,[ \t]*/g, '$1')
    .replace(/,[ \t]*\n+(?=\S)/g, ', ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function bodyContext(character) {
  const all = Object.keys(character.body || {});
  const visibleKeys = all; // el formato de la escena (16:9, 1:1, 9:16) ya no oculta partes del cuerpo
  const body = {};
  for (const k of all) body[k] = visibleKeys.includes(k) ? character.body[k] : '';
  body.all = visibleKeys.filter((k) => character.body[k]).map((k) => character.body[k]).join(', ');
  body.hidden = all.filter((k) => !visibleKeys.includes(k));
  return body; // {{body}} se resuelve en render() como body.all
}

// Datos visuales del master filtrados por la escena: la escena guarda en `master` la lista
// de partes visibles. {{master}} se resuelve como la unión de esas partes.
export function masterContext(master, scene) {
  const body = master?.body || {};
  const selected = Array.isArray(scene?.master) ? scene.master : [];
  const ctx = { name: master?.name || '' };
  for (const k of Object.keys(body)) ctx[k] = selected.includes(k) ? body[k] : '';
  ctx.all = selected.filter((k) => body[k]).map((k) => String(body[k]).trim()).filter(Boolean).join(', ');
  ctx.hidden = Object.keys(body).filter((k) => !selected.includes(k));
  ctx.present = selected.length > 0;
  return ctx;
}

