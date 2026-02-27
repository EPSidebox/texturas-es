// ─────────────────────────────────────────────
// analyze.js — Texturas (ES) v1.0
// Two-stage analysis pipeline, spreading activation, Louvain communities
// Reads: STOP_WORDS_ES, NEGATION_ES, EMOTIONS from config.js
// Reads: mkPOS, mkLem, mkSyn, mkSent from nlp.js
// Exports: analyze, spreadAct, pairAct, synDist, getNg,
//          expandSeeds, computeWeave, computeUnionTerms,
//          findPassages, computeStackWeave
// ─────────────────────────────────────────────

// ── Tokenizer (Unicode-aware for Spanish) ──
var _tokRe = /([\wáéíóúñüÁÉÍÓÚÑÜ'-]+)|(\s+)|([^\wáéíóúñüÁÉÍÓÚÑÜ\s'-]+)/g;

function tokenize(text) {
  var t = text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  var result = [];
  var m;
  _tokRe.lastIndex = 0;
  while ((m = _tokRe.exec(t)) !== null) {
    if (m[1]) { result.push({ raw: m[1], type: "w" }); }
    else if (m[2]) {
      if (m[2].indexOf("\n\n") >= 0 || m[2].indexOf("\r\n\r\n") >= 0) { result.push({ raw: m[2], type: "p" }); }
      else { result.push({ raw: m[2], type: "s" }); }
    } else if (m[3]) { result.push({ raw: m[3], type: "x" }); }
  }
  return result;
}

// ── Frequency helpers ──
function getFreqs(arr) {
  var counts = {};
  var i;
  for (i = 0; i < arr.length; i++) { counts[arr[i]] = (counts[arr[i]] || 0) + 1; }
  var pairs = [];
  var k;
  for (k in counts) { if (counts.hasOwnProperty(k)) pairs.push([k, counts[k]]); }
  pairs.sort(function(a, b) { return b[1] - a[1]; });
  return pairs;
}

function getNg(tokens, n) {
  var grams = [];
  var i;
  for (i = 0; i <= tokens.length - n; i++) {
    var parts = [];
    for (var k = 0; k < n; k++) parts.push(tokens[i + k]);
    grams.push(parts.join(" "));
  }
  return getFreqs(grams);
}

// ── Louvain Community Detection ──
function louvain(fMap, coocMatrix, topWords) {
  var words = topWords.map(function(p) { return p[0]; });
  var n = words.length;
  if (n === 0) return {};
  var idx = {};
  var i, j;
  for (i = 0; i < n; i++) idx[words[i]] = i;
  var adj = [];
  for (i = 0; i < n; i++) { adj.push(new Float64Array(n)); }
  var totalW = 0;
  for (i = 0; i < n; i++) {
    for (j = i + 1; j < n; j++) {
      var w = (coocMatrix[words[i]] && coocMatrix[words[i]][words[j]]) || 0;
      if (w > 0) { adj[i][j] = w; adj[j][i] = w; totalW += 2 * w; }
    }
  }
  if (totalW === 0) {
    var commMap = {};
    for (i = 0; i < n; i++) commMap[words[i]] = 0;
    return commMap;
  }
  var deg = new Float64Array(n);
  for (i = 0; i < n; i++) { var s = 0; for (j = 0; j < n; j++) s += adj[i][j]; deg[i] = s; }
  var comm = [];
  for (i = 0; i < n; i++) comm.push(i);
  var m2 = totalW;
  var improved = true;
  var maxIter = 20;
  var iter = 0;
  while (improved && iter < maxIter) {
    improved = false; iter++;
    for (i = 0; i < n; i++) {
      var ci = comm[i];
      var neighComm = {};
      for (j = 0; j < n; j++) { if (adj[i][j] > 0 && j !== i) { var cj = comm[j]; neighComm[cj] = (neighComm[cj] || 0) + adj[i][j]; } }
      var ki = deg[i];
      var bestComm = ci;
      var bestDQ = 0;
      var sumIn_ci = neighComm[ci] || 0;
      var sumTot_ci = 0;
      for (j = 0; j < n; j++) { if (comm[j] === ci && j !== i) sumTot_ci += deg[j]; }
      var removeCost = sumIn_ci / m2 - (sumTot_ci * ki) / (m2 * m2);
      var nc;
      for (nc in neighComm) {
        if (!neighComm.hasOwnProperty(nc)) continue;
        var c = parseInt(nc, 10);
        if (c === ci) continue;
        var sumIn_c = neighComm[c] || 0;
        var sumTot_c = 0;
        for (j = 0; j < n; j++) { if (comm[j] === c) sumTot_c += deg[j]; }
        var addCost = sumIn_c / m2 - (sumTot_c * ki) / (m2 * m2);
        var dQ = addCost - removeCost;
        if (dQ > bestDQ) { bestDQ = dQ; bestComm = c; }
      }
      if (bestComm !== ci) { comm[i] = bestComm; improved = true; }
    }
  }
  var uniqueComms = {};
  var commIdx = 0;
  for (i = 0; i < n; i++) { if (uniqueComms[comm[i]] === undefined) { uniqueComms[comm[i]] = commIdx++; } }
  var commMap2 = {};
  for (i = 0; i < n; i++) { commMap2[words[i]] = uniqueComms[comm[i]]; }
  return commMap2;
}

