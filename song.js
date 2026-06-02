var fs = require('fs');
var path = require('path');
var MarkovGenerator = require('./lib/markov-core.js');

var DEFAULT_STRUCTURE = ['verse', 'verse', 'chorus', 'verse', 'verse', 'chorus', 'bridge', 'chorus'];

// Oraciones estimadas por tag. Se usan para dimensionar el walk único y
// para repartir las oraciones en secciones. ~5 pasos de walk por oración.
var ORACIONES_POR_TAG = {
  verse: 6,
  chorus: 4,
  bridge: 4,
  intro: 3,
  outro: 3,
  prechorus: 4,
  hook: 3
};
var DEFAULT_ORACIONES = 4;
var PASOS_POR_ORACION = 5;
var MIN_STEPS = 12;

function parseArgs(argv) {
  var args = argv.slice(2);
  var opts = {
    file: args[0],
    structure: null,
    name: null,
    regen: false,
    format: 'text',
    overrides: null
  };
  for (var i = 1; i < args.length; i++) {
    var a = args[i];
    if (a === '--regen' || a === '--new' || a === '-r') opts.regen = true;
    else if (a === '--json') opts.format = 'json';
    else if (a === '--plain') opts.format = 'plain';
    else if (a === '--name' || a === '-n') opts.name = args[++i];
    else if (a === '--steps' && args[i + 1]) {
      var map = {};
      args[++i].split(',').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv.length === 2) map[kv[0]] = parseInt(kv[1], 10);
      });
      opts.overrides = map;
    }
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (a[0] === '-') { console.error('Flag desconocida: ' + a); process.exit(1); }
    else if (!opts.structure) opts.structure = a;
  }
  if (!opts.structure) opts.structure = DEFAULT_STRUCTURE.slice();
  else opts.structure = opts.structure.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return opts;
}

