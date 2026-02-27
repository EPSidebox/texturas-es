// ─────────────────────────────────────────────
// fibras-data.js — Texturas (ES) v2.0
// Pure data logic for Fibras: segmentation, word selection, layout geometry
// No DOM, no SVG, no React, no P5 — testable in DevTools console
// Reads: analyze.js results (enriched, freqMap, relevanceMap)
// Reads: nlp.js engines (eng.vec for word2vec)
// Exports: segmentText, selectWords, computeSegData, computeSegEmo,
//          computeFibras, buildWindowedLayout
// ─────────────────────────────────────────────

// ── clusterByVec ──
// K-means clustering on word2vec vectors.
// Returns {word: clusterIndex} for all words that have vectors.
// Words without vectors get cluster 0.
function clusterByVec(words, eng, k) {
  if (!eng || !eng.vec || !eng.vec.isLoaded() || words.length === 0) {
    var fallback = {};
    for (var fi = 0; fi < words.length; fi++) fallback[words[fi]] = 0;
    return fallback;
  }

  var dim = eng.vec.dim;
  var numK = Math.min(k || 6, words.length);

  // Collect words that have vectors
  var vecWords = [];
  var vecs = [];
  for (var i = 0; i < words.length; i++) {
    var v = eng.vec.getVec(words[i]);
    if (v) {
      vecWords.push(words[i]);
      // Copy to plain array (subarray refs can shift)
      var arr = new Float32Array(dim);
      for (var d = 0; d < dim; d++) arr[d] = v[d];
      vecs.push(arr);
    }
  }

  if (vecWords.length < numK) {
    // Not enough vectors for k clusters, assign sequentially
    var seq = {};
    for (var si = 0; si < words.length; si++) seq[words[si]] = si % Math.max(1, numK);
    return seq;
  }

  // Initialize centroids from evenly spaced words
  var centroids = [];
  for (var ci = 0; ci < numK; ci++) {
    var idx = Math.floor(ci * vecWords.length / numK);
    var cent = new Float32Array(dim);
    for (var d2 = 0; d2 < dim; d2++) cent[d2] = vecs[idx][d2];
    centroids.push(cent);
  }

  // K-means iterations
  var assignments = new Array(vecWords.length);
  var maxIter = 20;
  for (var iter = 0; iter < maxIter; iter++) {
    var changed = false;

    // Assign each word to nearest centroid (cosine similarity)
    for (var wi = 0; wi < vecWords.length; wi++) {
      var bestC = 0;
      var bestSim = -2;
      for (var cj = 0; cj < numK; cj++) {
        var dot = 0, na = 0, nb = 0;
        for (var d3 = 0; d3 < dim; d3++) {
          dot += vecs[wi][d3] * centroids[cj][d3];
          na += vecs[wi][d3] * vecs[wi][d3];
          nb += centroids[cj][d3] * centroids[cj][d3];
        }
        var denom = Math.sqrt(na) * Math.sqrt(nb);
        var sim = denom > 0 ? dot / denom : 0;
        if (sim > bestSim) { bestSim = sim; bestC = cj; }
      }
      if (assignments[wi] !== bestC) { assignments[wi] = bestC; changed = true; }
    }

    if (!changed) break;

    // Recompute centroids
    for (var ck = 0; ck < numK; ck++) {
      var sum = new Float32Array(dim);
      var count = 0;
      for (var wj = 0; wj < vecWords.length; wj++) {
        if (assignments[wj] === ck) {
          for (var d4 = 0; d4 < dim; d4++) sum[d4] += vecs[wj][d4];
          count++;
        }
      }
      if (count > 0) {
        for (var d5 = 0; d5 < dim; d5++) centroids[ck][d5] = sum[d5] / count;
      }
    }
  }

  // Build result map
  var result = {};
  var vecIdx = 0;
  for (var ri = 0; ri < words.length; ri++) {
    if (vecIdx < vecWords.length && words[ri] === vecWords[vecIdx]) {
      result[words[ri]] = assignments[vecIdx];
      vecIdx++;
    } else {
      result[words[ri]] = 0;
    }
  }
  return result;
}

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
// Also computes hybrid relevance per segment: globalRel × localActivation.
// Returns [{word: {freq: n, rel: n, act: n}, ...}, ...] (one object per segment)
function computeSegData(segments, nodeWords, eng, decay, relevanceMap) {
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

      var localAct = baseFreq + boost;
      var globalRel = (relevanceMap && relevanceMap[w]) ? relevanceMap[w] : 1;

      row[w] = {
        freq: localAct,
        rel: globalRel * (localAct > 0 ? localAct : 0),
        act: localAct
      };
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

  var segData = computeSegData(segments, nodeWords, eng, decay, relevanceMap);
  var segEmo = computeSegEmo(segments);

  // Compute global maxes for normalization
  var maxFreq = 0;
  var maxRel = 0;
  var maxSegFreq = 0;
  var maxSegRel = 0;
  for (var i = 0; i < nodeWords.length; i++) {
    var ww = nodeWords[i];
    if (freqMap[ww] > maxFreq) maxFreq = freqMap[ww];
    if ((relevanceMap[ww] || 1) > maxRel) maxRel = relevanceMap[ww] || 1;
  }
  // Per-segment maxes (for node height normalization)
  for (var si2 = 0; si2 < segData.length; si2++) {
    for (var wi2 = 0; wi2 < nodeWords.length; wi2++) {
      var entry = segData[si2][nodeWords[wi2]];
      if (entry) {
        if (entry.freq > maxSegFreq) maxSegFreq = entry.freq;
        if (entry.rel > maxSegRel) maxSegRel = entry.rel;
      }
    }
  }

  // Compute word2vec clusters for color mode
  var vecClusterMap = clusterByVec(nodeWords, eng, Math.min(8, Math.max(3, Math.floor(nodeWords.length / 4))));

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
    maxSegFreq: maxSegFreq || 1,
    maxSegRel: maxSegRel || 1,
    decay: decay,
    vecClusterMap: vecClusterMap
  };
}

