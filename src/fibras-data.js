// ─────────────────────────────────────────────
// fibras-data.js — Texturas (ES) v2.0
// Pure data logic for Fibras: segmentation, word selection, layout geometry
// No DOM, no SVG, no React, no P5 — testable in DevTools console
// Reads: analyze.js results (enriched, freqMap, relevanceMap)
// Reads: nlp.js engines (eng.vec for word2vec)
// Exports: segmentText, selectWords, computeSegData, computeSegEmo,
//          computeFibras, buildWindowedLayout
// ─────────────────────────────────────────────

// ── segmentText ──
// Splits content tokens (non-stop) into N equal segments.
// Returns [{idx, tokens, freqMap}]
function segmentText(enriched, numSegs) {
  var content = [];
  for (var i = 0; i < enriched.length; i++) {
    if (!enriched[i].stop) content.push(enriched[i]);
  }
  var segs = [];
  var segSize = Math.max(1, Math.floor(content.length / numSegs));
  for (var s = 0; s < numSegs; s++) {
    var start = s * segSize;
    var end = (s === numSegs - 1) ? content.length : (s + 1) * segSize;
    var tokens = content.slice(start, end);
    var fm = {};
    for (var t = 0; t < tokens.length; t++) {
      var lem = tokens[t].lemma;
      fm[lem] = (fm[lem] || 0) + 1;
    }
    segs.push({ idx: s, tokens: tokens, freqMap: fm });
  }
  return segs;
}

// ── selectWords ──
// Picks words based on mode with stable tiebreaking.
// mode: "seeds" | "recurrentes" | "persistentes"
// sortMode: "freq" | "relevance"
// Returns ordered array of word strings.
function selectWords(freqMap, relevanceMap, seeds, mode, topN, sortMode) {
  if (mode === "seeds") {
    var out = [];
    seeds.forEach(function(w) {
      if (freqMap[w]) out.push(w);
    });
    return out;
  }

  // Build candidate list from ALL content words (full freqMap)
  var candidates = [];
  var w;
  for (w in freqMap) {
    if (!freqMap.hasOwnProperty(w)) continue;
    candidates.push({
      word: w,
      freq: freqMap[w],
      rel: relevanceMap[w] || 1
    });
  }

  // Sort with stable tiebreaking
  if (sortMode === "relevance") {
    candidates.sort(function(a, b) {
      if (b.rel !== a.rel) return b.rel - a.rel;
      if (b.freq !== a.freq) return b.freq - a.freq;
      return a.word.localeCompare(b.word);
    });
  } else {
    candidates.sort(function(a, b) {
      if (b.freq !== a.freq) return b.freq - a.freq;
      if (b.rel !== a.rel) return b.rel - a.rel;
      return a.word.localeCompare(b.word);
    });
  }

  if (mode === "persistentes") {
    return candidates.slice(0, topN).map(function(c) { return c.word; });
  }

  return candidates.slice(0, topN).map(function(c) { return c.word; });
}

// ── computeSegData ──
// Per-segment activation for each word.
// Uses raw frequency + word2vec similarity boost from eng.vec.
// Returns [{word: activation, ...}, ...] (one object per segment)
function computeSegData(segments, nodeWords, eng, decay) {
  var result = [];
  for (var s = 0; s < segments.length; s++) {
    var seg = segments[s];
    var row = {};
    for (var wi = 0; wi < nodeWords.length; wi++) {
      var w = nodeWords[wi];
      var baseFreq = seg.freqMap[w] || 0;

      // Word2vec boost: if word absent, check if similar words are present
      var boost = 0;
      if (baseFreq === 0 && eng && eng.vec && eng.vec.isLoaded()) {
        for (var lem in seg.freqMap) {
          if (!seg.freqMap.hasOwnProperty(lem)) continue;
          var sim = eng.vec.similarity(w, lem);
          if (sim > 0.4) {
            boost = Math.max(boost, sim * seg.freqMap[lem] * (decay || 0.5));
          }
        }
      }

      row[w] = baseFreq + boost;
    }
    result.push(row);
  }
  return result;
}

