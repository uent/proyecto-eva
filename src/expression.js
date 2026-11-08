import vm from 'node:vm';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Niveles por defecto: se usan si data/expression.json no existe o está incompleto.
export const DEFAULT_EXPRESSION = {
  formula: '50 + (vínculo - 50) * 0.6 + (deseo - 50) * 0.25 + (obediencia - 50) * 0.1 + (feminidad - 50) * 0.05 - (ansiedad - 50) * 0.5',
  levels: [
    {
      id: 'enojada', label: 'Enojada', from: 0,
      face: 'angry expression, furrowed brows, narrowed eyes, clenched jaw, cold glare',
      story: 'ceño fruncido, mirada dura y labios apretados',
      inner: 'todo en ella dice que no, aunque obedezca; se promete que nada de esto la está cambiando',
    },
    {
      id: 'molesta', label: 'Molesta', from: 20,
      face: 'annoyed expression, pursed lips, slight frown, skeptical sideways glance',
      story: 'gesto de fastidio, labios apretados y mirada de reojo',
      inner: 'se dice que solo lo hace por cumplir, y se vigila para no descubrirse deseándolo',
    },
    {
      id: 'neutra', label: 'Neutra', from: 40,
      face: 'neutral expression, relaxed lips, calm even gaze',
      story: 'rostro tranquilo y mirada serena',
      inner: 'hace lo que toca y evita preguntarse por qué ya no le cuesta tanto',
    },
    {
      id: 'enamorada', label: 'Enamorada', from: 60,
      face: 'loving expression, soft warm eyes, gentle smile, faint blush',
      story: 'ojos suaves, sonrisa leve y mejillas sonrosadas',
      inner: 'se sorprende pensando en él sin permiso y aparta la idea como si quemara',
    },
    {
      id: 'locamente_enamorada', label: 'Locamente enamorada', from: 80,
      face: 'deeply in love expression, radiant smile, glossy adoring eyes, flushed cheeks, dreamy gaze',
      story: 'sonrisa radiante, mirada brillante y adoración evidente',
      inner: 'ya no distingue entre lo que le hicieron y lo que quiere; le da miedo y no quiere parar',
    },
  ],
};

// Puntúa el ánimo con las estadísticas actuales y devuelve el nivel que le corresponde.
// `{{expression}}` se resuelve como la cara (face); también hay name, story y score.
export function expressionOf(conf, stats = {}) {
  const c = conf?.levels?.length ? conf : DEFAULT_EXPRESSION;
  let score = 50;
  try {
    score = Number(vm.runInNewContext(c.formula || DEFAULT_EXPRESSION.formula, { ...stats, Math, min: Math.min, max: Math.max }, { timeout: 50 }));
  } catch { /* fórmula inválida: se queda en neutra */ }
  if (!Number.isFinite(score)) score = 50;
  score = Math.round(clamp(score, 0, 100) * 10) / 10;

  const levels = [...c.levels].sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  const level = levels.reduce((acc, l) => (score >= (l.from ?? 0) ? l : acc), levels[0]);
  return {
    id: level.id,
    name: level.label || level.id,
    score,
    face: level.face || '',
    story: level.story || '',
    inner: level.inner || '',
    all: level.face || '', // para {{expression}}
  };
}
