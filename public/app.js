const $ = (id) => document.getElementById(id);
let S;
const api = async (path, body) => {
  const r = await fetch('/api/' + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
};
const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function fill(sel, items, keep) {
  sel.innerHTML = items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
  if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
function renderStats() {
  const st = S.session.characters[$('char').value]?.stats;
  const COLORS = ['#f48fb1', '#f6b27f', '#b39ae8', '#e8648f', '#f0a0c8', '#c9a0ff'];
  $('stats').innerHTML = Object.entries(S.statDefs).map(([k, d], i) => {
    const v = st?.[k] ?? d.start, pct = Math.max(0, Math.min(100, ((v - d.min) / (d.max - d.min)) * 100));
    return `<div class="stat" style="--c:${COLORS[i % COLORS.length]}"><svg class="gauge" viewBox="0 0 120 72" role="img" aria-label="${esc(k)}: ${v}">
      <path class="bg" d="M12 62 A48 48 0 0 1 108 62" pathLength="100"/>
      <path class="fg" d="M12 62 A48 48 0 0 1 108 62" pathLength="100" stroke-dasharray="${pct} 100"/>
      <text x="60" y="58">${v}</text></svg><span>${esc(k)}</span></div>`;
  }).join('');
}
function renderMood() {
  const m = S.moods?.[$('char').value];
  $('mood').innerHTML = `<span class="moodlbl">Expresión</span>` +
    (m ? `<span class="moodtag mood-${esc(m.id)}">${esc(m.name)}</span><small>${Math.round(m.score)}/100</small>` : '') +
    `<button type="button" class="minibtn" id="xedit" title="Editar niveles de expresión">✎</button>`;
}
$('mood').addEventListener('click', (e) => { if (e.target.closest('#xedit')) openExpression(); });
function renderMind() {
  const id = $('char').value;
  const m = S.session?.characters?.[id]?.mind || S.minds?.[id];
  const rows = [
    ['Desea', m?.deseo_privado], ['Teme', m?.miedo], ['Oculta', m?.oculta], ['Acepta', m?.acepta],
  ].filter(([, v]) => v);
  const tags = (m?.tags?.length || m?.resist?.length) ? `<div class="mindtags">${(m.tags || []).map((t) => `<span>+${esc(t)}</span>`).join('')}${(m.resist || []).map((t) => `<span class="res">−${esc(t)}</span>`).join('')}</div>` : '';
  $('mind').innerHTML = `<div class="mindhead"><span class="mindlbl">Estado interior</span>
    <button type="button" class="minibtn" id="mindedit" title="Editar la mente declarada del personaje">✎</button></div>` +
    (m
      ? `<div class="mindcard"><p class="mindquote">“${esc(m.pensamiento || 'Sin pensamiento registrado todavía')}”</p>
        ${!m.pensamiento && m.voice ? `<p class="mindvoice">Voz: ${esc(m.voice)}</p>` : ''}
        ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}${tags}</div>`
      : '<small class="mindempty">Sin estado mental todavía. El primer avance lo crea.</small>');
}
$('mind').addEventListener('click', (e) => { if (e.target.closest('#mindedit')) openEditor($('char').value); });
function openExpression() {
  const x = S.expression || { formula: '', levels: [] };
  $('xform').elements.formula.value = x.formula || '';
  $('xlevels').innerHTML = (x.levels || []).map((l) => `<div class="xrow" data-id="${esc(l.id || '')}">
    <div class="xtop"><label>Nombre <input data-x="label" value="${esc(l.label || '')}"></label>
    <label>Desde <input type="number" min="0" max="100" step="1" data-x="from" value="${l.from ?? 0}"></label></div>
    <label>Cara (inglés, imágenes) <textarea data-x="face" rows="2">${esc(l.face || '')}</textarea></label>
    <label>Historia (español) <textarea data-x="story" rows="1">${esc(l.story || '')}</textarea></label>
    <label>Voz interior (español) <textarea data-x="inner" rows="1">${esc(l.inner || '')}</textarea></label></div>`).join('');
  $('xdlg').showModal();
}
$('xcancel').onclick = () => $('xdlg').close();
$('xform').onsubmit = async (ev) => {
  ev.preventDefault();
  const levels = [...$('xlevels').querySelectorAll('.xrow')].map((el, i) => ({
    id: el.dataset.id || `nivel_${i + 1}`,
    label: el.querySelector('[data-x=label]').value.trim(),
    from: Number(el.querySelector('[data-x=from]').value) || 0,
    face: el.querySelector('[data-x=face]').value.trim(),
    story: el.querySelector('[data-x=story]').value.trim(),
    inner: el.querySelector('[data-x=inner]').value.trim(),
  }));
  try {
    await load(await api('expression', { data: { formula: $('xform').elements.formula.value, levels } }));
    $('xdlg').close(); $('status').textContent = 'Niveles de expresión guardados ✔';
  } catch (err) { $('status').textContent = 'Error: ' + err.message; }
};
function renderSchedule() {
  const sch = S.characters.find((c) => c.id === $('char').value)?.schedule || [];
  const st = S.session.characters[$('char').value], cur = Number.isInteger(st?.block) ? st.block : -1;
  $('sched').innerHTML = (cur >= 0 ? `<small>Día ${st.day || 1}</small>` : '<small>Sin comenzar: ⏭ inicia el primer bloque</small>') +
    (sch.length ? sch.map((b, i) => `<div class="blk ${i === cur ? 'now' : ''}"><b>${b.start}–${b.end}</b>
    <span>${b.concept ? esc(b.concept) : '<i>sin concepto</i>'}</span></div>`).join('') : '<small>Sin horario. Defínelo en ✎ Editar personaje.</small>');
}
// 16:9 -> tarjeta apilada (imagen ancha arriba); 1:1 -> dos columnas; 9:16 -> imagen estrecha a la izquierda.
const aspectOf = (a) => (['16:9', '1:1', '9:16'].includes(a) ? a : '1:1');
function card(e) {
  const chg = (e.changes || []).map((c) => `<span class="${c.delta < 0 ? 'neg' : ''}">${c.stat} ${c.delta > 0 ? '+' : ''}${c.delta}</span>`).join(' · ');
  const mood = e.expression ? `<span class="moodp">${esc(e.expression.name)}</span>` : '';
  const mental = (e.mindEffect?.resonance?.length || e.mindEffect?.friction?.length)
    ? `<span class="mindp">mente: ${[...(e.mindEffect.resonance || []).map((t) => '+' + t), ...(e.mindEffect.friction || []).map((t) => '−' + t)].join(' ')}</span>` : '';
  const mind = e.mind?.pensamiento ? `<div class="mindquote">“${esc(e.mind.pensamiento)}”</div>` : '';
  const asp = aspectOf(e.aspect);
  return `<div class="card" data-aspect="${asp}" style="--ar:${asp.replace(':', '/')}"><div class="pic">${e.image ? `<img src="${e.image}">` : `<i>${esc(e.imageError || 'sin imagen')}</i>`}</div>
  <div><h3>${esc(e.scene.name)} <small>${e.time ? `Día ${e.time.day} · ${e.time.start}–${e.time.end} · ${esc(e.time.concept)}` : new Date(e.t).toLocaleString()}</small></h3>
  <div class="story">${esc(e.story)}</div>${mind}<div class="dlg">${esc(e.dialogue)}</div><div class="chg">${mood}${mental}${chg} (afinidad ${e.affinity})${e.rules?.length ? ` · reglas: ${esc(e.rules.join(', '))}` : ''}</div>
  <details><summary>Prompt de imagen</summary>${esc(e.imagePrompt)}</details></div></div>`;
}
function renderFeed() {
  const h = S.session.characters[$('char').value]?.history || [];
  $('feed').innerHTML = h.slice().reverse().map(card).join('');
}
function refresh() { renderStats(); renderMood(); renderMind(); renderSchedule(); renderFeed(); $('status').textContent = S.demo ? 'MODO DEMO (sin API key)' : 'NanoGPT conectado'; }
async function load(data) {
  S = data || await api('state');
  S.minds ??= {};
  fill($('char'), S.characters, $('char').value); fill($('scene'), S.scenes, $('scene').value); fill($('env'), S.environments, $('env').value);
  $('mname').textContent = S.master?.name || '—';
  $('count').max = S.maxAdvances || 10; refresh();
}
$('char').onchange = refresh;
$('reload').onclick = async () => { $('status').textContent = 'Recargando…'; await load(await api('reload', {})); $('status').textContent = 'Recargado ✔'; };
$('reset').onclick = async () => {
  const name = S.characters.find((c) => c.id === $('char').value)?.name;
  if (!confirm(`¿Reiniciar a ${name}? Se borran su historial, imágenes y estadísticas (vuelven a las iniciales).`)) return;
  await load(await api('reset', { characterId: $('char').value }));
  $('status').textContent = 'Personaje reiniciado ✔';
};
$('go').onclick = async () => {
  const max = S.maxAdvances || 10;
  const n = Math.min(Math.max(Math.trunc(Number($('count').value)) || 1, 1), max);
  const characterId = $('char').value;
  $('count').value = n;
  $('go').disabled = true; $('count').disabled = true; $('char').disabled = true; $('reset').disabled = true;
  S.session.characters[characterId] ??= { stats: {}, history: [] };
  const c = S.session.characters[characterId];
  try {
    for (let i = 1; i <= n; i++) {
      $('status').textContent = n > 1 ? `Generando avance ${i} de ${n}…` : 'Avanzando el tiempo…';
      // Un avance completo por petición: así la interfaz muestra el progreso y no se acumula un timeout largo.
      const r = await api('step', { characterId, count: 1 });
      const e = r.entries[0];
      c.stats = e.stats; c.mind = e.mind; c.block = e.block; c.day = e.day; c.history.push(e);
      S.moods[characterId] = e.expression;
      S.minds[characterId] = e.mind;
      renderStats(); renderMood(); renderMind(); renderSchedule(); renderFeed();
    }
    refresh();
    $('status').textContent = n > 1 ? `${n} avances generados ✔` : 'Avance generado ✔';
  } catch (err) {
    try { await load(await api('state')); } catch {}
    $('status').textContent = 'Error: ' + err.message;
  }
  $('go').disabled = false; $('count').disabled = false; $('char').disabled = false; $('reset').disabled = false;
};

// ---- Zoom de imágenes: clic abre, clic en la imagen alterna tamaño real, clic fuera / Esc cierra ----
const zoom = $('zoom');
$('feed').addEventListener('click', (e) => {
  if (e.target.tagName !== 'IMG') return;
  zoom.querySelector('img').src = e.target.src; zoom.classList.remove('full'); zoom.hidden = false;
});
zoom.addEventListener('click', (e) => {
  if (e.target.tagName === 'IMG') zoom.classList.toggle('full'); else zoom.hidden = true;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') zoom.hidden = true; });

// ---- Entornos (elementos reutilizables: las escenas los referencian) ----
let editingEnv = null;
function envAffRow(t, v) { return `<label class="srow">${esc(t)} <input type="number" step="0.1" data-trait="${esc(t)}" value="${v}"></label>`; }
function openEnv(id) {
  editingEnv = id;
  const e = id ? S.environments.find((x) => x.id === id) : { name: '', description: '', affinity: {} };
  const f = $('eform').elements;
  $('etitle').textContent = id ? 'Editar entorno: ' + e.name : 'Nuevo entorno';
  f.name.value = e.name; f.description.value = e.description || '';
  $('eaff').innerHTML = S.traits.map((t) => envAffRow(t, e.affinity?.[t] ?? 0)).join('');
  const used = id ? S.scenes.filter((x) => x.environment === id).map((x) => x.name) : [];
  $('eused').textContent = used.length ? 'Usado en: ' + used.join(', ') : '';
  $('edel').hidden = !id;
  $('edlg').showModal();
}
$('eedit').onclick = () => openEnv($('env').value);
$('enew').onclick = () => openEnv(null);
$('ecancel').onclick = () => $('edlg').close();
$('eaddtrait').onclick = () => {
  const t = $('enewtrait').value.trim();
  if (!t || $('eaff').querySelector(`[data-trait="${CSS.escape(t)}"]`)) return;
  $('eaff').insertAdjacentHTML('beforeend', envAffRow(t, 0)); $('enewtrait').value = '';
};
$('eform').onsubmit = async (ev) => {
  ev.preventDefault();
  const f = $('eform').elements, affinity = {};
  for (const i of $('eaff').querySelectorAll('input')) affinity[i.dataset.trait] = Number(i.value) || 0;
  try {
    const r = await api('environment', { id: editingEnv, data: { name: f.name.value.trim(), description: f.description.value.trim(), affinity } });
    editingEnv = r.savedId; await load(r); $('env').value = r.savedId;
    $('etitle').textContent = 'Editar entorno: ' + f.name.value.trim(); $('edel').hidden = false;
    $('status').textContent = 'Entorno guardado ✔';
  } catch (err) { $('status').textContent = 'Error: ' + err.message; }
};
$('edel').onclick = async () => {
  if (!confirm('¿Eliminar este entorno?')) return;
  try { await load(await api('environment/delete', { id: editingEnv })); $('edlg').close(); }
  catch (err) { $('eused').textContent = 'Error: ' + err.message; }
};

// ---- Constructor de reglas ----
let R = [];
const statOpts = (sel) => Object.keys(S.statDefs).map((k) => `<option ${k === sel ? 'selected' : ''}>${esc(k)}</option>`).join('');
const fieldOpts = (sel) => `<option value="value" ${sel !== 'delta' ? 'selected' : ''}>valor</option><option value="delta" ${sel === 'delta' ? 'selected' : ''}>cambio</option>`;
const condRow = (c) => `<div class="rrow cond"><select data-k="stat">${statOpts(c.stat)}</select> <select data-k="field">${fieldOpts(c.field)}</select>
  <select data-k="op">${S.ruleOps.map((o) => `<option ${o === c.op ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
  <input type="number" data-k="value" value="${c.value}"><button type="button" data-a="delc" title="Quitar">✕</button></div>`;
const effRow = (e) => `<div class="rrow eff"><select data-k="mode"><option value="add" ${e.mode !== 'set' ? 'selected' : ''}>sumar a</option><option value="set" ${e.mode === 'set' ? 'selected' : ''}>fijar</option></select>
  <select data-k="stat">${statOpts(e.stat)}</select> <input type="number" step="any" data-k="amount" value="${e.amount}">
  <select data-k="per"><option value="">(valor fijo)</option>${Object.keys(S.statDefs).map((k) => ['delta', 'value'].map((f) =>
    `<option value="${esc(k)}|${f}" ${e.per?.stat === k && (e.per.field || 'value') === f ? 'selected' : ''}>× ${f === 'delta' ? 'cambio' : 'valor'} de ${esc(k)}</option>`).join('')).join('')}</select>
  <button type="button" data-a="dele" title="Quitar">✕</button></div>`;
function renderRules() {
  $('rlist').innerHTML = R.map((r, i) => `<fieldset class="rule" data-i="${i}">
    <div class="rhead"><label class="tog"><input type="checkbox" data-k="enabled" ${r.enabled !== false ? 'checked' : ''}> activa</label>
      <input data-k="name" value="${esc(r.name)}" placeholder="Nombre de la regla"><button type="button" data-a="delr">Eliminar</button></div>
    <b>Si</b>${(r.when || []).map(condRow).join('')}<button type="button" data-a="addc">+ condición</button>
    <br><b>Entonces</b>${(r.then || []).map(effRow).join('')}<button type="button" data-a="adde">+ efecto</button>
    <small class="rsum">${esc(ruleText(r))}</small></fieldset>`).join('') || '<small>Aún no hay reglas.</small>';
}
function ruleText(r) {
  const f = (x) => (x === 'delta' ? 'cambio de ' : '');
  const w = (r.when || []).map((c) => `${f(c.field)}${c.stat} ${c.op} ${c.value}`).join(' y ') || 'siempre';
  const t = (r.then || []).map((e) => `${e.mode === 'set' ? 'fijar' : 'sumar a'} ${e.stat} ${e.amount}${e.per ? ` × ${f(e.per.field)}${e.per.stat}` : ''}`).join(', ');
  return `Si ${w} → ${t || '(sin efectos)'}`;
}
// Vuelca el DOM del constructor a R (así los campos escritos no se pierden al redibujar).
function readRules() {
  R = [...$('rlist').querySelectorAll('.rule')].map((el) => ({
    name: el.querySelector('[data-k=name]').value, enabled: el.querySelector('[data-k=enabled]').checked,
    when: [...el.querySelectorAll('.cond')].map((row) => ({ stat: row.querySelector('[data-k=stat]').value, field: row.querySelector('[data-k=field]').value,
      op: row.querySelector('[data-k=op]').value, value: Number(row.querySelector('[data-k=value]').value) || 0 })),
    then: [...el.querySelectorAll('.eff')].map((row) => {
      const [ps, pf] = row.querySelector('[data-k=per]').value.split('|');
      return { mode: row.querySelector('[data-k=mode]').value, stat: row.querySelector('[data-k=stat]').value,
        amount: Number(row.querySelector('[data-k=amount]').value) || 0, ...(ps ? { per: { stat: ps, field: pf } } : {}) };
    }),
  }));
}
const firstStat = () => Object.keys(S.statDefs)[0];
$('rules').onclick = () => { R = JSON.parse(JSON.stringify(S.rules || [])); renderRules(); $('rmsg').textContent = ''; $('rdlg').showModal(); };
$('rcancel').onclick = () => $('rdlg').close();
$('radd').onclick = () => { readRules(); R.push({ name: 'Nueva regla', enabled: true, when: [{ stat: firstStat(), field: 'value', op: '>', value: 10 }], then: [{ mode: 'add', stat: firstStat(), amount: 1 }] }); renderRules(); };
$('rlist').addEventListener('input', (e) => { if (e.target.dataset.k) { readRules(); const el = e.target.closest('.rule'); el.querySelector('.rsum').textContent = ruleText(R[el.dataset.i]); } });
$('rlist').addEventListener('click', (e) => {
  const a = e.target.dataset.a; if (!a) return;
  readRules(); const i = Number(e.target.closest('.rule').dataset.i), r = R[i];
  if (a === 'delr') R.splice(i, 1);
  else if (a === 'addc') r.when.push({ stat: firstStat(), field: 'value', op: '>', value: 10 });
  else if (a === 'adde') r.then.push({ mode: 'add', stat: firstStat(), amount: 1 });
  else if (a === 'delc') r.when.splice([...e.target.closest('.rule').querySelectorAll('.cond')].indexOf(e.target.closest('.cond')), 1);
  else if (a === 'dele') r.then.splice([...e.target.closest('.rule').querySelectorAll('.eff')].indexOf(e.target.closest('.eff')), 1);
  renderRules();
});
$('rsave').onclick = async () => {
  readRules();
  try { await load(await api('rules', { rules: R })); $('rmsg').textContent = 'Reglas guardadas ✔'; }
  catch (err) { $('rmsg').textContent = 'Error: ' + err.message; }
};

// ---- Histórico de eventos del personaje (agrupado por día, del más reciente al más antiguo) ----
function renderHistory() {
  const name = S.characters.find((c) => c.id === $('char').value)?.name || '';
  const h = S.session.characters[$('char').value]?.history || [];
  $('htitle').textContent = `Histórico de ${name} · ${h.length} evento${h.length === 1 ? '' : 's'}`;
  if (!h.length) { $('hlist').innerHTML = '<small>Aún no hay eventos. Pulsa ⏭ Avanzar tiempo.</small>'; return; }
  const days = new Map();
  h.forEach((e, i) => { const d = e.time?.day ?? 0; if (!days.has(d)) days.set(d, []); days.get(d).push({ e, i }); });
  $('hlist').innerHTML = [...days.entries()].reverse().map(([d, items]) => `<h3>${d ? 'Día ' + d : 'Sin día'}</h3>` +
    items.reverse().map(({ e, i }) => {
      const chg = (e.changes || []).filter((c) => c.delta).map((c) => `<span class="${c.delta < 0 ? 'neg' : ''}">${c.stat} ${c.delta > 0 ? '+' : ''}${c.delta}</span>`).join(' ');
      return `<div class="ev" data-i="${i}">${e.image ? `<img src="${e.image}" alt="">` : '<div class="noimg"></div>'}
        <div><b>${e.time ? `${e.time.start}–${e.time.end} · ${esc(e.time.concept)}` : new Date(e.t).toLocaleString()}</b> — ${esc(e.scene.name)}
        <p>${esc((e.story || '').slice(0, 160))}…</p>
        ${e.mind?.pensamiento ? `<p class="evmind">“${esc(e.mind.pensamiento)}”</p>` : ''}<div class="chg">${chg}</div></div></div>`;
    }).join('')).join('');
}
$('hist').onclick = () => { renderHistory(); $('hdlg').showModal(); };
$('hclose').onclick = () => $('hdlg').close();
$('hlist').onclick = (e) => {
  const i = e.target.closest('.ev')?.dataset.i; if (i == null) return;
  $('hdlg').close();
  const total = S.session.characters[$('char').value].history.length;
  $('feed').children[total - 1 - Number(i)]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ---- Colección de personajes ----
function renderGrid() {
  $('grid').innerHTML = S.characters.map((c) => {
    const n = S.session.characters[c.id]?.history.length || 0;
    return `<div class="pc ${c.id === $('char').value ? 'sel' : ''}" data-id="${c.id}">
      <h3>${esc(c.name)}</h3><small>${esc(c.personality || '')}</small>
      <div class="tags">${(c.traits || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <small>${n} escena${n === 1 ? '' : 's'}</small>
      <div class="btns"><button data-a="use">Usar</button><button data-a="edit">Editar</button>
      <button data-a="dup">Duplicar</button><button data-a="del">Eliminar</button></div></div>`;
  }).join('');
}
$('coll').onclick = () => { renderGrid(); $('cdlg').showModal(); };
$('cclose').onclick = () => $('cdlg').close();
$('cnew').onclick = () => { $('cdlg').close(); openEditor(null); };
$('grid').onclick = async (e) => {
  const a = e.target.dataset.a, id = e.target.closest('.pc')?.dataset.id;
  if (!a) return;
  const c = S.characters.find((x) => x.id === id);
  try {
    if (a === 'use') { $('char').value = id; refresh(); $('cdlg').close(); }
    else if (a === 'edit') { $('cdlg').close(); openEditor(id); }
    else if (a === 'dup') {
      const { id: _i, ...data } = c;
      await load(await api('character', { data: { ...data, name: c.name + ' copia' } })); renderGrid();
    } else if (a === 'del' && confirm(`¿Eliminar a ${c.name}? Se borra su archivo y su progreso.`)) {
      const keep = $('char').value === id ? undefined : $('char').value;
      await load(await api('character/delete', { id })); if (keep) $('char').value = keep; refresh(); renderGrid();
    }
  } catch (err) { $('status').textContent = 'Error: ' + err.message; }
};

// ---- Editor de prompts ----
$('pedit').onclick = () => {
  const f = $('pform').elements;
  f.prompt_1.value = S.prompts.prompt_1; f.prompt_2.value = S.prompts.prompt_2;
  f.prompt_mind.value = S.prompts.prompt_mind; f.image.value = S.prompts.image; f.lorebook.value = S.lorebook;
  $('lorebooknote').textContent = S.lorebookSource === 'json'
    ? `World Info activo: ${S.lorebookEntries} entradas en data/lorebook.json, filtradas por palabras clave. El texto de abajo solo se usa si ese archivo no existe.`
    : 'Modo texto: se usa este lorebook porque no hay data/lorebook.json.';
  $('pdlg').showModal();
};
$('pcancel').onclick = () => $('pdlg').close();
$('pform').onsubmit = async (ev) => {
  ev.preventDefault();
  const f = $('pform').elements;
  try {
    await load(await api('prompts', { prompt_1: f.prompt_1.value, prompt_2: f.prompt_2.value, prompt_mind: f.prompt_mind.value, image: f.image.value, lorebook: f.lorebook.value }));
    $('pdlg').close(); $('status').textContent = 'Prompts guardados ✔';
  } catch (err) { $('status').textContent = 'Error: ' + err.message; }
};

// ---- Editor del master (apariencia para las imágenes) ----
function openMaster() {
  const m = S.master || { name: 'Master', body: {} };
  const f = $('mform').elements;
  f.name.value = m.name || '';
  $('mbody').innerHTML = Object.entries(S.masterParts).map(([k, label]) =>
    `<label>${esc(label)} <textarea rows="2" data-mpart="${esc(k)}">${esc(m.body?.[k] || '')}</textarea></label>`).join('');
  $('mdlg').showModal();
}
$('medit').onclick = openMaster;
$('mcancel').onclick = () => $('mdlg').close();
$('mform').onsubmit = async (ev) => {
  ev.preventDefault();
  const body = {};
  for (const t of $('mbody').querySelectorAll('textarea')) body[t.dataset.mpart] = t.value.trim();
  try {
    await load(await api('master', { data: { name: $('mform').elements.name.value.trim(), body } }));
    $('mdlg').close(); $('status').textContent = 'Master guardado ✔';
  } catch (err) { $('status').textContent = 'Error: ' + err.message; }
};

// ---- Editor de escenas ----
let editingScene = null;
function openScene(id) {
  editingScene = id;
  const sc = id ? S.scenes.find((x) => x.id === id) : { name: '', concept: '', environment: '', aspect: '1:1', master: [], location: '', description: '', mindTags: [], effects: {} };
  const f = $('sform').elements;
  $('sdtitle').textContent = id ? 'Editar escena: ' + sc.name : 'Nueva escena';
  f.name.value = sc.name; f.concept.value = sc.concept || ''; f.location.value = sc.location || ''; f.description.value = sc.description || '';
  f.mindTags.value = (sc.mindTags || []).join(', ');
  f.environment.innerHTML = '<option value="">— sin entorno —</option>' + S.environments.map((e) => `<option value="${esc(e.id)}" ${e.id === sc.environment ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  $('concepts').innerHTML = S.concepts.map((e) => `<option value="${esc(e)}">`).join('');
  f.aspect.innerHTML = S.aspects.map((x) => `<option ${x === (sc.aspect || '1:1') ? 'selected' : ''}>${esc(x)}</option>`).join('');
  $('smaster').innerHTML = Object.entries(S.masterParts).map(([k, label]) =>
    `<label class="tog"><input type="checkbox" data-master="${esc(k)}" ${(sc.master || []).includes(k) ? 'checked' : ''}> ${esc(label)}</label>`).join('');
  renderSceneTags();
  tagTarget = f.description;
  $('sfx').innerHTML = Object.keys(S.statDefs).map((k) =>
    `<label class="srow">${k} <input type="number" step="1" data-fx="${k}" value="${sc.effects?.[k] ?? 0}"></label>`).join('');
  $('sdel').hidden = !id; $('prev').innerHTML = '';
  $('sdlg').showModal(); updatePrompt();
}
function readScene() {
  const f = $('sform').elements, effects = {}, master = [];
  for (const i of $('sfx').querySelectorAll('input')) effects[i.dataset.fx] = Number(i.value) || 0;
  for (const i of $('smaster').querySelectorAll('input')) if (i.checked) master.push(i.dataset.master);
  return { name: f.name.value.trim(), concept: f.concept.value.trim(), environment: f.environment.value, aspect: f.aspect.value, master,
    location: f.location.value.trim(), description: f.description.value.trim(),
    mindTags: f.mindTags.value.split(',').map((t) => t.trim()).filter(Boolean), effects };
}

// ---- Tags disponibles en el editor de escenas: se insertan en el campo enfocado ----
let tagTarget = null;
function sceneTagGroups() {
  const master = Object.keys(S.masterParts).map((k) => '{{master.' + k + '}}');
  const body = Object.keys(S.bodyParts).map((k) => '{{body.' + k + '}}');
  return [
    ['Master', ['{{master}}', '{{master.name}}', ...master]],
    ['Cuerpo', ['{{body}}', ...body]],
    ['Expresión', ['{{expression}}', '{{expression.name}}', '{{expression.story}}', '{{expression.inner}}', '{{expression.score}}']],
    ['Personaje', ['{{character.name}}', '{{character.traits}}', '{{character.mind.voice}}', '{{character.mind.contradiction}}', '{{character.mind.secret}}']],
    ['Mente (historia)', ['{{current_mind}}', '{{inner_memory}}']],
    ['Entorno', ['{{environment.name}}', '{{environment.description}}']],
  ];
}
function renderSceneTags() {
  $('stags').innerHTML = sceneTagGroups().map(([g, tags]) =>
    `<div class="tgroup"><b>${esc(g)}</b>${tags.map((t) => `<button type="button" class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>`).join('');
}
function insertAtCursor(el, text) {
  const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + text.length;
}
$('sform').addEventListener('focusin', (e) => {
  if (e.target.matches('input[name], textarea[name]')) tagTarget = e.target;
});
$('stags').onclick = (e) => {
  const btn = e.target.closest('[data-tag]');
  if (!btn) return;
  const el = tagTarget && $('sform').contains(tagTarget) ? tagTarget : $('sform').elements.description;
  insertAtCursor(el, btn.dataset.tag);
  updatePrompt();
};
let promptTimer;
async function updatePrompt() {
  try {
    const r = await api('scene/prompt', { scene: readScene(), characterId: $('char').value, withCharacter: $('swith').checked });
    $('sprompt').value = r.imagePrompt; $('pcap').textContent = r.character ? '(' + r.character + ')' : '';
  } catch (err) { $('sprompt').value = 'Error: ' + err.message; }
}
const queuePrompt = () => { clearTimeout(promptTimer); promptTimer = setTimeout(updatePrompt, 250); };
$('sform').addEventListener('input', queuePrompt);
$('swith').addEventListener('change', updatePrompt);
$('sedit').onclick = () => openScene($('scene').value);
$('snew').onclick = () => openScene(null);
$('scancel').onclick = () => $('sdlg').close();
$('sform').onsubmit = async (ev) => {
  ev.preventDefault();
  try {
    const r = await api('scene', { id: editingScene, data: readScene() });
    editingScene = r.savedId; await load(r); $('scene').value = r.savedId;
    $('sdtitle').textContent = 'Editar escena: ' + readScene().name; $('sdel').hidden = false;
    $('status').textContent = 'Escena guardada ✔';
  } catch (err) { $('status').textContent = 'Error: ' + err.message; }
};
$('sdel').onclick = async () => {
  if (!confirm('¿Eliminar esta escena?')) return;
  try { await load(await api('scene/delete', { id: editingScene })); $('sdlg').close(); }
  catch (err) { $('status').textContent = 'Error: ' + err.message; }
};
$('sprev').onclick = async () => {
  $('sprev').disabled = true; $('prev').textContent = 'Generando vista previa…';
  try {
    const p = await api('preview', { scene: readScene() });
    const chg = p.changes.filter((c) => c.delta).map((c) => `<span class="${c.delta < 0 ? 'neg' : ''}">${c.stat} ${c.delta > 0 ? '+' : ''}${c.delta}</span>`).join(' · ');
    const mental = (p.mind?.resonance?.length || p.mind?.friction?.length)
      ? ` · mente: ${[...(p.mind.resonance || []).map((t) => '+' + t), ...(p.mind.friction || []).map((t) => '−' + t)].join(' ')}` : '';
    $('prev').innerHTML = `<div>${p.image ? `<img src="${p.image}">` : `<i>${esc(p.imageError || 'sin imagen')}</i>`}</div>
      <div><b>${esc(p.character.name)}</b> (afinidad ${p.affinity})${p.expression ? ` · expresión: <b>${esc(p.expression.name)}</b> (${Math.round(p.expression.score)}/100)` : ''}${mental}<div class="chg">${chg || 'sin cambios'}</div>
      <details open><summary>Prompt de imagen</summary>${esc(p.imagePrompt)}</details></div>`;
  } catch (err) { $('prev').textContent = 'Error: ' + err.message; }
  $('sprev').disabled = false;
};

// ---- Editor de personajes ----
let editingId = null;
function openEditor(id) {
  editingId = id;
  const c = id ? S.characters.find((x) => x.id === id) : { name: '', traits: [], stats: {}, body: {} };
  const f = $('form').elements;
  $('dtitle').textContent = id ? 'Editar ' + c.name : 'Nuevo personaje';
  f.name.value = c.name || ''; f.personality.value = c.personality || '';
  f.traits.value = (c.traits || []).join(', ');
  f.mindVoice.value = c.mind?.voice || '';
  f.mindContradiction.value = c.mind?.contradiction || '';
  f.mindSecret.value = c.mind?.secret || '';
  f.mindTaboo.value = c.mind?.taboo || '';
  f.mindArc.value = c.mind?.arc || '';
  f.mindTags.value = (c.mind?.tags || []).join(', ');
  f.mindResist.value = (c.mind?.resist || []).join(', ');
  $('fstats').innerHTML = Object.entries(S.statDefs).map(([k, d]) =>
    `<label class="srow">${k} <input type="number" data-stat="${k}" min="${d.min}" max="${d.max}" value="${c.stats?.[k] ?? d.start}"></label>`).join('');
  const DEF = [['07:00','09:00'],['09:00','13:00'],['13:00','17:00'],['17:00','21:00'],['21:00','23:00']];
  const sch = c.schedule?.length ? c.schedule : [];
  $('fsched').innerHTML = DEF.map((d, i) => {
    const b = sch[i] || { start: d[0], end: d[1], concept: '' };
    return `<div class="brow"><input type="time" data-s="start" value="${b.start}"> – <input type="time" data-s="end" value="${b.end}">
      <select data-s="concept"><option value="">— sin concepto —</option>${S.concepts.map((x) => `<option value="${esc(x)}" ${x === b.concept ? 'selected' : ''}>${esc(x)} (${S.scenes.filter((s) => s.concept === x).length})</option>`).join('')}</select></div>`;
  }).join('');
  $('fbody').innerHTML = Object.entries(S.bodyParts).map(([k, label]) =>
    `<label>${esc(label)} <textarea rows="2" data-part="${k}">${esc(c.body?.[k] || '')}</textarea></label>`).join('');
  $('dlg').showModal();
}
$('cancel').onclick = () => $('dlg').close();
$('edit').onclick = () => openEditor($('char').value);
$('new').onclick = () => openEditor(null);
$('form').onsubmit = async (ev) => {
  ev.preventDefault();
  const f = $('form').elements;
  const body = {};
  for (const t of $('fbody').querySelectorAll('textarea')) body[t.dataset.part] = t.value.trim();
  const stats = {};
  for (const i of $('fstats').querySelectorAll('input')) stats[i.dataset.stat] = Number(i.value);
  const data = {
    name: f.name.value.trim(), personality: f.personality.value.trim(),
    traits: f.traits.value.split(',').map((t) => t.trim()).filter(Boolean),
    mind: {
      voice: f.mindVoice.value.trim(), contradiction: f.mindContradiction.value.trim(),
      secret: f.mindSecret.value.trim(), taboo: f.mindTaboo.value.trim(), arc: f.mindArc.value.trim(),
      tags: f.mindTags.value.split(',').map((t) => t.trim()).filter(Boolean),
      resist: f.mindResist.value.split(',').map((t) => t.trim()).filter(Boolean),
    },
    stats, body,
    schedule: [...$('fsched').querySelectorAll('.brow')].map((r) => ({
      start: r.querySelector('[data-s=start]').value, end: r.querySelector('[data-s=end]').value, concept: r.querySelector('[data-s=concept]').value })),
  };
  try {
    const r = await api('character', { id: editingId, data });
    $('dlg').close();
    $('char').value = r.savedId;
    await load(r);
    $('status').textContent = 'Personaje guardado ✔';
  } catch (err) { $('status').textContent = 'Error: ' + err.message; }
};
load();