// ── computeSegEmo ──
// Per-segment emotion intensity averages for 4 emotions.
// Returns [{joy: avg, fear: avg, sadness: avg, anger: avg}, ...]
function computeSegEmo(segments) {
  var emos = ["joy", "fear", "sadness", "anger"];
  var result = [];
  for (var s = 0; s < segments.length; s++) {
    var tokens = segments[s].tokens;
    var sums = { joy: 0, fear: 0, sadness: 0, anger: 0 };
    var counts = { joy: 0, fear: 0, sadness: 0, anger: 0 };
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      if (!tok.emolex) continue;
      for (var ei = 0; ei < emos.length; ei++) {
        var em = emos[ei];
        if (tok.emolex[em]) {
          sums[em] += 1;
          counts[em] += 1;
        }
      }
    }
    var row = {};
    for (var ei2 = 0; ei2 < emos.length; ei2++) {
      var e = emos[ei2];
      row[e] = counts[e] > 0 ? sums[e] / tokens.length : 0;
    }
    result.push(row);
  }
  return result;
}

// ── computeFibras ──
// Orchestrator. Returns all data needed for rendering.
function computeFibras(enriched, freqMap, relevanceMap, eng, seeds, numSegs, mode, topN, decay, sortMode) {
  var segments = segmentText(enriched, numSegs);

  var nodeWords;
  if (mode === "persistentes") {
    var ranked = selectWords(freqMap, relevanceMap, seeds, "recurrentes", Object.keys(freqMap).length, sortMode);
    var persistent = [];
    for (var ri = 0; ri < ranked.length; ri++) {
      var w = ranked[ri];
      var segCount = 0;
      for (var si = 0; si < segments.length; si++) {
        if (segments[si].freqMap[w]) segCount++;
      }
      if (segCount >= 2) persistent.push(w);
      if (persistent.length >= topN) break;
    }
    nodeWords = persistent;
  } else {
    nodeWords = selectWords(freqMap, relevanceMap, seeds, mode, topN, sortMode);
  }

  var segData = computeSegData(segments, nodeWords, eng, decay);
  var segEmo = computeSegEmo(segments);

  var maxFreq = 0;
  var maxRel = 0;
  for (var i = 0; i < nodeWords.length; i++) {
    var ww = nodeWords[i];
    if (freqMap[ww] > maxFreq) maxFreq = freqMap[ww];
    if ((relevanceMap[ww] || 1) > maxRel) maxRel = relevanceMap[ww] || 1;
  }

  return {
    nodeWords: nodeWords,
    segments: segments,
    segData: segData,
    segEmo: segEmo,
    numSegs: numSegs,
    freqMap: freqMap,
    relevanceMap: relevanceMap,
    maxFreq: maxFreq || 1,
    maxRel: maxRel || 1,
    decay: decay
  };
}

