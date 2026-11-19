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
  const body = { ...(character.body || {}) };
  body.all = Object.keys(body).map((k) => String(body[k] ?? '').trim()).filter(Boolean).join(', ');
  body.hidden = [];
  return body; // {{body}} se resuelve en render() como body.all
}

// Datos visuales del master: igual que el cuerpo del personaje, todas las partes están
// siempre disponibles. Si una escena no lleva master, simplemente no usa estos tags.
export function masterContext(master) {
  const body = master?.body || {};
  const ctx = { name: master?.name || '' };
  for (const k of Object.keys(body)) ctx[k] = body[k];
  ctx.all = Object.keys(body).map((k) => String(body[k] ?? '').trim()).filter(Boolean).join(', ');
  ctx.hidden = [];
  ctx.present = ctx.all.length > 0;
  return ctx;
}

