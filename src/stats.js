import vm from 'node:vm';
import { mindEffect } from './mind.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function evalFormula(expr, vars) {
  // Contexto aislado: solo variables numéricas y Math.
  return vm.runInNewContext(expr, { ...vars, Math, min: Math.min, max: Math.max }, { timeout: 50 });
}

// Afinidad = suma de lo que cada rasgo de personalidad opina del entorno de la escena.
export function affinity(character, scene, envs = []) {
  const aff = envs.find((e) => e.id === scene.environment)?.affinity || {};
  return (character.traits || []).reduce((s, t) => s + (aff[t] ?? 0), 0);
}

// Aplica los efectos base de la escena usando la fórmula de cada estadística.
// `mind` es el estado mental actual (session.characters[id].mind): según sus etiquetas,
// la escena suma resonancia (le toca una fibra) o fricción (le obliga a mirar lo que evita).
export function applyScene(character, stats, scene, cfg, rules = [], envs = [], mind = null) {
  const aff = affinity(character, scene, envs);
  const next = { ...stats };
  const changes = [];
  for (const [name, base] of Object.entries(scene.effects || {})) {
    const def = cfg.stats[name];
    if (!def) continue;
    const formula = cfg.formulas?.[name] ?? cfg.defaultFormula;
    let delta = Number(evalFormula(formula, { base, affinity: aff, current: stats[name], min: def.min, max: def.max }));
    if (!Number.isFinite(delta)) delta = 0;
    const value = clamp(Math.round((stats[name] + delta) * 10) / 10, def.min, def.max);
    changes.push({ stat: name, from: stats[name], to: value, delta: Math.round((value - stats[name]) * 10) / 10 });
    next[name] = value;
  }

  // La mente añade su propia tensión sobre las estadísticas ya afectadas por la escena.
  const mental = mindEffect(scene, mind, stats, cfg);
  for (const [name, delta] of Object.entries(mental.deltas)) {
    const def = cfg.stats[name];
    if (!def) continue;
    const value = clamp(Math.round((next[name] + delta) * 10) / 10, def.min, def.max);
    const c = changes.find((x) => x.stat === name);
    if (c) { c.to = value; c.delta = round1(value - c.from); }
    else if (value !== next[name]) changes.push({ stat: name, from: stats[name], to: value, delta: round1(value - stats[name]) });
    next[name] = value;
  }

  // Reglas: pueden modificar cualquier estadística; se añaden/actualizan en la lista de cambios.
  const r = applyRules(rules, stats, next, cfg);
  for (const k of Object.keys(r.stats)) {
    if (r.stats[k] === next[k]) continue;
    const c = changes.find((x) => x.stat === k);
    if (c) { c.to = r.stats[k]; c.delta = round1(r.stats[k] - c.from); }
    else changes.push({ stat: k, from: stats[k], to: r.stats[k], delta: round1(r.stats[k] - stats[k]) });
  }
  return {
    stats: r.stats, changes, affinity: aff, rules: r.fired,
    mind: { tags: mental.tags, resonance: mental.resonance, friction: mental.friction, deltas: mental.deltas },
  };
}

const OPS = {
  '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b,
  '<=': (a, b) => a <= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b,
};
export const RULE_OPS = Object.keys(OPS);
const round1 = (v) => Math.round(v * 10) / 10;

// Valor de una estadística dentro de una escena: "value" = valor actual, "delta" = cambio desde que empezó la escena.
const read = (stats, start, stat, field) => (field === 'delta' ? stats[stat] - start[stat] : stats[stat]);

// Reglas del constructor: si TODAS las condiciones se cumplen, aplica los efectos (en orden, sobre los valores ya modificados).
export function applyRules(rules, start, stats, cfg) {
  const next = { ...stats }, fired = [];
  for (const r of rules || []) {
    if (r.enabled === false || !(r.then || []).length) continue;
    const ok = (r.when || []).every((c) => c.stat in next && OPS[c.op]?.(read(next, start, c.stat, c.field), Number(c.value)));
    if (!ok) continue;
    fired.push(r.name || 'regla');
    for (const e of r.then) {
      const def = cfg.stats[e.stat];
      if (!def) continue;
      const mult = e.per?.stat in next ? read(next, start, e.per.stat, e.per.field) : 1;
      const amount = Number(e.amount) * mult;
      if (!Number.isFinite(amount)) continue;
      next[e.stat] = clamp(round1(e.mode === 'set' ? amount : next[e.stat] + amount), def.min, def.max);
    }
  }
  return { stats: next, fired };
}

export function initialStats(character, cfg) {
  const s = {};
  for (const [k, d] of Object.entries(cfg.stats)) s[k] = character.stats?.[k] ?? d.start;
  return s;
}
