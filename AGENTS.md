# Genera Palabras — Generador de frases por cadena de Markov

Proyecto que genera frases aleatorias usando cadenas de Markov a partir de un grafo de palabras definido en formato JSON.

## Estructura

```
genera_palabras/
├── src/
│   └── pages/
│       └── index.astro  # Interfaz web (4 modos) — migrada de root/index.html
├── public/              # Assets estáticos servidos en la raíz del sitio
│   ├── lib/
│   │   └── markov-core.js   # MarkovGenerator (UMD: browser + node)
│   └── data/
│       ├── data.json        # Dataset original (frases cotidianas, ~30 nodos)
│       ├── surreal.json     # Dataset surrealista atómico (~1300 nodos)
│       └── songs/           # Canciones generadas cacheadas (auto, no editar)
├── test/
│       └── smoke.cjs        # Smoke test de las 3 CLIs (CommonJS por el `"type": "module"` del root)
├── markov.js            # CLI de frases sueltas
├── walk.js              # CLI de walk libre (caminatas de N pasos)
├── song.js              # CLI de canciones estructuradas con tags
├── package.json         # Dependencias (Astro)
├── astro.config.mjs     # Config de Astro (output: static)
├── _headers             # Cache-Control por tipo de asset
└── AGENTS.md
```

## Cómo funciona

Cada archivo JSON define un grafo dirigido con pesos donde los nodos representan fragmentos de frase (sujetos, adjetivos, verbos, complementos). El generador recorre el grafo siguiendo transiciones ponderadas aleatoriamente hasta llegar a un nodo terminal (sin transiciones).

El motor detecta el género del sujeto a partir del determinante inicial ("El/Un" → masculino, "La/Una" → femenino) y propaga ese género para que los adjetivos concuerden. Por eso los nodos `a` de `surreal.json` almacenan el segmento como objeto `{M, F}` en vez de como string plano.

Toda la lógica de Markov vive en `public/lib/markov-core.js` (clase `MarkovGenerator`). Las tres CLIs (`markov.js`, `walk.js`, `song.js`) y la UI (`src/pages/index.astro`) la importan. El core es UMD: expone `module.exports` en Node y `window.MarkovGenerator` en browser.

### Formato de los datos JSON

Cada clave del objeto es un ID de nodo. La convención de prefijos es:
- `s` — sujeto (nodo de inicio): determinante + núcleo atómico ("La mosca", "El hipogrifo"). No incluye adjetivos.
- `a` — adjetivo atómico (un solo adjetivo, no frase): el segmento se guarda como `{ "M": "...", "F": "..." }` para que el motor elija la forma correcta según el género del sujeto.
- `v` — verbo (3ª persona, puede ser una forma verbal o una frase verbal breve).
- `c` — complemento (nodo terminal, sin transiciones): frase preposicional corta.
- `m` — modo/adverbio (gerundios, locuciones, estados).
- `p` — puente preposicional: enlaza cláusulas ("pensando en", "mirando a"). Solo transiciona a `s`.
- `i` — interjección/conector: puede funcionar como arranque de oración.

```json
{
  "s001": {
    "segmento": "El hipogrifo crepuscular",
    "transiciones": { "a001": 0.20, "v003": 0.10 }
  },
  "a001": {
    "segmento": { "M": "abracadabrante", "F": "abracadabrante" },
    "transiciones": { "v001": 0.22, "v004": 0.18 }
  },
  "c001": {
    "segmento": "en el espejo convexo"
  }
}
```

## Uso

### CLI

```bash
node markov.js public/public/data/surreal.json 10     # genera 10 frases surrealistas
node markov.js public/data/data.json 5         # genera 5 frases cotidianas
node walk.js public/public/data/surreal.json 30 5 3   # 5 caminatas de 30 pasos, grupo 3
node song.js public/public/data/surreal.json          # canción con estructura default
```

### Web (Astro)

La UI es una interfaz IDE-like con 4 modos (Frases, Walk, Canción, Dataset), selector de dataset (con fallback automático a `surreal.json`), historial en `localStorage`, atajos de teclado, inspector del dataset y descarga de canciones como JSON.

**Dev con hot reload:**
```bash
npm install
npm run dev              # http://localhost:4321
```

**Build de producción (mismo output que Pages):**
```bash
npm run build            # genera dist/
npm run preview          # http://localhost:4321 sirviendo dist/
```

Si abrís el sitio con doble clic sobre `dist/index.html` (`file://`) el `fetch` falla. La UI detecta y sugiere el comando para servir. Alternativa: el botón "examinar…" permite cargar un `.json` local sin servidor.

**Atajos:** `Ctrl+Enter` ejecuta el modo activo · `Ctrl+L` limpia · `Ctrl+D` toggle tema · `Ctrl+Shift+T` prueba el motor (100 walks).

**Tabs:**
- **Frases** — Cantidad + Grupo. Equivale a `markov.js <file> <n> <g>`.
- **Walk** — Pasos + Caminatas + Grupo. Equivale a `walk.js <file> <pasos> <count> <g>`.
- **Canción** — Estructura (chips) + Nombre + Formato (texto/JSON/plain) + Overrides (`tag=pasos`). Botón "Descargar" guarda el JSON en `public/data/songs/<nombre>.json` (convención de la CLI).
- **Dataset** — Inspector: conteo por tipo, terminales, búsqueda de nodos, prueba del motor.

**Limitación conocida:** el browser no puede escribir a `public/data/songs/` directamente, así que la UI siempre regenera canciones. Si querés persistir, usá "Descargar" y arrastrá el archivo a la carpeta.

