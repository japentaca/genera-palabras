var fs = require('fs');
var path = require('path');
var MarkovGenerator = require('./public/lib/markov-core.js');

var args = process.argv.slice(2);
var jsonFile = args[0];
var steps = parseInt(args[1], 10) || 20;
var count = parseInt(args[2], 10) || 5;
var groupSize = parseInt(args[3], 10) || 4;

if (!jsonFile) {
  console.error('Uso: node walk.js <archivo.json> [pasos] [cantidad] [grupo]');
  console.error('  Ejemplo: node walk.js data/surreal.json 30 6 4');
  process.exit(1);
}

var dataPath = path.resolve(jsonFile);
if (!fs.existsSync(dataPath)) {
  console.error('Error: no se encuentra el archivo "' + dataPath + '"');
  process.exit(1);
}

var data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
var gen = new MarkovGenerator(data);

// Finaliza una oración: agrega "." si no termina en signo de puntuación
function finalizar(s) {
  s = (s || '').trim();
  if (!s) return '';
  var last = s.charAt(s.length - 1);
  if (last === '.' || last === ',' || last === ';' || last === '!' || last === '?') {
    return s;
  }
  return s + '.';
}

for (var i = 0; i < count; i++) {
  var w = gen.walk(steps);
  w.sentences.forEach(function (s, j) {
    process.stdout.write(finalizar(s) + '\r\n');
    // Línea en blanco cada N oraciones (excepto al final)
    if ((j + 1) % groupSize === 0 && !(i === count - 1 && j === w.sentences.length - 1)) {
      process.stdout.write('\r\n');
    }
  });
  if (i !== count - 1) {
    process.stdout.write('\r\n');
  }
}
