// ─────────────────────────────────────────────
// nlp.js — Texturas (ES) v1.0
// Factory functions for Spanish NLP engines
// Reads: SFX_ES from config.js
// Exports: mkPOS, mkLem, mkSyn, mkSent
// ─────────────────────────────────────────────

// ── Vector Engine ──
// Loads word2vec/fastText vectors for semantic similarity.
// Supports Float16 quantized, optionally split into multiple files.
function mkVec() {
  var o = { v: {}, dim: 0, vocab: 0, _arr: null };

  o.load = function(vocabData, buffers) {
    o.dim = vocabData.dim;
    var dtype = vocabData.dtype || "float32";
    var combined;

    if (buffers.length === 1) {
      combined = buffers[0];
    } else {
      // Merge split buffers
      var totalLen = 0;
      for (var i = 0; i < buffers.length; i++) totalLen += buffers[i].byteLength;
      var merged = new Uint8Array(totalLen);
      var offset = 0;
      for (var j = 0; j < buffers.length; j++) {
        merged.set(new Uint8Array(buffers[j]), offset);
        offset += buffers[j].byteLength;
      }
      combined = merged.buffer;
    }

    // Convert Float16 to Float32 if needed
    if (dtype === "float16") {
      var u16 = new Uint16Array(combined);
      var f32 = new Float32Array(u16.length);
      for (var k = 0; k < u16.length; k++) {
        f32[k] = _f16ToF32(u16[k]);
      }
      o._arr = f32;
    } else {
      o._arr = new Float32Array(combined);
    }

    // Map words to indices
    var words = vocabData.vocab;
    for (var w in words) {
      if (words.hasOwnProperty(w)) {
        o.v[w] = words[w];
      }
    }
    o.vocab = Object.keys(o.v).length;
    return { vocab: o.vocab, dim: o.dim };
  };

  o.getVec = function(w) {
    var idx = o.v[w];
    if (idx === undefined || !o._arr) return null;
    return o._arr.subarray(idx * o.dim, (idx + 1) * o.dim);
  };

  o.has = function(w) { return o.v[w] !== undefined; };
  o.isLoaded = function() { return o.vocab > 0; };

  o.similarity = function(a, b) {
    var va = o.getVec(a), vb = o.getVec(b);
    if (!va || !vb) return 0;
    var dot = 0, na = 0, nb = 0;
    for (var i = 0; i < o.dim; i++) {
      dot += va[i] * vb[i];
      na += va[i] * va[i];
      nb += vb[i] * vb[i];
    }
    var denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom > 0 ? dot / denom : 0;
  };

  o.mostSimilar = function(w, topK, vocabFilter) {
    var vec = o.getVec(w);
    if (!vec) return [];
    var results = [];
    var filterSet = vocabFilter || null;
    for (var cand in o.v) {
      if (!o.v.hasOwnProperty(cand) || cand === w) continue;
      if (filterSet && !filterSet[cand]) continue;
      var cv = o.getVec(cand);
      var dot = 0, na = 0, nb = 0;
      for (var i = 0; i < o.dim; i++) {
        dot += vec[i] * cv[i];
        na += vec[i] * vec[i];
        nb += cv[i] * cv[i];
      }
      var denom = Math.sqrt(na) * Math.sqrt(nb);
      var sim = denom > 0 ? dot / denom : 0;
      results.push({ word: cand, sim: sim });
    }
    results.sort(function(a, b) { return b.sim - a.sim; });
    return results.slice(0, topK || 10);
  };

  return o;
}