// ── Co-occurrence matrix ──
function buildCooc(filtLem, vocab, winSize) {
  var vocabSet = {};
  var i, j;
  for (i = 0; i < vocab.length; i++) vocabSet[vocab[i]] = true;
  var cooc = {};
  for (i = 0; i < vocab.length; i++) { cooc[vocab[i]] = {}; }
  var win = winSize || 5;
  for (i = 0; i < filtLem.length; i++) {
    var w = filtLem[i];
    if (!vocabSet[w]) continue;
    for (j = Math.max(0, i - win); j <= Math.min(filtLem.length - 1, i + win); j++) {
      if (i !== j && vocabSet[filtLem[j]]) { var b = filtLem[j]; cooc[w][b] = (cooc[w][b] || 0) + 1; }
    }
  }
  return cooc;
}

// ── Spreading Activation (Orthogonal) ──
// Energy starts at 1 for every corpus word (not raw frequency).
// Relevance measures purely semantic centrality via WordNet.
function spreadAct(fMap, syn, pos, depth, decay, flow) {
  var corpus = {};
  var scores = {};
  var l;
  for (l in fMap) {
    if (fMap.hasOwnProperty(l)) {
      corpus[l] = true;
      scores[l] = 1;
    }
  }

  if (!syn.ready) {
    return scores;
  }

  for (l in fMap) {
    if (!fMap.hasOwnProperty(l)) continue;
    if (!fMap[l]) continue;
    var p = pos.ready ? pos.tag(l) : "n";
    var front = [{ w: l, p: p }];
    var vis = {};
    vis[l] = true;

    for (var h = 1; h <= depth; h++) {
      var nf = [];
      for (var fi = 0; fi < front.length; fi++) {
        var nd = front[fi];
        var rl = syn.getRels(nd.w, nd.p);
        var tgts;
        if (flow === "up") tgts = rl.h;
        else if (flow === "down") tgts = rl.y;
        else tgts = rl.h.concat(rl.y, rl.m);

        for (var ti = 0; ti < tgts.length; ti++) {
          var t = tgts[ti];
          if (vis[t]) continue;
          vis[t] = true;
          var amt = 1 * Math.pow(decay, h);
          if (corpus[t]) scores[t] = (scores[t] || 0) + amt;
          nf.push({ w: t, p: pos.ready ? pos.tag(t) : "n" });
        }
      }
      front = nf;
    }
  }
  return scores;
}

