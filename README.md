# Arco

Simulación de un personaje que vive una historia contada por **escenas**: cada escena genera un texto (LLM), una conversación entre personajes y una imagen (IA) vía [NanoGPT](https://nano-gpt.com). Según la escena y unas fórmulas, las **estadísticas** del personaje cambian.

El contenido incluido está adaptado al lorebook **Mundo EVA - Neo Mujeres** (año 2038, Programa EVA, neo mujeres y acondicionamiento).

## Reglas del proyecto

- Todo el trabajo ocurre **solo dentro de esta carpeta** (`arco`). No se visitan ni modifican otros repositorios o carpetas.

## Requisitos

- Node.js 20+ (sin dependencias npm).
- API key de NanoGPT (opcional: sin ella corre en **modo demo** con texto e imagen simulados).

## Uso

```bash
cp .env.example .env   # completa NANOGPT_API_KEY
npm start              # http://localhost:3000
```

En la interfaz: elige personaje → **⏭ Avanzar tiempo**: pasa al siguiente bloque del horario del personaje, elige una escena al azar de su concepto y genera el contenido. Al terminar el último bloque pasa al día siguiente. El campo **Avances** (1–10) permite generar varios bloques seguidos en una sola pulsación; cada avance se completa con su historia, diálogo, imagen y cambios de estadísticas antes de empezar el siguiente. El botón **Recargar prompts y escenas** relee todos los archivos de `data/` sin reiniciar el servidor.

## Flujo de generación

1. `prompt_1` = lorebook filtrado + personaje (con sus stats, expresión y mente declarada) + escena + memoria interior + historia previa → **historia**.
2. `prompt_2` = historia + escena → **conversación y pensamientos** entre personajes (`Nombre: mensaje` / `Nombre: *pensamiento*`), anclados en el acto sexual o en el deseo explícito de la escena.
3. `prompt_mind` = historia + diálogo → **estado mental** de la neo mujer (JSON: pensamiento, deseo privado, miedo, lo que oculta, lo que acepta, etiquetas y resistencias).
4. `prompt_image` = personaje + expresión + master (según la escena) + escena + entorno → **imagen**.
5. Se aplican las fórmulas, la resonancia/fricción de la mente y cambian las **estadísticas**.

Los textos que alimentan la imagen (plantilla, cuerpo del personaje, descripción/lugar de la escena y descripción del entorno) están escritos en **inglés** para que el modelo de imagen los interprete mejor. La historia y el diálogo se siguen generando en **español**.

## Lorebook (World Info)

`data/lorebook.json` es el lorebook activo, en formato World Info (el mismo de `lorebook_plantilla.json`). El motor filtra las entradas por palabras clave con el texto de la escena, el personaje y el historial reciente:

- `constant: true` → siempre se incluye.
- `key: [...]` → se incluye si alguna palabra aparece en el contexto. También acepta `/regex/`.
- `disable: true` → nunca se incluye.
- `order` → menor primero (por defecto 100).

La entrada **[Concept] Mente interior de la neo mujer** es `constant: true` y fija el tono general del doble pensamiento; las etiquetas concretas y la evolución de cada personaje viven en su ficha y en `state/session.json`, no en el lorebook.

Las entradas nuevas se añaden como `data/lorebook.json`; el archivo `data/lorebook.md` queda como **respaldo legible** y solo se usa si el JSON no existe. El editor de la interfaz escribe el `.md`, así que con World Info activo ese texto no alimenta los prompts (la interfaz lo avisa).

El placeholder `{{user}}` del lorebook se resuelve como **el master**; puedes cambiar el nombre con `MASTER_NAME` en `.env`. Ese nombre es solo para el texto del lorebook: el nombre y la apariencia del master para las imágenes se editan en **✎ Master**.

## Estructura

```
data/
  lorebook.json            World Info activo (entradas + palabras clave)
  lorebook.md              Respaldo legible / fallback
  body_parts.json          Secciones del cuerpo del personaje
  master_parts.json        Secciones del cuerpo del master
  master.json              Apariencia del master (para las imágenes)
  stats.json               Estadísticas y fórmulas
  expression.json          Niveles de expresión según las estadísticas
  rules.json               Reglas entre estadísticas
  framings.json            (en desuso) antiguos encuadres por partes del cuerpo
  prompts/prompt_1.txt     Prompt de la historia
  prompts/prompt_2.txt     Prompt de la conversación y pensamientos
  prompts/prompt_mind.txt  Prompt del estado mental (devuelve JSON)
  prompts/prompt_image.txt Prompt de la imagen (con tags de cuerpo)
  characters/*.json        Personajes
  environments/*.json      Entornos reutilizables (descripción y afinidad por rasgo)
  scenes/*.json            Escenas
src/                       config, plantillas, estadísticas, cliente NanoGPT
public/                    Interfaz web
state/session.json         Progreso guardado (ignorado por git)
```

## Personajes y partes del cuerpo

El cuerpo se divide en secciones: `general`, `head` (cabeza y cabello), `chest`, `hips`, `legs`. Puedes agregar más claves en `body`.

```json
{ "name": "Luna", "traits": ["dulce", "coqueta"], "body": { "general": "24-year-old neo woman...", "head": "...", "chest": "...", "hips": "...", "legs": "..." } }
```

### Tags de cuerpo en el prompt de imagen

| Tag | Resultado |
|---|---|
| `{{body}}` | Todas las partes **visibles** unidas |
| `{{body.head}}`, `{{body.chest}}`… | Esa parte; vacío si el encuadre no la muestra |
| `{{body.hidden}}` | Partes ocultas (útil para un negative prompt) |

Cada escena define `"aspect"`, el formato de la imagen: `16:9`, `1:1` o `9:16`. Los tags de cuerpo incluyen siempre todas las partes del personaje.

Otros tags: `{{character.name}}`, `{{character.personality}}`, `{{character.traits}}`, `{{character.statsText}}`, `{{character.mind.voice}}`, `{{character.mind.contradiction}}`, `{{character.mind.secret}}`, `{{character.mind.taboo}}`, `{{character.mind.arc}}`, `{{scene.name}}`, `{{scene.description}}`, `{{scene.location}}`, `{{environment.name}}`, `{{environment.description}}`, `{{master}}`, `{{expression}}`, `{{expression.name}}`, `{{expression.story}}`, `{{expression.inner}}`, `{{expression.score}}`, `{{lorebook}}`, `{{inner_memory}}`, `{{current_mind}}`, `{{history}}`, `{{story}}` (solo en prompt_2 y prompt_mind), `{{dialogue}}` (solo en prompt_mind), `{{stats_json}}`, `{{recent_actions}}`.

Los tags se resuelven también dentro de la descripción de la escena, así que puedes escribir `{{master.hands}}` en la descripción y se expandirá al generar la imagen.

## Master

El **master** es un único personaje masculino que comparten las historias. Su apariencia visual se define en `data/master.json` con **✎ Master** en la barra superior. Los textos están en inglés porque alimentan al modelo de imagen.

```json
{ "name": "Master", "body": {
  "general": "her master, a 32-year-old man...", "head": "...", "chest": "...",
  "hands": "...", "hips": "...", "legs": "..." } }
```

Las partes se configuran en `data/master_parts.json`. Cada escena guarda en `"master"` la lista de partes **visibles** en ese encuadre: `[]` significa que el master no aparece.

| Tag | Resultado |
|---|---|
| `{{master}}` | Unión de las partes visibles definidas por la escena |
| `{{master.head}}`, `{{master.hands}}`… | Esa parte; vacío si la escena no la marca |
| `{{master.name}}` | Nombre del master |
| `{{master.hidden}}` | Partes no visibles (útil para un negative prompt) |

En el editor de escenas aparecen casillas para marcar esas partes y una paleta de **tags disponibles**: al hacer clic se insertan en el campo que estés editando (por defecto, la descripción).

## Expresión según estadísticas

La cara de la neo mujer cambia con un **nivel de expresión** calculado a partir de sus estadísticas. Los niveles están en `data/expression.json`:

| Nivel | Desde (score) | Expresión en la imagen |
|---|---|---|
| Enojada | 0 | ceño fruncido, mirada dura |
| Molesta | 20 | fastidio, labios apretados |
| Neutra | 40 | rostro tranquilo |
| Enamorada | 60 | ojos suaves, sonrisa leve, rubor |
| Locamente enamorada | 80 | sonrisa radiante, mirada adoradora |

El score se calcula con una fórmula editable sobre las estadísticas actuales. Por defecto:

```js
50 + (vínculo - 50) * 0.6 + (deseo - 50) * 0.25 + (obediencia - 50) * 0.1
   + (feminidad - 50) * 0.05 - (ansiedad - 50) * 0.5
```

- En la barra lateral se muestra el nivel actual y su puntuación; el botón **✎** abre el editor de niveles (fórmula, umbrales, cara e historia).
- Cada tarjeta del historial guarda la expresión que tenía la escena.
- La imagen usa la expresión resultante de aplicar los efectos de la escena; la historia usa la del estado con el que empieza.
- `{{expression}}` se resuelve como la descripción facial en inglés; `{{expression.name}}` es el nivel, `{{expression.story}}` una descripción breve en español, `{{expression.inner}}` la voz interior del nivel y `{{expression.score}}` el número calculado.
- Cada nivel tiene además un campo `inner` (español): lo que la neo mujer se dice por dentro en ese ánimo. El editor de niveles lo incluye como **Voz interior**.

## Mente interior

La mente es un estado propio del personaje, no un adorno de la escena. Tiene dos capas:

**1. Mente declarada** (`data/characters/*.json` → `mind`): la ficha fija el punto de partida.

```json
"mind": {
  "voice": "cómo suena lo que se dice a sí misma",
  "contradiction": "lo que siente vs. lo que se permite",
  "secret": "lo que no dice en voz alta",
  "taboo": "lo que se prohíbe pensar",
  "arc": "en qué se está convirtiendo",
  "tags": ["negacion", "cuerpo"],
  "resist": ["entrega", "aceptacion"]
}
```

**2. Mente viva** (`state/session.json` → `characters[id].mind`): después de cada escena, `prompt_mind` devuelve un JSON con `pensamiento`, `deseo_privado`, `miedo`, `oculta`, `acepta`, `tags` y `resist`. Ese estado viaja al prompt de la escena siguiente en `{{current_mind}}` y `{{inner_memory}}`, y se guarda en cada entrada del historial.

**Cómo se nota en la historia:** `prompt_1` exige que al menos un tercio del texto sea experiencia interna, que cada escena tenga un giro interior (lo que piensa contradice o matiza lo que dice/hace) y que cierre con una decisión privada. `prompt_2` exige que al menos 4 líneas sean pensamientos de ella y que uno contradiga lo que acaba de decir en voz alta; además, el diálogo se escribe dentro del momento sexual de la escena: al menos dos tercios de las líneas nombran el acto o el deseo con vocabulario explícito, sin elipsis, y los pensamientos también están atravesados por el sexo.

**Cómo se nota en las estadísticas:** las escenas declaran `mindTags`; si una etiqueta coincide con `tags` hay **resonancia**, y si coincide con `resist` hay **fricción**. Las dos se suman a las estadísticas según `data/stats.json` → `mind`:

```json
"mind": {
  "enabled": true,
  "resonance": { "deseo": 1, "vínculo": 0.5 },
  "friction": { "ansiedad": 2, "obediencia": -0.5 }
}
```

- La elección de escena dentro de un concepto ya no es puramente aleatoria: pesa la resonancia/fricción con la mente actual y evita repetir la última escena.
- La barra lateral muestra el **Estado interior** (pensamiento, deseo, miedo, lo que oculta/acepta y etiquetas); el botón **✎** abre la ficha del personaje.
- Las tarjetas del historial muestran el pensamiento central y la resonancia/fricción de la escena.
- Vocabulario de etiquetas: `negacion`, `cuerpo`, `mirada_masculina`, `entrega`, `deseo`, `vinculo`, `ansiedad`, `calma`, `feminidad`, `secreto`, `control`, `ternura`, `aceptacion`, `conflicto`.

## Escenas

```json
{ "name": "La pastilla rosa", "concept": "ritual", "environment": "hogar", "aspect": "9:16",
  "master": ["hands"],
  "location": "EVA home, master bedroom", "description": "...",
  "effects": { "deseo": 5, "feminidad": 5, "obediencia": 5, "vínculo": 3, "ansiedad": -4 } }
```

**Conceptos:** cada escena puede tener un `concept` que las agrupa (p. ej. `ritual`, `hogar`, `compras`, `playa`, `fiesta`, `social`, `control`, `banos`). Los bloques horarios del personaje guardan un `concept` en vez de una escena, y al generar se elige una escena de ese concepto ponderando la **mente actual** (resonancia/fricción) y evitando repetir la última. En el selector de escena también aparecen los conceptos (`concept:<nombre>`) para probarlo a mano.

Cada escena puede declarar `mindTags` (vocabulario de la sección **Mente interior**) para indicar qué fibra toca: por ejemplo, una escena de entrega en la cama puede llevar `["cuerpo", "entrega", "secreto"]`.

Las escenas incluidas son explícitas y respetan las reglas del lorebook: el sexo cotidiano usa vías no conceptivas (oral, anal y entre los pechos) y la penetración vaginal solo aparece en **Día de concepción**. Si el modelo de imagen rechaza un prompt explícito, el avance se guarda igualmente con su historia y diálogo completos; la imagen queda marcada con `imageError`.

## Entornos

Un **entorno** es un elemento reutilizable (`data/environments/*.json`) que las escenas referencian por id (`"environment": "hogar"`). Se edita con **✎ Editar entorno** / **+ Entorno**.

```json
{ "name": "Hogar EVA", "description": "modern EVA couple's apartment, warm light...",
  "affinity": { "dulce": 0.5, "obediente": 0.5, "coqueta": 0.2, "ansiosa": -0.4 } }
```

- `description` se inserta en los prompts con `{{environment.description}}` (también `{{environment.name}}`).
- `affinity` dice cuánto le gusta (+) o incomoda (−) a cada **rasgo** de personalidad. Alimenta la fórmula de estadísticas.
- No se puede eliminar un entorno que alguna escena use.

## Estadísticas y fórmulas

En `data/stats.json`, cada estadística tiene su fórmula (`defaultFormula` si no se define). Variables: `base` (efecto de la escena), `affinity`, `current`, `min`, `max`; funciones `Math`, `min`, `max`.

Las estadísticas del mundo EVA son `deseo`, `feminidad`, `obediencia`, `vínculo` y `ansiedad`; la ansiedad usa una fórmula que reduce el efecto de los entornos que le disgustan.

`affinity` es la suma de lo que cada **rasgo** del personaje opina del entorno de la escena (campo `affinity` del entorno). Ejemplo: Luna es *dulce*, *obediente*, *coqueta* y *ansiosa*; en el hogar la afinidad es `0.5 + 0.5 + 0.2 − 0.4 = 0.8`, así que un efecto base de 5 en `deseo` se convierte en `5 * 1.8 = 9`.

Después de los efectos base, la **mente** suma su propia tensión: `mind.resonance` por cada etiqueta de la escena que coincide con la mente activa y `mind.friction` por cada etiqueta que la neo mujer resiste. Esos deltas se aplican antes de las reglas y aparecen en la lista de cambios de la escena. Los umbrales de las etiquetas derivadas de las estadísticas son: `feminidad ≤ 35` → `negacion`, `feminidad ≥ 70` → `feminidad`, `obediencia ≥ 65` → `entrega`, `deseo ≥ 70` → `deseo`, `vínculo ≥ 70` → `vinculo`, `ansiedad ≥ 60` → `ansiedad`, `ansiedad ≤ 25` → `calma`.

## Variables de entorno

`NANOGPT_API_KEY`, `NANOGPT_BASE_URL`, `NANOGPT_TEXT_MODEL`, `NANOGPT_IMAGE_MODEL`, `MASTER_NAME`, `PORT` (ver `.env.example`).
