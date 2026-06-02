var MarkovGenerator = (function () {
  function MarkovGenerator(data) {
    this.data = data;
    this.ids = Object.keys(data);
  }

  // Detecta género a partir de un segmento de sujeto
  MarkovGenerator.prototype._detectarGenero = function (segmento) {
    var s = segmento.toLowerCase();
    if (/^(la|una|aquella|esa|alguna|ninguna|cualquiera|esta|nuestra|vuestra|dicha)\b/.test(s)) return 'F';
    if (/^(el|un|aquel|ese|algún|ningún|cualquier|este|nuestro|vuestro|dicho)\b/.test(s)) return 'M';
    // Fallback: mirar palabras clave (sujeto sin determinante claro, p.ej. "Mi ...")
    // Las palabras se buscan como palabras completas (\b) para no confundir
    // "ala" con el interior de "escala" o "pata" con "patas".
    var fWords = ['la', 'una', 'aquella', 'esa', 'sombra', 'gata', 'loba', 'mariposa', 'sirena', 'vaca', 'cerda', 'oveja', 'lechuza', 'serpiente', 'mosca', 'tarántula', 'orca', 'foca', 'amapola', 'rosa', 'estrella', 'luna', 'noche', 'tormenta', 'niebla', 'carne', 'sangre', 'pústula', 'verruga', 'puta', 'ramera', 'loca', 'bacante', 'musa', 'vidente', 'fémina', 'mujer', 'diosa', 'reina', 'emperatriz', 'crisálida', 'nebulosa', 'libélula', 'bruja', 'ciruela', 'cabra', 'fénix', 'cometa', 'cicatriz', 'esfinge', 'teta', 'nalga', 'panza', 'barriga', 'caca', 'flema', 'resina', 'orina', 'heces', 'baba', 'cucaracha', 'mantis', 'langosta', 'medusa', 'gárgola', 'mucosidad', 'savia', 'escarcha', 'nieve', 'mamas', 'amígdalas', 'uñas', 'tripas', 'gónadas', 'crestas', 'cerezas', 'nubes', 'hormigas', 'abejas', 'avispas', 'hienas', 'vírgenes', 'novias', 'esposas', 'damas', 'cortisona', 'fractura', 'herida', 'muela', 'lengua', 'oreja', 'pata', 'ala', 'cigüeña', 'cigüeñas', 'mariquita', 'nutria', 'mantarraya', 'marsopa', 'alba', 'parca', 'arpía', 'grajilla', 'hidra', 'polla', 'equidna', 'dríada', 'calina', 'momia', 'mierda', 'ballena', 'comadreja', 'lagartija', 'adivina', 'buganvilla', 'moira', 'energúmena', 'salamanquesa', 'tiniebla', 'ánima', 'hortensia', 'mantícora', 'ardilla', 'perra', 'luciérnaga', 'hechicera', 'zorra', 'quimera', 'águila', 'ondina', 'aurora', 'cortesana', 'posesa', 'sacerdotisa', 'furia', 'ninfa', 'polilla', 'yegua', 'placenta', 'anémona', 'diablesa', 'lluvia', 'orquídea', 'almeja', 'porquería', 'doncella', 'paloma', 'azucena', 'bruma', 'urraca', 'gallina', 'garza'];
    // Usamos \p{L} con flag u para que el "word boundary" reconozca letras
    // acentuadas (á, é, í, ó, ú, ñ, ü) como caracteres de palabra; \b estándar
    // en JS es ASCII-only y rompe palabras como "psicópata" en "psic" + "pata".
    var fWordsRe = new RegExp('(?!\\p{L})(' + fWords.join('|') + ')(?!\\p{L})', 'iu');
    if (fWordsRe.test(s)) return 'F';
    return 'M';
  };

  // Devuelve el string del segmento según el género actual
  MarkovGenerator.prototype._renderSegmento = function (nodo, genero) {
    var seg = nodo.segmento;
    if (typeof seg === 'string') return seg;
    if (seg && typeof seg === 'object') {
      if (genero && seg[genero]) return seg[genero];
      return seg.M || seg.F || '';
    }
    return '';
  };

  MarkovGenerator.prototype.generate = function (startId) {
    var currentId = startId || this._pickStart();
    var resultado = [];
    var genero = null;

    while (currentId && this.data[currentId]) {
      var nodo = this.data[currentId];
      var tipo = currentId[0]; // s, a, v, c

      // Detectar género en sujetos
      if (tipo === 's') {
        genero = this._detectarGenero(nodo.segmento);
      }

      resultado.push(this._renderSegmento(nodo, genero));

      var transiciones = nodo.transiciones;
      if (!transiciones || Object.keys(transiciones).length === 0) {
        break;
      }

      currentId = this._weightedPick(transiciones);
    }

    return resultado.join(' ');
  };

  MarkovGenerator.prototype.generateMultiple = function (n) {
    var frases = [];
    for (var i = 0; i < n; i++) {
      frases.push(this.generate());
    }
    return frases;
  };

  // Recorre el grafo hasta dar `minSteps` saltos (un salto = cada nodo).
  // Devuelve { sentences: [str], texto: str, pasos, sujetos, terminales, longitudes, tipos }
  // Una "oración" nueva arranca cuando se entra a un nodo s, EXCEPTO si el
  // anterior fue un p (puente), porque p está hecho para enlazar cláusulas.
  // Cada oración debe comenzar con un nodo s o i (nodo de inicio válido);
  // si no, se descarta y se elige otro.
  MarkovGenerator.prototype.walk = function (minSteps) {
    var min = minSteps || 12;
    var sentences = [];
    var currentSent = [];
    var pasos = 0;
    var sujetos = 0;
    var terminales = 0;
    var longitudes = [];
    var tipos = { s: 0, a: 0, v: 0, m: 0, p: 0, c: 0, i: 0 };
    var currentId = this._pickSentenceStart();
    var genero = null;
    var segActualLen = 0;
    var prevTipo = null;

    var cerrar = function () {
      if (currentSent.length > 0) {
        var s = currentSent.join(' ').replace(/\s+/g, ' ').trim();
        if (s) sentences.push(s);
        currentSent = [];
        segActualLen = 0;
      }
    };

    while (pasos < min) {
      var nodo = this.data[currentId];
      if (!nodo) {
        currentId = this._pickSentenceStart();
        prevTipo = null;
        continue;
      }
      var tipo = currentId[0];
      tipos[tipo] = (tipos[tipo] || 0) + 1;

      // Nueva oración si entramos a un s y el anterior NO fue un p
      if (tipo === 's' && prevTipo !== null && prevTipo !== 'p') {
        cerrar();
      }

      // Si la oración actual está vacía y el nodo no es un inicio válido, lo
      // descartamos (no contribuimos al conteo de pasos para no distorsionar)
      if (currentSent.length === 0 && tipo !== 's' && tipo !== 'i') {
        currentId = this._pickSentenceStart();
        prevTipo = null;
        continue;
      }

      if (tipo === 's') {
        genero = this._detectarGenero(nodo.segmento);
        sujetos++;
      }

      var seg = this._renderSegmento(nodo, genero);
      currentSent.push(seg);
      pasos++;
      segActualLen++;

      var trans = nodo.transiciones;
      if (!trans || Object.keys(trans).length === 0) {
        // Terminal: cierra la oración y arranca desde un nodo de inicio válido
        terminales++;
        longitudes.push(segActualLen);
        cerrar();
        currentId = this._pickSentenceStart();
        prevTipo = null;
        continue;
      }
      prevTipo = tipo;
      currentId = this._weightedPick(trans);
    }
    cerrar();

    return {
      sentences: sentences,
      texto: sentences.join(' '),
      pasos: pasos,
      sujetos: sujetos,
      terminales: terminales,
      longitudes: longitudes,
      tipos: tipos
    };
  };

  MarkovGenerator.prototype._pickStart = function () {
    var starts = this.ids.filter(function (id) { return id[0] === 's'; });
    if (starts.length === 0) { starts = this.ids; }
    return starts[Math.floor(Math.random() * starts.length)];
  };

  // Igual que _pickStart pero elige un nodo de cualquier tipo.
  // La distribución favorece sujetos (40%) pero reparte el resto entre
  // adjetivos, verbos, adverbios, complementos e interjecciones para que
  // la caminata arranque sin estructura fija.
  MarkovGenerator.prototype._pickAny = function () {
    var r = Math.random();
    var tipo;
    if (r < 0.40) tipo = 's';
    else if (r < 0.55) tipo = 'a';
    else if (r < 0.70) tipo = 'v';
    else if (r < 0.80) tipo = 'm';
    else if (r < 0.92) tipo = 'c';
    else tipo = 'i';
    var pool = this.ids.filter(function (id) { return id[0] === tipo; });
    if (pool.length === 0) pool = this.ids;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // Elige un nodo que pueda arrancar una oración: s (sujeto) o i (interjección).
  MarkovGenerator.prototype._pickSentenceStart = function () {
    var r = Math.random();
    var pool;
    if (r < 0.85) {
      pool = this.ids.filter(function (id) { return id[0] === 's'; });
    } else {
      pool = this.ids.filter(function (id) { return id[0] === 'i'; });
    }
    if (pool.length === 0) pool = this.ids;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  MarkovGenerator.prototype._weightedPick = function (transiciones) {
    var rand = Math.random();
    var acumulado = 0;

    for (var id in transiciones) {
      if (!transiciones.hasOwnProperty(id)) { continue; }
      acumulado += transiciones[id];
      if (rand < acumulado) {
        return id;
      }
    }

    var claves = Object.keys(transiciones);
    return claves[claves.length - 1];
  };

  // Analiza el dataset: conteo por tipo, terminales (sin transiciones),
  // adjetivos con segmento string (sin concordancia M/F).
  MarkovGenerator.prototype.analyze = function () {
    var counts = {};
    var terminals = [];
    var adjetivosSinGenero = [];
    var self = this;
    this.ids.forEach(function (id) {
      var t = id[0];
      counts[t] = (counts[t] || 0) + 1;
      var n = self.data[id];
      if (!n.transiciones || Object.keys(n.transiciones).length === 0) {
        terminals.push({ id: id, segmento: self._renderSegmento(n, 'M') });
      }
      if (t === 'a' && typeof n.segmento === 'string') {
        adjetivosSinGenero.push(id);
      }
    });
    return { counts: counts, terminals: terminals, adjetivosSinGenero: adjetivosSinGenero };
  };

  return MarkovGenerator;
})();

(function () {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkovGenerator;
  } else if (typeof window !== 'undefined') {
    window.MarkovGenerator = MarkovGenerator;
  }
})();
