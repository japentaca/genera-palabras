var fs = require('fs');
var path = require('path');
var MarkovGenerator = require('../lib/markov-core.js');

var passed = 0;
var failed = 0;
var failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error('  FAIL: ' + msg);
  }
}

function section(name) {
  console.log('\n== ' + name + ' ==');
}

// 1. El core expone la clase
section('Core');
var data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'data.json'), 'utf-8'));
var gen = new MarkovGenerator(data);
assert(typeof gen.generate === 'function', 'MarkovGenerator.generate es función');
assert(typeof gen.generateMultiple === 'function', 'MarkovGenerator.generateMultiple es función');
assert(typeof gen.walk === 'function', 'MarkovGenerator.walk es función');
assert(typeof gen.analyze === 'function', 'MarkovGenerator.analyze es función');
var analisis = gen.analyze();
assert(analisis.counts.s > 0, 'analyze() cuenta sujetos');
assert(analisis.terminals.length > 0, 'analyze() detecta terminales');

// 2. markov.js CLI
section('markov.js CLI');
var out1 = spawnSync('node', [path.resolve(__dirname, '..', 'markov.js'), 'data/data.json', '3', '2']);
assert(out1.status === 0, 'markov.js exit 0 (stderr: ' + out1.stderr.trim() + ')');
var lines1 = out1.stdout.split('\n').filter(Boolean);
assert(lines1.length === 3, 'markov.js produce 3 líneas (recibidas: ' + lines1.length + ')');
assert(lines1.every(function (l) { return l.length > 5; }), 'markov.js produce frases no vacías');

// 3. walk.js CLI
section('walk.js CLI');
var out2 = spawnSync('node', [path.resolve(__dirname, '..', 'walk.js'), 'data/surreal.json', '20', '1', '1']);
assert(out2.status === 0, 'walk.js exit 0 (stderr: ' + out2.stderr.trim() + ')');
assert(out2.stdout.trim().length > 0, 'walk.js produce salida no vacía');

// 4. song.js CLI
section('song.js CLI');
var cacheFile = path.resolve(__dirname, '..', 'data', 'songs', 'smoke_test.json');
if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
var out3 = spawnSync('node', [path.resolve(__dirname, '..', 'song.js'), 'data/surreal.json', '--name', 'smoke_test']);
assert(out3.status === 0, 'song.js exit 0 (stderr: ' + out3.stderr.trim() + ')');
assert(fs.existsSync(cacheFile), 'song.js crea data/songs/smoke_test.json');
var song = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
assert(song.nombre === 'smoke_test', 'song.nombre correcto');
assert(Array.isArray(song.estructura) && song.estructura.length > 0, 'song.estructura es array no vacío');
assert(song.secciones && Object.keys(song.secciones).length > 0, 'song.secciones tiene contenido');

// 5. Idempotencia: con --name y misma estructura, debe devolver la misma canción cacheada
section('Idempotencia song.js');
var out4 = spawnSync('node', [path.resolve(__dirname, '..', 'song.js'), 'data/surreal.json', '--name', 'smoke_test']);
var song2 = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
assert(song2.nombre === song.nombre, 'mismo nombre en segunda ejecución');
var mismoContenido = JSON.stringify(song.secciones) === JSON.stringify(song2.secciones);
assert(mismoContenido, 'secciones idénticas en segunda ejecución (cache hit)');

// 6. --regen regenera
section('song.js --regen');
var out5 = spawnSync('node', [path.resolve(__dirname, '..', 'song.js'), 'data/surreal.json', '--name', 'smoke_test', '--regen']);
assert(out5.status === 0, 'song.js --regen exit 0');

// 7. Limpieza
if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);

function spawnSync(cmd, args) {
  var spawn = require('child_process').spawnSync;
  return spawn(cmd, args, { encoding: 'utf-8' });
}

console.log('\n== Resultado ==');
console.log('  Pasados: ' + passed);
console.log('  Fallados: ' + failed);
if (failed > 0) {
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('  OK');
process.exit(0);