// ── buildWindowedLayout ──
// Computes geometry for a windowed view of Fibras.
// Pure data — no rendering. Produces rectangles and curve control points.
//
// Returns {
//   columns: [{x, segIdx}],
//   wordSlots: [{
//     word, rank, freq, rel, isSeed, color,
//     nodes: [{col, segIdx, x, y, w, h, isReal, opacity, primary, secondary}],
//     links: [{srcCol, tgtCol, srcNode, tgtNode}]
//   }],
//   emoBars: [{segIdx, x, joy, fear, sadness, anger}],
//   canvasW, canvasH,
//   maxFreq, maxRel
// }
function buildWindowedLayout(fibras, winStart, winSize, seeds, sortMode, colorMode, canvasW, canvasH, commMap, eng) {
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

  // Normalization maxes for per-segment values
  var maxSegFreq = fibras.maxSegFreq;
  var maxSegRel = fibras.maxSegRel;

  // Compute node height based on primary metric (per segment)
  // Total available height divided among all words + gaps
  var numWords = nodeWords.length;
  var totalGap = (numWords - 1) * gapY;
  var availH = Math.max(10, chartH - totalGap);
  var baseNodeH = numWords > 0 ? availH / numWords : 10;
  var minNodeH = 1;
  var maxNodeH = Math.max(minNodeH + 1, baseNodeH * 2);

  // Color assignment per word
  function getWordColor(w, rank) {
    if (colorMode === "valencia") {
      var pol = commMap && commMap[w] !== undefined ? commMap[w] : 0;
      if (pol > 0.05) return T.positive;
      if (pol < -0.05) return T.negative;
      return T.neutral;
    }
    if (colorMode === "rango") {
      return CC[rank % CC.length];
    }
    // Default: comunidad — use word2vec clusters
    var cluster = fibras.vecClusterMap ? (fibras.vecClusterMap[w] || 0) : 0;
    return CC[cluster % CC.length];
  }

  // Build per-word slot data
  var wordSlots = [];
  for (var wi = 0; wi < nodeWords.length; wi++) {
    var w = nodeWords[wi];
    var freq = freqMap[w] || 0;
    var rel = relevanceMap[w] || 1;
    var rank = wi;
    var isSeed = seeds && seeds.has ? seeds.has(w) : false;
    var color = getWordColor(w, rank);

    // Y position from rank (center of the slot)
    var y = padTop + rank * (baseNodeH + gapY);

    // Build nodes per visible column
    var slotNodes = [];
    var firstRealCol = -1;
    var lastRealCol = -1;

    for (var c2 = 0; c2 < numCols; c2++) {
      var segIdx = winStart + c2;
      var segEntry = segData[segIdx] ? segData[segIdx][w] : null;
      var localFreq = segEntry ? segEntry.freq : 0;
      var localRel = segEntry ? segEntry.rel : 0;
      var isReal = segEntry ? segEntry.act > 0 : false;

      // Primary metric controls height (per segment)
      // Secondary metric controls opacity (per segment)
      var primaryVal, secondaryVal, primaryNorm, secondaryNorm;
      if (sortMode === "relevance") {
        primaryVal = localRel;
        secondaryVal = localFreq;
        primaryNorm = maxSegRel > 0 ? localRel / maxSegRel : 0;
        secondaryNorm = maxSegFreq > 0 ? localFreq / maxSegFreq : 0;
      } else {
        primaryVal = localFreq;
        secondaryVal = localRel;
        primaryNorm = maxSegFreq > 0 ? localFreq / maxSegFreq : 0;
        secondaryNorm = maxSegRel > 0 ? localRel / maxSegRel : 0;
      }

      var nodeH = isReal ? minNodeH + primaryNorm * (maxNodeH - minNodeH) : 0;
      // Opacity: base 0.25 + secondary metric scales up to 1.0
      var opacity = isReal ? 0.25 + secondaryNorm * 0.75 : 0;

      if (isReal) {
        if (firstRealCol === -1) firstRealCol = c2;
        lastRealCol = c2;
      }

      slotNodes.push({
        col: c2,
        segIdx: segIdx,
        x: columns[c2].x - nodeW / 2,
        y: y + (baseNodeH - nodeH) / 2,  // center node vertically in slot
        w: nodeW,
        h: nodeH,
        isReal: isReal,
        opacity: opacity,
        primary: primaryVal,
        secondary: secondaryVal,
        primaryNorm: primaryNorm,
        secondaryNorm: secondaryNorm
      });
    }

    // Build links: only between firstReal and lastReal columns
    // Links connect adjacent columns; ghost segments produce no visible link
    var slotLinks = [];
    if (firstRealCol >= 0 && lastRealCol > firstRealCol) {
      for (var c3 = firstRealCol; c3 < lastRealCol; c3++) {
        var srcNode = slotNodes[c3];
        var tgtNode = slotNodes[c3 + 1];
        // Only create links where both endpoints are real
        if (srcNode.isReal && tgtNode.isReal) {
          slotLinks.push({
            srcCol: c3,
            tgtCol: c3 + 1,
            srcNode: srcNode,
            tgtNode: tgtNode
          });
        }
      }
    }

    // Determine label positions: first real node + first real after each ghost gap
    var labelCols = [];
    if (firstRealCol >= 0) {
      labelCols.push(firstRealCol);
      var wasGhost = false;
      for (var c5 = firstRealCol + 1; c5 <= lastRealCol; c5++) {
        if (!slotNodes[c5].isReal) {
          wasGhost = true;
        } else if (wasGhost) {
          labelCols.push(c5);
          wasGhost = false;
        }
      }
    }

    wordSlots.push({
      word: w,
      rank: rank,
      freq: freq,
      rel: rel,
      isSeed: isSeed,
      color: color,
      y: y,
      slotH: baseNodeH,
      nodes: slotNodes,
      links: slotLinks,
      firstRealCol: firstRealCol,
      lastRealCol: lastRealCol,
      labelCols: labelCols
    });
  }

  // ── Cross-stream links (word2vec similarity) ──
  // When word A is real in column C but absent in C+1, and word B is real in C+1
  // with similarity > 0.5, create a cross-stream ribbon.
  var crossLinks = [];
  var SIM_THRESHOLD = 0.5;
  if (eng && eng.vec && eng.vec.isLoaded()) {
    for (var xwi = 0; xwi < wordSlots.length; xwi++) {
      var slotA = wordSlots[xwi];
      for (var xc = 0; xc < numCols - 1; xc++) {
        var nodeA = slotA.nodes[xc];
        var nodeANext = slotA.nodes[xc + 1];
        // A is real in this column but not in the next
        if (!nodeA.isReal || nodeANext.isReal) continue;

        for (var xwj = 0; xwj < wordSlots.length; xwj++) {
          if (xwi === xwj) continue;
          var slotB = wordSlots[xwj];
          var nodeB = slotB.nodes[xc + 1];
          if (!nodeB.isReal) continue;

          var sim = eng.vec.similarity(slotA.word, slotB.word);
          if (sim >= SIM_THRESHOLD) {
            crossLinks.push({
              srcSlotIdx: xwi,
              tgtSlotIdx: xwj,
              srcNode: nodeA,
              tgtNode: nodeB,
              srcWord: slotA.word,
              tgtWord: slotB.word,
              srcColor: slotA.color,
              tgtColor: slotB.color,
              similarity: sim,
              srcCol: xc,
              tgtCol: xc + 1
            });
          }
        }
      }
    }
  }

  // Build emotion bar data + per-segment polarity and arousal for minimap
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

  // Per-segment polarity and arousal (for minimap, computed over ALL segments)
  var segPolarity = [];
  var segArousal = [];
  for (var sp = 0; sp < segments.length; sp++) {
    var sToks = segments[sp].tokens;
    var polSum = 0, polCount = 0;
    var aroSum = 0, aroCount = 0;
    for (var st = 0; st < sToks.length; st++) {
      if (sToks[st].polarity !== null && sToks[st].polarity !== undefined) {
        polSum += sToks[st].polarity;
        polCount++;
      }
      if (sToks[st].arousal !== null && sToks[st].arousal !== undefined) {
        aroSum += sToks[st].arousal;
        aroCount++;
      }
    }
    segPolarity.push(polCount > 0 ? polSum / polCount : 0);
    segArousal.push(aroCount > 0 ? aroSum / aroCount : 0);
  }

  return {
    columns: columns,
    wordSlots: wordSlots,
    crossLinks: crossLinks,
    emoBars: emoBars,
    segPolarity: segPolarity,
    segArousal: segArousal,
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