function pairAct(sw, fMap, syn, pos, depth, decay, flow) {
  if (!syn.ready || !fMap[sw]) return {};
  var corpus = {};
  var k;
  for (k in fMap) { if (fMap.hasOwnProperty(k)) corpus[k] = true; }
  var scores = {};
  var f = fMap[sw];
  var p = pos.ready ? pos.tag(sw) : "n";
  var front = [{ w: sw, p: p }];
  var vis = {};
  vis[sw] = true;
  for (var h = 1; h <= depth; h++) {
    var nf = [];
    for (var fi = 0; fi < front.length; fi++) {
      var nd = front[fi];
      var rl = syn.getRels(nd.w, nd.p);
      var tgts;
      if (flow === "up") tgts = rl.h;
      else if (flow === "down") tgts = rl.y;
      else tgts = rl.h.concat(rl.y, rl.m);
      for (var ti = 0; ti < tgts.length; ti++) {
        var t = tgts[ti];
        if (vis[t]) continue;
        vis[t] = true;
        var amt = f * Math.pow(decay, h);
        if (corpus[t]) scores[t] = (scores[t] || 0) + amt;
        nf.push({ w: t, p: pos.ready ? pos.tag(t) : "n" });
      }
    }
    front = nf;
  }
  return scores;
}

function synDist(a, b, syn, pos, mx) {
  if (a === b) return 0;
  if (!syn.ready) return -1;
  var front = [{ w: a, p: pos.ready ? pos.tag(a) : "n" }];
  var vis = {};
  vis[a] = true;
  for (var h = 1; h <= mx; h++) {
    var nf = [];
    for (var fi = 0; fi < front.length; fi++) {
      var nd = front[fi];
      var rl = syn.getRels(nd.w, nd.p);
      var all = rl.h.concat(rl.y, rl.m);
      for (var ti = 0; ti < all.length; ti++) {
        var t = all[ti];
        if (t === b) return h;
        if (vis[t]) continue;
        vis[t] = true;
        nf.push({ w: t, p: pos.ready ? pos.tag(t) : "n" });
      }
    }
    front = nf;
  }
  return -1;
}

// ── Two-Stage Analysis Pipeline ──

function analyzeStage1(text, eng, topN) {
  var rawTokens = tokenize(text);
  var allTokens = [];
  var paraIdx = 0;
  var i;
  for (i = 0; i < rawTokens.length; i++) {
    var rt = rawTokens[i];
    if (rt.type === "p") { paraIdx++; allTokens.push({ surface: rt.raw, lemma: rt.raw, pos: "x", stop: true, type: "p", para: paraIdx }); continue; }
    if (rt.type === "s") { allTokens.push({ surface: rt.raw, lemma: rt.raw, pos: "x", stop: true, type: "s", para: paraIdx }); continue; }
    if (rt.type === "x") { allTokens.push({ surface: rt.raw, lemma: rt.raw, pos: "x", stop: true, type: "x", para: paraIdx }); continue; }
    var low = rt.raw.toLowerCase();
    var p = eng.pos.ready ? eng.pos.tag(low) : "n";
    var lemma = eng.lem.ready ? eng.lem.lemmatize(low, p) : low;
    var isNeg = NEGATION_ES.has(low);
    var isStop = STOP_WORDS_ES.has(lemma) || STOP_WORDS_ES.has(low) || isNeg;
    allTokens.push({ surface: rt.raw, lemma: lemma, pos: p, stop: isStop, neg: isNeg, type: "w", para: paraIdx });
  }
  var filtLem = [];
  for (i = 0; i < allTokens.length; i++) {
    if (allTokens[i].type === "w" && !allTokens[i].stop) { filtLem.push(allTokens[i].lemma); }
  }
  var freqPairs = getFreqs(filtLem);
  var freqMap = {};
  for (i = 0; i < freqPairs.length; i++) { freqMap[freqPairs[i][0]] = freqPairs[i][1]; }
  var topWords = freqPairs.slice(0, topN);
  var totalContentWords = filtLem.length;
  var relFreqMap = {};
  var k;
  for (k in freqMap) { if (freqMap.hasOwnProperty(k)) { relFreqMap[k] = freqMap[k] / totalContentWords; } }
  var topWordList = topWords.map(function(p2) { return p2[0]; });
  var coocMatrix = buildCooc(filtLem, topWordList, 5);
  var commMap = louvain(freqMap, coocMatrix, topWords);
  var sentMap = {};
  for (i = 0; i < topWords.length; i++) {
    var w = topWords[i][0];
    if (eng.sent.ready) { var p2 = eng.pos.ready ? eng.pos.tag(w) : "n"; sentMap[w] = eng.sent.score(w, p2); }
  }
  var ng2 = getNg(filtLem, 2).slice(0, topN);
  var ng3 = getNg(filtLem, 3).slice(0, topN);
  var maxFreq = freqPairs.length > 0 ? freqPairs[0][1] : 1;
  return {
    allTokens: allTokens, filtLem: filtLem, freqMap: freqMap, relFreqMap: relFreqMap,
    freqPairs: freqPairs, topWords: topWords, coocMatrix: coocMatrix, commMap: commMap,
    sentMap: sentMap, ng2: ng2, ng3: ng3,
    ng2Map: (function() { var m = {}; for (var x = 0; x < ng2.length; x++) m[ng2[x][0]] = ng2[x][1]; return m; })(),
    ng3Map: (function() { var m = {}; for (var x = 0; x < ng3.length; x++) m[ng3[x][0]] = ng3[x][1]; return m; })(),
    maxFreq: maxFreq, tw: filtLem.length,
    totalTokens: allTokens.filter(function(t) { return t.type === "w"; }).length
  };
}