function printHelp() {
  console.log('Uso: node song.js <archivo.json> [estructura] [opciones]');
  console.log('');
  console.log('  estructura   Secuencia de tags separados por coma. Default:');
  console.log('               ' + DEFAULT_STRUCTURE.join(','));
  console.log('');
  console.log('Opciones:');
  console.log('  -n, --name <id>   Nombre/ID de la canción. Con el mismo id se');
  console.log('                    devuelve siempre la misma canción (cache).');
  console.log('                    Sin --name se genera un id aleatorio nuevo');
  console.log('                    cada vez.');
  console.log('  -r, --regen       Regenera la canción ignorando el cache.');
  console.log('      --json        Imprime la canción en JSON en vez de texto.');
  console.log('      --plain       Imprime solo el texto sin tags ni encabezado.');
  console.log('      --steps t=n   Pasos de walk por tag. Ej: --steps verse=40,chorus=20');
  console.log('  -h, --help        Muestra esta ayuda.');
  console.log('');
  console.log('Hace UN SOLO walk y reparte las oraciones en las secciones, así');
  console.log('la cadena de Markov se preserva a lo largo de toda la canción.');
  console.log('Los tags se cachean por nombre: dentro de una misma canción, el');
  console.log('mismo tag aparece con el mismo texto en todas sus ocurrencias.');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function cacheDir() { return path.resolve('data', 'songs'); }
function cachePath(name) { return path.join(cacheDir(), name + '.json'); }

function loadCache(name) {
  var p = cachePath(name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { return null; }
}

function saveCache(song) {
  ensureDir(cacheDir());
  fs.writeFileSync(cachePath(song.nombre), JSON.stringify(song, null, 2), 'utf-8');
}

function randomId() {
  var ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  var rnd = Math.random().toString(36).slice(2, 7);
  return 'song_' + ts + '_' + rnd;
}

function oracionesPara(tag, overrides) {
  if (overrides && overrides[tag] != null) return Math.max(1, overrides[tag]);
  return ORACIONES_POR_TAG[tag] || DEFAULT_ORACIONES;
}

function finalizar(s) {
  s = (s || '').trim();
  if (!s) return '';
  var last = s.charAt(s.length - 1);
  if (last === '.' || last === ',' || last === ';' || last === '!' || last === '?' || last === ':') return s;
  return s + '.';
}

function repartir(estructura, sentences, overrides) {
  // Devuelve { tag: [oraciones] }. Cada tag único toma oracionesPara(tag)
  // del pool UNA sola vez; al renderizar, cada [tag] en la estructura se
  // sirve desde la misma bolsa, así las N apariciones son idénticas.
  var needed = {};
  estructura.forEach(function (t) {
    if (needed[t] == null) needed[t] = oracionesPara(t, overrides);
  });

  var pool = sentences.map(finalizar).filter(Boolean).slice();
  var secciones = {};
  var cursor = 0;
  Object.keys(needed).forEach(function (t) {
    var take = Math.min(needed[t], Math.max(0, pool.length - cursor));
    secciones[t] = pool.slice(cursor, cursor + take);
    cursor += take;
  });
  return secciones;
}

function totalSteps(estructura, overrides) {
  // Un walk por tag único, no por aparición en la estructura.
  var seen = {};
  var total = 0;
  estructura.forEach(function (t) {
    if (seen[t]) return;
    seen[t] = true;
    total += oracionesPara(t, overrides) * PASOS_POR_ORACION;
  });
  return Math.max(MIN_STEPS, total);
}

function generarCancion(opts) {
  if (!opts.file) {
    console.error('Error: falta el archivo JSON.');
    console.error('  Uso: node song.js <archivo.json> [estructura] [opciones]');
    process.exit(1);
  }
  var dataPath = path.resolve(opts.file);
  if (!fs.existsSync(dataPath)) {
    console.error('Error: no se encuentra "' + dataPath + '"');
    process.exit(1);
  }

  var data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  var gen = new MarkovGenerator(data);

  var name = opts.name || randomId();
  var existing = opts.regen ? null : loadCache(name);
  var mismaEstructura = existing &&
    existing.estructura.length === opts.structure.length &&
    existing.estructura.every(function (t, i) { return t === opts.structure[i]; });

  if (existing && mismaEstructura) return existing;

  // UN solo walk: la cadena de Markov se preserva a lo largo de toda la canción.
  var steps = totalSteps(opts.structure, opts.overrides);
  var w = gen.walk(steps);
  var secciones = repartir(opts.structure, w.sentences, opts.overrides);

  var song = {
    nombre: name,
    archivo: opts.file,
    estructura: opts.structure,
    pasos: steps,
    oraciones: w.sentences.length,
    secciones: secciones
  };
  saveCache(song);
  return song;
}

function renderText(song) {
  var lines = [];
  lines.push('=== ' + song.nombre + ' ===');
  song.estructura.forEach(function (t) {
    lines.push('');
    lines.push('[' + t + ']');
    var ors = song.secciones[t] || [];
    if (ors.length === 0) lines.push('(sin oraciones)');
    ors.forEach(function (o) { lines.push(o); });
  });
  return lines.join('\n');
}

function renderPlain(song) {
  var blocks = song.estructura.map(function (t) {
    return (song.secciones[t] || []).join(' ');
  });
  return blocks.filter(Boolean).join('\n\n');
}

function main() {
  var opts = parseArgs(process.argv);
  var song = generarCancion(opts);
  if (opts.format === 'json') console.log(JSON.stringify(song, null, 2));
  else if (opts.format === 'plain') console.log(renderPlain(song));
  else console.log(renderText(song));
}

if (require.main === module) main();

module.exports = {
  DEFAULT_STRUCTURE: DEFAULT_STRUCTURE,
  ORACIONES_POR_TAG: ORACIONES_POR_TAG,
  generarCancion: generarCancion,
  renderText: renderText,
  renderPlain: renderPlain
};