// Float16 to Float32 conversion
function _f16ToF32(h) {
  var s = (h & 0x8000) >> 15;
  var e = (h & 0x7C00) >> 10;
  var f = h & 0x03FF;
  if (e === 0) {
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  } else if (e === 31) {
    return f ? NaN : (s ? -Infinity : Infinity);
  }
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

// ── POS Tagger ──
// Hybrid: lookup table (~60K entries) + Spanish suffix rules as fallback.
// POS tag set: n (noun), v (verb), a (adjective), r (adverb).
function mkPOS() {
  var o = { lk: null, ready: false };

  o.load = function(data) {
    o.lk = data;   // { word: "n"|"v"|"a"|"r", ... }
    o.ready = true;
  };

  o.tag = function(w) {
    var low = w.toLowerCase();
    // Lookup first
    if (o.lk && o.lk[low] != null) return o.lk[low];
    // Suffix fallback (SFX_ES from config.js)
    for (var i = 0; i < SFX_ES.length; i++) {
      if (low.length > SFX_ES[i][0].length && low.endsWith(SFX_ES[i][0])) {
        return SFX_ES[i][1];
      }
    }
    // Default
    return "n";
  };

  return o;
}

// ── Lemmatizer ──
// Pure lookup table from spaCy Spanish data (~400K–600K entries).
// Supports POS-informed lookup: tries "word#pos" first, then plain "word".
// Unknown words returned unchanged — no suffix stripping.
function mkLem() {
  var o = { lk: null, ready: false };

  o.load = function(data) {
    o.lk = data;   // { "caminos": "camino", "fue": "ir", "bajo#a": "bajo", "bajo#v": "bajar", ... }
    o.ready = true;
  };

  o.lemmatize = function(w, pos) {
    var low = w.toLowerCase();
    if (!o.lk) return low;

    // Try POS-qualified key first
    var posKey = low + "#" + pos;
    if (o.lk[posKey] != null) return o.lk[posKey];

    // Try plain key
    if (o.lk[low] != null) return o.lk[low];

    // Return unchanged
    return low;
  };

  return o;
}

// ── Synset Engine (WordNet) ──
// Open Multilingual Wordnet (Spanish) via NLTK.
// Same graph structure as English — relationships are synset-level.
function mkSyn() {
  var o = { d: null, ready: false };

  o.load = function(data) {
    o.d = data;    // { "word#pos": { hypernyms: [...], hyponyms: [...], meronyms: [...] }, ... }
    o.ready = true;
  };

  o.getRels = function(w, p) {
    if (!o.d) return { h: [], y: [], m: [] };
    var entry = o.d[w + "#" + p];
    if (!entry) return { h: [], y: [], m: [] };
    return {
      h: entry.hypernyms || [],
      y: entry.hyponyms || [],
      m: entry.meronyms || []
    };
  };

  o.allRels = function(w, p) {
    var r = o.getRels(w, p);
    var out = [];
    var i;
    for (i = 0; i < r.h.length; i++) out.push({ t: r.h[i], rel: "hyp\u2191" });
    for (i = 0; i < r.y.length; i++) out.push({ t: r.y[i], rel: "hyp\u2193" });
    for (i = 0; i < r.m.length; i++) out.push({ t: r.m[i], rel: "mer" });
    return out;
  };

  return o;
}

// ── Sentiment Scorer ──
// Lexicons: NRC EmoLex (ES), NRC Intensity (ES), NRC VAD (ES), SentiWordNet (via OMW).
// Polarity derived from VAD valence: (vadValence - 0.5) * 2 → maps to ±1 scale.
// NO VADER — replaced by NRC VAD valence.

var _sentCache = {};   // Module-level cache — persists across re-runs

function mkSent() {
  var o = {
    el: null,    // NRC EmoLex (ES)
    int: null,   // NRC Intensity (ES)
    vad: null,   // NRC VAD (ES) — { word: { v: 0-1, a: 0-1, d: 0-1 } }
    swn: null,   // SentiWordNet (via OMW synset IDs)
    ready: false
  };

  o.lEl = function(d) { o.el = d; o._check(); };
  o.lInt = function(d) { o.int = d; o._check(); };
  o.lVad = function(d) { o.vad = d; o._check(); };
  o.lSwn = function(d) { o.swn = d; o._check(); };

  o._check = function() {
    o.ready = !!(o.el || o.int || o.vad || o.swn);
  };

  o.score = function(lem, pos) {
    var cacheKey = lem + "#" + pos;
    if (_sentCache[cacheKey]) return _sentCache[cacheKey];

    var r = { lemma: lem, pos: pos };

    // NRC EmoLex
    if (o.el && o.el[lem]) r.emolex = o.el[lem];

    // NRC Intensity
    if (o.int && o.int[lem]) r.intensity = o.int[lem];

    // NRC VAD → also derive polarity from valence
    if (o.vad && o.vad[lem]) {
      r.vad = o.vad[lem];
      // Map VAD valence (0–1) to polarity (-1 to +1)
      r.polarity = (o.vad[lem].v - 0.5) * 2;
    }

    // SentiWordNet — try POS-qualified key, then any POS
    var swnKey = lem + "#" + pos;
    if (o.swn && o.swn[swnKey]) {
      r.swn = o.swn[swnKey];
    } else if (o.swn) {
      var poses = ["n", "v", "a", "r"];
      for (var i = 0; i < poses.length; i++) {
        var altKey = lem + "#" + poses[i];
        if (o.swn[altKey]) {
          r.swn = o.swn[altKey];
          break;
        }
      }
    }

    r.has = !!(r.emolex || r.intensity || r.vad || r.polarity !== undefined || r.swn);

    _sentCache[cacheKey] = r;
    return r;
  };

  o.clearCache = function() {
    _sentCache = {};
  };

  return o;
}