function analyzeStage2(stage1, eng, topN, wnDepth, decay, flow) {
  var freqMap = stage1.freqMap;
  var allTokens = stage1.allTokens;
  var relevanceMap = spreadAct(freqMap, eng.syn, eng.pos, wnDepth, decay, flow);
  var maxRel = 0;
  var k;
  for (k in relevanceMap) { if (relevanceMap.hasOwnProperty(k) && relevanceMap[k] > maxRel) { maxRel = relevanceMap[k]; } }
  if (maxRel === 0) maxRel = 1;
  var negWindow = 0;
  var enriched = [];
  var i;
  for (i = 0; i < allTokens.length; i++) {
    var tok = allTokens[i];
    if (tok.type !== "w") continue;
    if (tok.neg) { negWindow = 3; }
    var sent = eng.sent.ready ? eng.sent.score(tok.lemma, tok.pos) : {};
    var polarity = sent.polarity !== undefined ? sent.polarity : null;
    if (negWindow > 0 && !tok.stop && polarity !== null) { polarity = -polarity; negWindow--; }
    else if (!tok.stop) { if (negWindow > 0) negWindow--; }
    enriched.push({
      surface: tok.surface, lemma: tok.lemma, pos: tok.pos, stop: tok.stop,
      rel: relevanceMap[tok.lemma] || 0, freq: freqMap[tok.lemma] || 0,
      polarity: polarity, arousal: sent.vad ? sent.vad.a : null,
      emolex: sent.emolex || null,
      comm: stage1.commMap[tok.lemma] !== undefined ? stage1.commMap[tok.lemma] : -1
    });
  }
  var weaveEnriched = [[]];
  var paraTokenIdx = 0;
  for (i = 0; i < allTokens.length; i++) {
    var t = allTokens[i];
    if (t.type === "p") { weaveEnriched.push([]); continue; }
    if (t.type === "s") {
      if (weaveEnriched[weaveEnriched.length - 1].length > 0) {
        weaveEnriched[weaveEnriched.length - 1].push({ surface: " ", lemma: " ", pos: "x", stop: true, type: "s", rel: 0, freq: 0, polarity: null, arousal: null, emolex: null, comm: -1 });
      }
      continue;
    }
    if (t.type === "x") {
      weaveEnriched[weaveEnriched.length - 1].push({ surface: t.surface, lemma: t.surface, pos: "x", stop: true, type: "x", rel: 0, freq: 0, polarity: null, arousal: null, emolex: null, comm: -1 });
      continue;
    }
    if (paraTokenIdx < enriched.length) { weaveEnriched[weaveEnriched.length - 1].push(enriched[paraTokenIdx]); paraTokenIdx++; }
  }
  return {
    enriched: enriched, weaveEnriched: weaveEnriched, freqMap: freqMap,
    relFreqMap: stage1.relFreqMap, freqPairs: stage1.freqPairs,
    relevanceMap: relevanceMap, maxFreq: stage1.maxFreq, maxRel: maxRel,
    topWords: stage1.topWords, commMap: stage1.commMap,
    ng2: stage1.ng2, ng3: stage1.ng3, ng2Map: stage1.ng2Map, ng3Map: stage1.ng3Map,
    filtLem: stage1.filtLem, tw: stage1.totalTokens
  };
}