// ── buildWindowedLayout ──
// Computes geometry for a windowed view of Fibras.
// Pure data — no rendering. Produces rectangles and curve control points.
//
// Returns {
//   columns: [{x, segIdx}],             — column x-positions
//   wordSlots: [{                        — one per word
//     word, rank, freq, rel, isSeed,
//     nodes: [{col, segIdx, x, y, w, h, isReal, activation, primary, secondary}],
//     links: [{srcCol, tgtCol, srcNode, tgtNode, isReal}]
//   }],
//   emoBars: [{segIdx, x, joy, fear, sadness, anger}],
//   canvasW, canvasH,
//   maxFreq, maxRel
// }
function buildWindowedLayout(fibras, winStart, winSize, seeds, sortMode, canvasW, canvasH) {
  var nodeWords = fibras.nodeWords;
  var segments = fibras.segments;
  var segData = fibras.segData;
  var segEmo = fibras.segEmo;
  var freqMap = fibras.freqMap;
  var relevanceMap = fibras.relevanceMap;
  var numSegs = fibras.numSegs;

  var winEnd = Math.min(winStart + winSize, numSegs);
  var numCols = winEnd - winStart;

  // Layout constants
  var padLeft = 80;   // space for labels
  var padRight = 20;
  var padTop = 20;
  var emoBarH = 40;   // space reserved for emotion bars at bottom
  var padBottom = 10;
  var chartW = canvasW - padLeft - padRight;
  var chartH = canvasH - padTop - emoBarH - padBottom;

  var colW = numCols > 0 ? chartW / numCols : chartW;
  var nodeW = Math.max(4, Math.min(colW * 0.4, 30));
  var gapY = 2; // vertical gap between nodes in a column

  // Build column x-positions
  var columns = [];
  for (var c = 0; c < numCols; c++) {
    columns.push({
      x: padLeft + c * colW + colW / 2,
      segIdx: winStart + c
    });
  }

  // Build word rank
  var wordRank = {};
  for (var ri = 0; ri < nodeWords.length; ri++) {
    wordRank[nodeWords[ri]] = ri;
  }

  // Compute max values for normalization
  var maxFreq = 0;
  var maxRel = 0;
  for (var mi = 0; mi < nodeWords.length; mi++) {
    var mw = nodeWords[mi];
    if (freqMap[mw] > maxFreq) maxFreq = freqMap[mw];
    if ((relevanceMap[mw] || 1) > maxRel) maxRel = relevanceMap[mw] || 1;
  }
  if (maxFreq === 0) maxFreq = 1;
  if (maxRel === 0) maxRel = 1;

  // Compute node height based on primary metric
  // Total available height divided among all words + gaps
  var numWords = nodeWords.length;
  var totalGap = (numWords - 1) * gapY;
  var availH = Math.max(10, chartH - totalGap);
  var baseNodeH = numWords > 0 ? availH / numWords : 10;
  var minNodeH = 3;
  var maxNodeH = Math.max(minNodeH + 1, baseNodeH * 2);

  // Build per-word slot data
  var wordSlots = [];
  for (var wi = 0; wi < nodeWords.length; wi++) {
    var w = nodeWords[wi];
    var freq = freqMap[w] || 0;
    var rel = relevanceMap[w] || 1;
    var rank = wi;
    var isSeed = seeds && seeds.has ? seeds.has(w) : false;

    var primary, secondary, primaryNorm, secondaryNorm;
    if (sortMode === "relevance") {
      primary = rel;
      secondary = freq;
      primaryNorm = rel / maxRel;
      secondaryNorm = freq / maxFreq;
    } else {
      primary = freq;
      secondary = rel;
      primaryNorm = freq / maxFreq;
      secondaryNorm = rel / maxRel;
    }

    // Node height from primary metric
    var nodeH = minNodeH + primaryNorm * (maxNodeH - minNodeH);

    // Y position from rank
    var y = padTop + rank * (baseNodeH + gapY);

    // Build nodes per visible column
    var slotNodes = [];
    var firstRealCol = -1;
    var lastRealCol = -1;

    for (var c2 = 0; c2 < numCols; c2++) {
      var segIdx = winStart + c2;
      var act = segData[segIdx] ? (segData[segIdx][w] || 0) : 0;
      var isReal = act > 0;

      if (isReal) {
        if (firstRealCol === -1) firstRealCol = c2;
        lastRealCol = c2;
      }

      slotNodes.push({
        col: c2,
        segIdx: segIdx,
        x: columns[c2].x - nodeW / 2,
        y: y,
        w: nodeW,
        h: nodeH,
        isReal: isReal,
        activation: act,
        primary: primary,
        secondary: secondary,
        primaryNorm: primaryNorm,
        secondaryNorm: secondaryNorm
      });
    }

    // Build links: only between firstReal and lastReal columns
    var slotLinks = [];
    if (firstRealCol >= 0 && lastRealCol > firstRealCol) {
      for (var c3 = firstRealCol; c3 < lastRealCol; c3++) {
        var srcNode = slotNodes[c3];
        var tgtNode = slotNodes[c3 + 1];
        // Link is real only if BOTH endpoints are real
        var linkIsReal = srcNode.isReal && tgtNode.isReal;
        slotLinks.push({
          srcCol: c3,
          tgtCol: c3 + 1,
          srcNode: srcNode,
          tgtNode: tgtNode,
          isReal: linkIsReal
        });
      }
    }

    wordSlots.push({
      word: w,
      rank: rank,
      freq: freq,
      rel: rel,
      isSeed: isSeed,
      primary: primary,
      secondary: secondary,
      primaryNorm: primaryNorm,
      secondaryNorm: secondaryNorm,
      nodeH: nodeH,
      y: y,
      nodes: slotNodes,
      links: slotLinks,
      firstRealCol: firstRealCol,
      lastRealCol: lastRealCol
    });
  }

  // Build emotion bar data
  var emoBars = [];
  for (var c4 = 0; c4 < numCols; c4++) {
    var segIdx2 = winStart + c4;
    var emo = segEmo[segIdx2] || { joy: 0, fear: 0, sadness: 0, anger: 0 };
    emoBars.push({
      segIdx: segIdx2,
      x: columns[c4].x,
      joy: emo.joy,
      fear: emo.fear,
      sadness: emo.sadness,
      anger: emo.anger
    });
  }

  return {
    columns: columns,
    wordSlots: wordSlots,
    emoBars: emoBars,
    canvasW: canvasW,
    canvasH: canvasH,
    chartH: chartH,
    padLeft: padLeft,
    padTop: padTop,
    emoBarY: padTop + chartH + 4,
    emoBarH: emoBarH,
    nodeW: nodeW,
    colW: colW,
    maxFreq: maxFreq,
    maxRel: maxRel,
    numCols: numCols,
    wordRank: wordRank
  };
}
