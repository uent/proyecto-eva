const base = () => process.env.NANOGPT_BASE_URL || 'https://nano-gpt.com/api/v1';
const key = () => process.env.NANOGPT_API_KEY;
export const demoMode = () => !key();

const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` });

export async function chat(prompt) {
  if (demoMode()) return `[DEMO] Respuesta simulada del LLM.\n---\n${prompt.slice(0, 160)}…`;
  const r = await fetch(`${base()}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: process.env.NANOGPT_TEXT_MODEL || 'chatgpt-4o-latest',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`NanoGPT chat ${r.status}: ${await r.text()}`);
  return (await r.json()).choices[0].message.content.trim();
}

export const ASPECTS = { '16:9': '1344x768', '1:1': '1024x1024', '9:16': '768x1344' };

// Devuelve una URL o data URL lista para <img src>. `aspect`: '16:9' | '1:1' | '9:16'.
export async function image(prompt, aspect = '1:1') {
  if (demoMode()) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><rect width='100%' height='100%' fill='#222'/><text x='20' y='40' fill='#9cf' font-family='monospace' font-size='16'>DEMO IMAGE</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  const r = await fetch(`${base()}/images/generations`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: process.env.NANOGPT_IMAGE_MODEL || 'hidream',
      prompt,
      n: 1,
      response_format: 'b64_json',
      // Algunos modelos (p. ej. anima) piden `resolution` ("1k"/"1.5k") y rechazan `size`.
      ...(process.env.NANOGPT_IMAGE_RESOLUTION
        ? { resolution: process.env.NANOGPT_IMAGE_RESOLUTION, aspect_ratio: aspect }
        : { size: ASPECTS[aspect] || ASPECTS['1:1'] }),
    }),
  });
  if (!r.ok) throw new Error(`NanoGPT image ${r.status}: ${await r.text()}`);
  const d = (await r.json()).data[0];
  return d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url;
}