### Canciones estructuradas (CLI)

`node song.js` hace **un solo** `gen.walk()` dimensionado para la estructura
dada y reparte las oraciones resultantes en cada tag. Así la cadena de Markov
se preserva a lo largo de toda la canción en vez de resetearse por sección.
La estructura por defecto es `[verse,verse,chorus,verse,verse,chorus,bridge,chorus]`.

```bash
node song.js public/data/surreal.json                              # nueva canción random
node song.js public/data/surreal.json --name mi_tema              # cachea como "mi_tema"
node song.js public/data/surreal.json "intro,verse,chorus,outro"   # estructura custom
node song.js public/data/surreal.json --name mi_tema --regen      # regenerar ignorando cache
node song.js public/data/surreal.json --steps verse=40,chorus=20   # ajustar largo por tag
node song.js public/data/surreal.json --name mi_tema --json       # salida JSON
node song.js public/data/surreal.json --name mi_tema --plain      # texto plano sin tags
```

Con `--name` el mismo id siempre devuelve la misma canción. Dentro de la
canción, el mismo tag (ej. `[chorus]`) aparece con el mismo texto en todas sus
ocurrencias. Sin `--name` se autogenera un id nuevo cada vez.

## Tests

```bash
node test/smoke.cjs
```

Smoke test que verifica: la clase core, las 3 CLIs (exit 0 + output no vacío), la creación de cache en `song.js`, la idempotencia del cache con `--name`, y la regeneración con `--regen`. Limpia su cache de prueba al final.

## Comandos útiles

```bash
node markov.js public/data/surreal.json 10    # 10 frases
node walk.js public/data/surreal.json 80 4    # caminata libre de 80 saltos, 4 caminatas
node song.js public/data/surreal.json         # canción con estructura default
node test/smoke.cjs                     # smoke test
```

## Consejos (lecciones aprendidas armando surreal.json)

Al poblar un dataset para Markov conviene respetar algunas reglas que se hacen evidentes sólo cuando el output ya no convence:

- **Lo más atómico, mejor.** Los nodos no deben ser "frases con adjetivo incluido". El sujeto debe ser solo `determinante + núcleo` ("La mosca", no "La mosca azul"). Esto multiplica las combinaciones y permite reusar adjetivos en cualquier sujeto.
- **Adjetivos con género.** Guardar el `segmento` del adjetivo como `{ "M": "...", "F": "..." }` y detectar el género desde el determinante del sujeto es la forma más barata de tener concordancia. Si no se hace, el output se llena de "el hembra misterioso" y rompe la inmersión.
- **Cuidado con los terminales duros.** Si los `c` siempre son nodos sin transiciones, toda caminata termina abruptamente y se nota el corte. Darles a *algunos* `c` transiciones a otros `c` (encadenar frases preposicionales) o a un `s` (reiniciar sujeto) hace la prosa orgánica.
- **Intercalar adverbios / modos.** Un esqueleto rígido `s → a → v → c` se vuelve detectable al segundo vistazo. Agregar un tipo `m` (modo/adverbio: gerundios, locuciones, estados) al que los `v` apunten a veces, y que el `m` apunte a otros `m` o a `c`, rompe el patrón sin agregar lógica.
- **Permitir inicios libres.** Limitar el arranque a nodos `s` hace que *cada* caminata empiece con "El/La/Un/Una…". Conviene agregar interjecciones / conectores / adverbios sueltos (tipo `i`) y un picker ponderado que arranque desde cualquier tipo de nodo. El resultado se siente stream-of-consciousness en vez de "frase gramatical".
- **Mezclar `c` con y sin preposición.** Si todos los complementos empiezan con "en/sobre/con/…", el patrón se huele. Conviene intercalar adverbios puros ("aquí", "temblando", "sin cesar", "borracho") entre los complementos preposicionales.
- **Pesos aproximados, no obsesivos.** El motor acepta cualquier peso no-negativo y no requiere que sumen 1. Con un patrón "0.20, 0.17, 0.14, 0.10" basta para mantener la distribución sesgada hacia las primeras opciones. Normalizar es opcional.
- **El Markov no valida semántica.** Frases como "el hipogrifo defeca oropel" o "un topo se ahoga con un consolador" salen *porque se puede*, no porque tengan sentido. Eso es feature, no bug, en este proyecto.
- **Las cláusulas adverbiales "cierran" una oración.** Locuciones como `"como un poseso"`, `"sin tregua"`, `"de repente"`, `"como si nada"` funcionan semánticamente como cláusulas independientes: el caminante siente que *ahí* empieza una oración nueva. Aprovechalo: darle a esos `m` una transición a un `s` (sujeto nuevo) hace que la prosa fluya como enumeración de cláusulas en vez de como frase larga. El efecto stream-of-consciousness aparece solo, sin lógica extra.
- **Gerundios preposicionales como puentes.** Un tipo de nodo dedicado — `p` — con segmentos como `"pensando en"`, `"mirando a"`, `"acordándose de"`, `"huyendo de"`, `"buscando a"` es el puente natural de la prosa narrativa: cierra una cláusula y abre otra con un sujeto nuevo. **Importante**: el `p` debe transicionar *solo* a `s` (nunca a `m`/`c`), porque si el siguiente nodo ya empieza con preposición se duplica (`"pensando en en la vida..."`). Esa restricción es lo que hace que `"pensando en La mosca come"` funcione y `"pensando en en la vida"` no.
