// ─────────────────────────────────────────────
// fibras-data.js — Texturas (ES) v2.1
// Pure data logic for Fibras: segmentation, word selection, layout geometry
// No DOM, no SVG, no React, no P5 — testable in DevTools console
// Reads: analyze.js results (enriched, freqMap, relevanceMap)
// Reads: nlp.js engines (eng.vec for word2vec)
// Exports: segmentText, selectWords, computeSegData, computeSegEmo,
//          computeFibras, buildWindowedLayout
// ─────────────────────────────────────────────

// ── clusterByVec ──
function clusterByVec(words, eng, k) {
  if (!eng || !eng.vec || !eng.vec.isLoaded() || words.length === 0) {
    var fallback = {};
    for (var fi = 0; fi < words.length; fi++) fallback[words[fi]] = 0;
    return fallback;
  }

  var dim = eng.vec.dim;
  var numK = Math.min(k || 6, words.length);

  var vecWords = [];
  var vecs = [];
  for (var i = 0; i < words.length; i++) {
    var v = eng.vec.getVec(words[i]);
    if (v) {
      vecWords.push(words[i]);
      var arr = new Float32Array(dim);
      for (var d = 0; d < dim; d++) arr[d] = v[d];
      vecs.push(arr);
    }
  }

  if (vecWords.length < numK) {
    var seq = {};
    for (var si = 0; si < words.length; si++) seq[words[si]] = si % Math.max(1, numK);
    return seq;
  }

  var centroids = [];
  for (var ci = 0; ci < numK; ci++) {
    var idx = Math.floor(ci * vecWords.length / numK);
    var cent = new Float32Array(dim);
    for (var d2 = 0; d2 < dim; d2++) cent[d2] = vecs[idx][d2];
    centroids.push(cent);
  }

  var assignments = new Array(vecWords.length);
  var maxIter = 20;
  for (var iter = 0; iter < maxIter; iter++) {
    var changed = false;
    for (var wi = 0; wi < vecWords.length; wi++) {
      var bestC = 0, bestSim = -2;
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

// ── detectSegProtocol ──
function detectSegProtocol(text) {
  var re = /---SEG:(.+?)---/g;
  var m;
  var markers = [];
  while ((m = re.exec(text)) !== null) {
    markers.push({ idx: m.index, label: m[1].trim(), end: m.index + m[0].length });
  }
  if (markers.length === 0) return null;

  var segs = [];
  var preBefore = text.substring(0, markers[0].idx).trim();
  if (preBefore.length > 0) {
    segs.push({ label: "Pre\u00E1mbulo", text: preBefore });
  }
  for (var i = 0; i < markers.length; i++) {
    var start = markers[i].end;
    var end = (i + 1 < markers.length) ? markers[i + 1].idx : text.length;
    var body = text.substring(start, end).trim();
    if (body.length > 0) {
      segs.push({ label: markers[i].label, text: body });
    }
  }
  return segs.length > 0 ? segs : null;
}

// ── segmentText ──
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
    var lemmas = [];
    for (var t = 0; t < tokens.length; t++) {
      var lem = tokens[t].lemma;
      fm[lem] = (fm[lem] || 0) + 1;
      lemmas.push(lem);
    }
    var normFm = {};
    var total = tokens.length;
    if (total > 0) {
      for (var nw in fm) {
        if (fm.hasOwnProperty(nw)) normFm[nw] = fm[nw] / total;
      }
    }
    var ng2Map = {}, ng3Map = {};
    for (var ni = 0; ni < lemmas.length - 1; ni++) {
      var bg = lemmas[ni] + " " + lemmas[ni + 1];
      ng2Map[bg] = (ng2Map[bg] || 0) + 1;
    }
    for (var ni2 = 0; ni2 < lemmas.length - 2; ni2++) {
      var tg = lemmas[ni2] + " " + lemmas[ni2 + 1] + " " + lemmas[ni2 + 2];
      ng3Map[tg] = (ng3Map[tg] || 0) + 1;
    }
    var normNg2 = {}, normNg3 = {};
    var ng2Total = Math.max(1, lemmas.length - 1);
    var ng3Total = Math.max(1, lemmas.length - 2);
    for (var b in ng2Map) { if (ng2Map.hasOwnProperty(b)) normNg2[b] = ng2Map[b] / ng2Total; }
    for (var tr in ng3Map) { if (ng3Map.hasOwnProperty(tr)) normNg3[tr] = ng3Map[tr] / ng3Total; }

    segs.push({
      idx: s, tokens: tokens, freqMap: fm, normFreqMap: normFm, label: null,
      ng2Map: ng2Map, ng3Map: ng3Map, normNg2Map: normNg2, normNg3Map: normNg3,
      lemmas: lemmas
    });
  }
  return segs;
}

// ── segmentTextCustom ──
function segmentTextCustom(enriched, customSegs) {
  var content = [];
  for (var i = 0; i < enriched.length; i++) {
    if (!enriched[i].stop) content.push(enriched[i]);
  }

  var segs = [];
  for (var s = 0; s < customSegs.length; s++) {
    var cs = customSegs[s];
    var tokens = content.slice(cs.startToken, cs.endToken);
    var fm = {};
    var lemmas = [];
    for (var t = 0; t < tokens.length; t++) {
      var lem = tokens[t].lemma;
      fm[lem] = (fm[lem] || 0) + 1;
      lemmas.push(lem);
    }
    var normFm = {};
    var total = tokens.length;
    if (total > 0) {
      for (var nw in fm) { if (fm.hasOwnProperty(nw)) normFm[nw] = fm[nw] / total; }
    }
    var ng2Map = {}, ng3Map = {};
    for (var ni = 0; ni < lemmas.length - 1; ni++) {
      var bg = lemmas[ni] + " " + lemmas[ni + 1];
      ng2Map[bg] = (ng2Map[bg] || 0) + 1;
    }
    for (var ni2 = 0; ni2 < lemmas.length - 2; ni2++) {
      var tg = lemmas[ni2] + " " + lemmas[ni2 + 1] + " " + lemmas[ni2 + 2];
      ng3Map[tg] = (ng3Map[tg] || 0) + 1;
    }
    var normNg2 = {}, normNg3 = {};
    var ng2Total = Math.max(1, lemmas.length - 1);
    var ng3Total = Math.max(1, lemmas.length - 2);
    for (var b in ng2Map) { if (ng2Map.hasOwnProperty(b)) normNg2[b] = ng2Map[b] / ng2Total; }
    for (var tr in ng3Map) { if (ng3Map.hasOwnProperty(tr)) normNg3[tr] = ng3Map[tr] / ng3Total; }

    segs.push({
      idx: s, tokens: tokens, freqMap: fm, normFreqMap: normFm, label: cs.label,
      ng2Map: ng2Map, ng3Map: ng3Map, normNg2Map: normNg2, normNg3Map: normNg3,
      lemmas: lemmas
    });
  }
  return segs;
}

// ── selectWords ──
// persistentes: if true, only return words appearing in 2+ segments
function selectWords(freqMap, relevanceMap, topN, sortMode, ngMode, persistentes, segments) {
  var useRelevance = ngMode === 1;

  var candidates = [];
  var w;
  for (w in freqMap) {
    if (!freqMap.hasOwnProperty(w)) continue;
    if (ngMode === 1 && w.length < 2) continue;
    candidates.push({
      word: w,
      freq: freqMap[w],
      rel: useRelevance ? (relevanceMap[w] || 1) : 1
    });
  }

  if (sortMode === "relevance" && useRelevance) {
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

  // Filter for persistentes: words appearing in 2+ segments
  if (persistentes && segments) {
    var out = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      var cw = candidates[ci].word;
      var segCount = 0;
      for (var si = 0; si < segments.length; si++) {
        var checkMap = ngMode === 2 ? (segments[si].ng2Map || {}) :
                       ngMode === 3 ? (segments[si].ng3Map || {}) :
                       segments[si].freqMap;
        if (checkMap[cw]) segCount++;
      }
      if (segCount >= 2) out.push(cw);
      if (out.length >= topN) break;
    }
    return out;
  }

  return candidates.slice(0, topN).map(function(c) { return c.word; });
}

// ── computeSegData ──
function computeSegData(segments, nodeWords, eng, decay, relevanceMap, ngMode) {
  var result = [];
  for (var s = 0; s < segments.length; s++) {
    var seg = segments[s];
    var row = {};

    var rawMap, normMap;
    if (ngMode === 2) { rawMap = seg.ng2Map || {}; normMap = seg.normNg2Map || {}; }
    else if (ngMode === 3) { rawMap = seg.ng3Map || {}; normMap = seg.normNg3Map || {}; }
    else { rawMap = seg.freqMap; normMap = seg.normFreqMap; }

    for (var wi = 0; wi < nodeWords.length; wi++) {
      var w = nodeWords[wi];
      var baseFreq = rawMap[w] || 0;
      var normFreq = normMap[w] || 0;

      var boost = 0;
      var normBoost = 0;
      var vecSource = null;
      var vecSim = 0;
      if (ngMode === 1 && baseFreq === 0 && eng && eng.vec && eng.vec.isLoaded()) {
        for (var lem in seg.freqMap) {
          if (!seg.freqMap.hasOwnProperty(lem)) continue;
          var sim = eng.vec.similarity(w, lem);
          if (sim > 0.4) {
            var rawB = sim * seg.freqMap[lem] * (decay || 0.5);
            var normB = sim * (seg.normFreqMap[lem] || 0) * (decay || 0.5);
            if (rawB > boost) {
              boost = rawB; normBoost = normB;
              vecSource = lem; vecSim = sim;
            }
          }
        }
      }

      var wnSource = null;
      if (ngMode === 1 && baseFreq === 0 && boost === 0 && eng && eng.syn && eng.syn.ready && eng.pos && eng.pos.ready) {
        var bestWnFreq = 0;
        for (var wnLem in seg.freqMap) {
          if (!seg.freqMap.hasOwnProperty(wnLem)) continue;
          if (seg.freqMap[wnLem] > bestWnFreq) {
            var dist = synDist(w, wnLem, eng.syn, eng.pos, 3);
            if (dist >= 0) { bestWnFreq = seg.freqMap[wnLem]; wnSource = wnLem; }
          }
        }
      }

      var localAct = baseFreq + boost;
      var localNormAct = normFreq + normBoost;
      var globalRel = (ngMode === 1 && relevanceMap && relevanceMap[w]) ? relevanceMap[w] : 1;

      var provenance = null;
      if (baseFreq > 0) provenance = "directo";
      else if (boost > 0) provenance = "vectorial";
      else if (localAct > 0) provenance = "semantico";

      row[w] = {
        freq: localAct,
        normFreq: localNormAct,
        rel: globalRel * (localAct > 0 ? localNormAct : 0),
        act: localAct,
        provenance: provenance,
        provenanceSource: vecSource || wnSource || null,
        provenanceSim: vecSim || 0
      };
    }
    result.push(row);
  }
  return result;
}

// ── computeSegEmo ──
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
        if (tok.emolex[em]) { sums[em] += 1; counts[em] += 1; }
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
// persistentes: boolean — if true, only track words appearing in 2+ segments
function computeFibras(enriched, freqMap, relevanceMap, eng, seeds, numSegs, topN, decay, sortMode, customSegBoundaries, ngMode, persistentes) {
  var segments;
  var hasCustomSegs = customSegBoundaries && customSegBoundaries.length > 0;
  var ng = ngMode || 1;

  if (hasCustomSegs) {
    segments = segmentTextCustom(enriched, customSegBoundaries);
    numSegs = segments.length;
  } else {
    segments = segmentText(enriched, numSegs);
  }

  var globalNgMap = freqMap;
  if (ng === 2) {
    globalNgMap = {};
    for (var si = 0; si < segments.length; si++) {
      var m2 = segments[si].ng2Map || {};
      for (var k2 in m2) { if (m2.hasOwnProperty(k2)) globalNgMap[k2] = (globalNgMap[k2] || 0) + m2[k2]; }
    }
  } else if (ng === 3) {
    globalNgMap = {};
    for (var si2 = 0; si2 < segments.length; si2++) {
      var m3 = segments[si2].ng3Map || {};
      for (var k3 in m3) { if (m3.hasOwnProperty(k3)) globalNgMap[k3] = (globalNgMap[k3] || 0) + m3[k3]; }
    }
  }

  var effectiveRelMap = ng === 1 ? relevanceMap : {};

  var nodeWords = selectWords(globalNgMap, effectiveRelMap, topN, sortMode, ng, persistentes || false, segments);

  var segData = computeSegData(segments, nodeWords, eng, decay, relevanceMap, ng);
  var segEmo = computeSegEmo(segments);

  var maxFreq = 0, maxRel = 0, maxSegFreq = 0, maxSegRel = 0, maxSegNormFreq = 0;
  for (var i = 0; i < nodeWords.length; i++) {
    var ww = nodeWords[i];
    if ((globalNgMap[ww] || 0) > maxFreq) maxFreq = globalNgMap[ww];
    if ((effectiveRelMap[ww] || 1) > maxRel) maxRel = effectiveRelMap[ww] || 1;
  }
  for (var si3 = 0; si3 < segData.length; si3++) {
    for (var wi2 = 0; wi2 < nodeWords.length; wi2++) {
      var entry = segData[si3][nodeWords[wi2]];
      if (entry) {
        if (entry.freq > maxSegFreq) maxSegFreq = entry.freq;
        if (entry.rel > maxSegRel) maxSegRel = entry.rel;
        if (entry.normFreq > maxSegNormFreq) maxSegNormFreq = entry.normFreq;
      }
    }
  }

  var vecClusterMap = ng === 1
    ? clusterByVec(nodeWords, eng, Math.min(8, Math.max(3, Math.floor(nodeWords.length / 4))))
    : {};

  return {
    nodeWords: nodeWords,
    segments: segments,
    segData: segData,
    segEmo: segEmo,
    numSegs: numSegs,
    freqMap: globalNgMap,
    relevanceMap: effectiveRelMap,
    maxFreq: maxFreq || 1,
    maxRel: maxRel || 1,
    maxSegFreq: maxSegFreq || 1,
    maxSegRel: maxSegRel || 1,
    maxSegNormFreq: maxSegNormFreq || 1,
    decay: decay,
    vecClusterMap: vecClusterMap,
    hasCustomSegs: hasCustomSegs,
    ngMode: ng,
    persistentes: persistentes || false
  };
}

// ── buildWindowedLayout ──
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

  var padLeft = 80;
  var padRight = 20;
  var padTop = 20;
  var emoBarH = 40;
  var padBottom = 10;
  var chartW = canvasW - padLeft - padRight;
  var chartH = canvasH - padTop - emoBarH - padBottom;

  var colW = numCols > 0 ? chartW / numCols : chartW;
  var nodeW = Math.max(4, Math.min(colW * 0.4, 30));
  var gapY = 2;

  var columns = [];
  for (var c = 0; c < numCols; c++) {
    var colX;
    if (numCols === 1) {
      colX = padLeft + chartW / 2;
    } else {
      colX = padLeft + (c / (numCols - 1)) * chartW;
    }
    var segIdx0 = winStart + c;
    var segLabel = segments[segIdx0] ? segments[segIdx0].label : null;
    columns.push({ x: colX, segIdx: segIdx0, label: segLabel });
  }

  var wordRank = {};
  for (var ri = 0; ri < nodeWords.length; ri++) {
    wordRank[nodeWords[ri]] = ri;
  }

  var maxFreq = 0, maxRel = 0;
  for (var mi = 0; mi < nodeWords.length; mi++) {
    var mw = nodeWords[mi];
    if (freqMap[mw] > maxFreq) maxFreq = freqMap[mw];
    if ((relevanceMap[mw] || 1) > maxRel) maxRel = relevanceMap[mw] || 1;
  }
  if (maxFreq === 0) maxFreq = 1;
  if (maxRel === 0) maxRel = 1;

  var maxSegFreq = fibras.maxSegFreq;
  var maxSegRel = fibras.maxSegRel;
  var maxSegNormFreq = fibras.maxSegNormFreq;

  var numWords = nodeWords.length;
  var totalGap = (numWords - 1) * gapY;
  var availH = Math.max(10, chartH - totalGap);
  var baseNodeH = numWords > 0 ? availH / numWords : 10;
  var minNodeH = 1;
  var maxNodeH = Math.max(minNodeH + 1, baseNodeH * 2);

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
    var cluster = fibras.vecClusterMap ? (fibras.vecClusterMap[w] || 0) : 0;
    return CC[cluster % CC.length];
  }

  var wordSlots = [];
  for (var wi = 0; wi < nodeWords.length; wi++) {
    var w = nodeWords[wi];
    var freq = freqMap[w] || 0;
    var rel = relevanceMap[w] || 1;
    var rank = wi;
    var isSeed = seeds && seeds.has ? seeds.has(w) : false;
    var color = getWordColor(w, rank);
    var y = padTop + rank * (baseNodeH + gapY);

    var slotNodes = [];
    var firstRealCol = -1, lastRealCol = -1;

    for (var c2 = 0; c2 < numCols; c2++) {
      var segIdx = winStart + c2;
      var segEntry = segData[segIdx] ? segData[segIdx][w] : null;
      var localFreq = segEntry ? segEntry.freq : 0;
      var localNormFreq = segEntry ? segEntry.normFreq : 0;
      var localRel = segEntry ? segEntry.rel : 0;
      var isReal = segEntry ? segEntry.act > 0 : false;

      var primaryVal, secondaryVal, primaryNorm, secondaryNorm;
      if (sortMode === "relevance") {
        primaryVal = localRel;
        secondaryVal = localNormFreq;
        primaryNorm = maxSegRel > 0 ? localRel / maxSegRel : 0;
        secondaryNorm = maxSegNormFreq > 0 ? localNormFreq / maxSegNormFreq : 0;
      } else {
        primaryVal = localNormFreq;
        secondaryVal = localRel;
        primaryNorm = maxSegNormFreq > 0 ? localNormFreq / maxSegNormFreq : 0;
        secondaryNorm = maxSegRel > 0 ? localRel / maxSegRel : 0;
      }

      var nodeH = isReal ? minNodeH + primaryNorm * (maxNodeH - minNodeH) : 0;
      var opacity = isReal ? 0.25 + secondaryNorm * 0.75 : 0;

      if (isReal) {
        if (firstRealCol === -1) firstRealCol = c2;
        lastRealCol = c2;
      }

      slotNodes.push({
        col: c2, segIdx: segIdx,
        x: columns[c2].x - nodeW / 2,
        y: y + (baseNodeH - nodeH) / 2,
        w: nodeW, h: nodeH,
        isReal: isReal, opacity: opacity,
        primary: primaryVal, secondary: secondaryVal,
        primaryNorm: primaryNorm, secondaryNorm: secondaryNorm,
        provenance: segEntry ? segEntry.provenance : null,
        provenanceSource: segEntry ? segEntry.provenanceSource : null,
        provenanceSim: segEntry ? segEntry.provenanceSim : 0
      });
    }

    var slotLinks = [];
    if (firstRealCol >= 0 && lastRealCol > firstRealCol) {
      for (var c3 = firstRealCol; c3 < lastRealCol; c3++) {
        var srcNode = slotNodes[c3];
        var tgtNode = slotNodes[c3 + 1];
        if (srcNode.isReal && tgtNode.isReal) {
          slotLinks.push({ srcCol: c3, tgtCol: c3 + 1, srcNode: srcNode, tgtNode: tgtNode });
        }
      }
    }

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
      word: w, rank: rank, freq: freq, rel: rel,
      isSeed: isSeed, color: color, y: y, slotH: baseNodeH,
      nodes: slotNodes, links: slotLinks,
      firstRealCol: firstRealCol, lastRealCol: lastRealCol,
      labelCols: labelCols
    });
  }

  // ── Cross-stream links ──
  var crossLinks = [];
  var SIM_THRESHOLD = 0.5;
  if (eng && eng.vec && eng.vec.isLoaded()) {
    for (var xwi = 0; xwi < wordSlots.length; xwi++) {
      var slotA = wordSlots[xwi];
      for (var xc = 0; xc < numCols - 1; xc++) {
        var nodeA = slotA.nodes[xc];
        var nodeANext = slotA.nodes[xc + 1];
        if (!nodeA.isReal || nodeANext.isReal) continue;
        for (var xwj = 0; xwj < wordSlots.length; xwj++) {
          if (xwi === xwj) continue;
          var slotB = wordSlots[xwj];
          var nodeB = slotB.nodes[xc + 1];
          if (!nodeB.isReal) continue;
          var sim = eng.vec.similarity(slotA.word, slotB.word);
          if (sim >= SIM_THRESHOLD) {
            crossLinks.push({
              srcSlotIdx: xwi, tgtSlotIdx: xwj,
              srcNode: nodeA, tgtNode: nodeB,
              srcWord: slotA.word, tgtWord: slotB.word,
              srcColor: slotA.color, tgtColor: slotB.color,
              similarity: sim, srcCol: xc, tgtCol: xc + 1
            });
          }
        }
      }
    }
  }

  var emoBars = [];
  for (var c4 = 0; c4 < numCols; c4++) {
    var segIdx2 = winStart + c4;
    var emo = segEmo[segIdx2] || { joy: 0, fear: 0, sadness: 0, anger: 0 };
    emoBars.push({ segIdx: segIdx2, x: columns[c4].x, joy: emo.joy, fear: emo.fear, sadness: emo.sadness, anger: emo.anger });
  }

  var segPolarity = [], segArousal = [];
  for (var sp = 0; sp < segments.length; sp++) {
    var sToks = segments[sp].tokens;
    var polSum = 0, polCount = 0, aroSum = 0, aroCount = 0;
    for (var st = 0; st < sToks.length; st++) {
      if (sToks[st].polarity !== null && sToks[st].polarity !== undefined) { polSum += sToks[st].polarity; polCount++; }
      if (sToks[st].arousal !== null && sToks[st].arousal !== undefined) { aroSum += sToks[st].arousal; aroCount++; }
    }
    segPolarity.push(polCount > 0 ? polSum / polCount : 0);
    segArousal.push(aroCount > 0 ? aroSum / aroCount : 0);
  }

  return {
    columns: columns, wordSlots: wordSlots, crossLinks: crossLinks,
    emoBars: emoBars, segPolarity: segPolarity, segArousal: segArousal,
    canvasW: canvasW, canvasH: canvasH, chartH: chartH,
    padLeft: padLeft, padTop: padTop,
    emoBarY: padTop + chartH + 4, emoBarH: emoBarH,
    nodeW: nodeW, colW: colW,
    maxFreq: maxFreq, maxRel: maxRel,
    numCols: numCols, wordRank: wordRank,
    hasCustomSegs: fibras.hasCustomSegs
  };
}
