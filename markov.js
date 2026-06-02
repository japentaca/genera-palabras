var path = require('path');
var fs = require('fs');
var MarkovGenerator = require('./public/lib/markov-core.js');

var args = process.argv.slice(2);
var jsonFile = args[0];
var count = parseInt(args[1], 10) || 5;
var groupSize = parseInt(args[2], 10) || 4;

if (!jsonFile) {
  console.error('Uso: node markov.js <archivo.json> [cantidad] [grupo]');
  console.error('  Ejemplo: node markov.js data/surreal.json 20 5');
  process.exit(1);
}

var dataPath = path.resolve(jsonFile);
if (!fs.existsSync(dataPath)) {
  console.error('Error: no se encuentra el archivo "' + dataPath + '"');
  process.exit(1);
}

var raw = fs.readFileSync(dataPath, 'utf-8');
var data = JSON.parse(raw);
var gen = new MarkovGenerator(data);

var frases = gen.generateMultiple(count);

frases.forEach(function (frase, i) {
  process.stdout.write(frase);
  var isLast = (i === frases.length - 1);
  if (!isLast && (i + 1) % groupSize === 0) {
    process.stdout.write('\n\n');
  } else if (!isLast) {
    process.stdout.write('\n');
  }
});