function analyze(text, eng, topN, wnDepth, decay, flow) {
  var s1 = analyzeStage1(text, eng, topN);
  return analyzeStage2(s1, eng, topN, wnDepth, decay, flow);
}

// ── Weave Seed Expansion ──
function expandSeeds(seeds, syn, pos, fMap, depth) {
  var groups = [];
  var corpus = {};
  var k;
  for (k in fMap) { if (fMap.hasOwnProperty(k)) corpus[k] = true; }
  for (var si = 0; si < seeds.length; si++) {
    var seed = seeds[si];
    if (!corpus[seed]) continue;
    var exps = [];
    var vis = {};
    vis[seed] = true;
    var front = [{ w: seed, p: pos.ready ? pos.tag(seed) : "n" }];
    for (var h = 1; h <= depth; h++) {
      var nf = [];
      for (var fi = 0; fi < front.length; fi++) {
        var nd = front[fi];
        var rels = syn.allRels(nd.w, nd.p);
        for (var ri = 0; ri < rels.length; ri++) {
          var t = rels[ri].t;
          var rel = rels[ri].rel;
          if (vis[t]) continue;
          vis[t] = true;
          if (corpus[t]) exps.push({ word: t, rel: rel, dist: h });
          nf.push({ w: t, p: pos.ready ? pos.tag(t) : "n" });
        }
      }
      front = nf;
    }
    exps.sort(function(a, b) { return a.dist - b.dist || a.word.localeCompare(b.word); });
    groups.push({ seed: seed, exps: exps });
  }
  return groups;
}

function computeWeave(groups, filtLem, fMap, syn, pos, depth, decay, flow, winSize) {
  var terms = [];
  var i, j;
  for (i = 0; i < groups.length; i++) {
    var g = groups[i];
    terms.push({ word: g.seed, parent: null, rel: "seed", dist: 0 });
    for (j = 0; j < g.exps.length; j++) {
      var e = g.exps[j];
      terms.push({ word: e.word, parent: g.seed, rel: e.rel, dist: e.dist });
    }
  }
  var tW = terms.map(function(t) { return t.word; });
  var tS = {};
  for (i = 0; i < tW.length; i++) tS[tW[i]] = true;
  var cooc = {};
  for (i = 0; i < tW.length; i++) { cooc[tW[i]] = {}; for (j = 0; j < tW.length; j++) cooc[tW[i]][tW[j]] = 0; }
  for (i = 0; i < filtLem.length; i++) {
    if (!tS[filtLem[i]]) continue;
    for (j = Math.max(0, i - winSize); j <= Math.min(filtLem.length - 1, i + winSize); j++) {
      if (i !== j && tS[filtLem[j]]) cooc[filtLem[i]][filtLem[j]]++;
    }
  }
  var ac = {};
  for (i = 0; i < tW.length; i++) { ac[tW[i]] = pairAct(tW[i], fMap, syn, pos, depth, decay, flow); }
  var activ = {};
  for (i = 0; i < tW.length; i++) { activ[tW[i]] = {}; for (j = 0; j < tW.length; j++) { var a = tW[i], b = tW[j]; activ[a][b] = Math.max((ac[a] && ac[a][b]) || 0, (ac[b] && ac[b][a]) || 0); } }
  var prox = {};
  var mH = depth * 2;
  for (i = 0; i < tW.length; i++) { prox[tW[i]] = {}; for (j = 0; j < tW.length; j++) { var d = synDist(tW[i], tW[j], syn, pos, mH); prox[tW[i]][tW[j]] = d >= 0 ? 1 / (1 + d) : 0; } }
  var mxC = 0, mxA = 0;
  for (i = 0; i < tW.length; i++) { for (j = 0; j < tW.length; j++) { if (tW[i] !== tW[j]) { mxC = Math.max(mxC, cooc[tW[i]][tW[j]]); mxA = Math.max(mxA, activ[tW[i]][tW[j]]); } } }
  return { terms: terms, groups: groups, cooc: cooc, activ: activ, prox: prox, mxC: mxC || 1, mxA: mxA || 1 };
}

function computeUnionTerms(wdm) {
  var sg = {};
  var docId;
  for (docId in wdm) {
    if (!wdm.hasOwnProperty(docId)) continue;
    var wd = wdm[docId];
    if (!wd || !wd.groups) continue;
    for (var gi = 0; gi < wd.groups.length; gi++) {
      var g = wd.groups[gi];
      if (!sg[g.seed]) sg[g.seed] = {};
      for (var ei = 0; ei < g.exps.length; ei++) {
        var e = g.exps[ei];
        var prev = sg[g.seed][e.word];
        if (!prev || e.dist < prev.dist) { sg[g.seed][e.word] = { rel: e.rel, dist: e.dist }; }
      }
    }
  }
  var terms = [];
  var seed;
  for (seed in sg) {
    if (!sg.hasOwnProperty(seed)) continue;
    terms.push({ word: seed, parent: null, rel: "seed", dist: 0 });
    var exps = [];
    var w;
    for (w in sg[seed]) { if (sg[seed].hasOwnProperty(w)) { exps.push({ word: w, rel: sg[seed][w].rel, dist: sg[seed][w].dist }); } }
    exps.sort(function(a, b) { return a.dist - b.dist || a.word.localeCompare(b.word); });
    for (var xi = 0; xi < exps.length; xi++) { terms.push({ word: exps[xi].word, parent: seed, rel: exps[xi].rel, dist: exps[xi].dist }); }
  }
  return terms;
}

function findPassages(enriched, wA, wB, win) {
  var ps = [];
  var seen = {};
  var i, j;
  for (i = 0; i < enriched.length; i++) {
    if (enriched[i].stop) continue;
    if (enriched[i].lemma !== wA && enriched[i].lemma !== wB) continue;
    var isA = enriched[i].lemma === wA;
    for (j = Math.max(0, i - win * 3); j <= Math.min(enriched.length - 1, i + win * 3); j++) {
      if (i === j || enriched[j].stop) continue;
      if ((isA && enriched[j].lemma === wB) || (!isA && enriched[j].lemma === wA)) {
        var s = Math.max(0, Math.min(i, j) - 8);
        var e = Math.min(enriched.length, Math.max(i, j) + 9);
        var key = s + "-" + e;
        if (seen[key]) continue;
        seen[key] = true;
        var passage = [];
        for (var pi = s; pi < e; pi++) {
          passage.push({ surface: enriched[pi].surface, lemma: enriched[pi].lemma, stop: enriched[pi].stop, hl: enriched[pi].lemma === wA || enriched[pi].lemma === wB });
        }
        ps.push(passage);
        if (ps.length >= 5) return ps;
      }
    }
  }
  return ps;
}

function computeStackWeave(wdm, uTerms, totalDocs) {
  var tW = uTerms.map(function(t) { return t.word; });
  var nD = totalDocs;
  var cells = {};
  var mxC = 0, mxA = 0, mxP = 0;
  var i, j;
  for (i = 0; i < tW.length; i++) {
    cells[tW[i]] = {};
    for (j = 0; j < tW.length; j++) {
      var a = tW[i], b = tW[j];
      var dc = 0, sc = 0, sa = 0, sp = 0;
      var docId;
      for (docId in wdm) {
        if (!wdm.hasOwnProperty(docId)) continue;
        var wd = wdm[docId];
        if (!wd) continue;
        var cv = (wd.cooc && wd.cooc[a] && wd.cooc[a][b]) || 0;
        if (cv > 0) dc++;
        sc += cv;
        sa += (wd.activ && wd.activ[a] && wd.activ[a][b]) || 0;
        sp += (wd.prox && wd.prox[a] && wd.prox[a][b]) || 0;
      }
      mxC = Math.max(mxC, sc); mxA = Math.max(mxA, sa); mxP = Math.max(mxP, sp);
      cells[a][b] = { dc: dc, sc: sc, sa: sa, sp: sp };
    }
  }
  return { cells: cells, mxC: mxC || 1, mxA: mxA || 1, mxP: mxP || 1, nDocs: nD };
}
