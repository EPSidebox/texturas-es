// ─────────────────────────────────────────────
// fibras-render.js — Texturas (ES) v2.0
// P5 canvas rendering for Fibras visualization
// Reads: T, EC, CC from config.js
// Reads: buildWindowedLayout from fibras-data.js
// Reads: React hook aliases from config.js
// Exports: FibrasChart, FibrasMinimap, FibrasDocStack, FibrasMultiDoc
// ─────────────────────────────────────────────

// ── Helper: parse hex color to [r, g, b] ──
function _hexToRgb(hex) {
  var h = hex.replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Helper: lerp between two [r,g,b] arrays ──
function _lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t)
  ];
}

// ── Helper: polarity to rgb ──
var _polPositive = _hexToRgb(T.positive);
var _polNegative = _hexToRgb(T.negative);
var _polNeutral = _hexToRgb(T.neutral);

function _polarityToRgb(pol) {
  if (pol > 0.05) return _lerpColor(_polNeutral, _polPositive, Math.min(1, pol * 4));
  if (pol < -0.05) return _lerpColor(_polNeutral, _polNegative, Math.min(1, -pol * 4));
  return _polNeutral;
}

// ── FibrasChart ──
// Main P5 canvas renderer.
// Props: {layout, seeds, hoveredWord, setHoveredWord, lockedWords, toggleLocked, enabledEmos}
function FibrasChart(props) {
  var layout = props.layout;

  var containerRef = useRef(null);
  var p5Ref = useRef(null);
  var propsRef = useRef(props);
  propsRef.current = props;

  useEffect(function() {
    if (!containerRef.current || !layout) return;

    if (p5Ref.current) {
      p5Ref.current.remove();
      p5Ref.current = null;
    }

    var sketch = function(p) {
      p.setup = function() {
        var cnv = p.createCanvas(layout.canvasW, layout.canvasH);
        cnv.style("display", "block");
        p.textFont("Roboto Mono");
        p.noLoop();
      };

      p.draw = function() {
        var lay = propsRef.current.layout;
        var hWord = propsRef.current.hoveredWord;
        var locked = propsRef.current.lockedWords;
        var emos = propsRef.current.enabledEmos;
        if (!lay) return;

        var hasHighlight = !!(hWord || (locked && locked.size > 0));

        p.background(17);

        // ── Segment labels at top of chart area ──
        p.textSize(9);
        p.textAlign(p.CENTER, p.TOP);
        p.fill(100);
        p.noStroke();
        for (var ci = 0; ci < lay.columns.length; ci++) {
          p.text((lay.columns[ci].segIdx + 1), lay.columns[ci].x, lay.padTop - 14);
        }

        // ── Draw streams (links then nodes, back to front by rank) ──
        for (var wi = lay.wordSlots.length - 1; wi >= 0; wi--) {
          var slot = lay.wordSlots[wi];
          var rgb = _hexToRgb(slot.color);
          var isActive = !hasHighlight ||
            slot.word === hWord ||
            (locked && locked.has(slot.word)) ||
            (propsRef.current.seeds && propsRef.current.seeds.has(slot.word));
          var dimAlpha = isActive ? 1.0 : 0.08;

          // ── Draw ribbon links ──
          for (var li = 0; li < slot.links.length; li++) {
            var link = slot.links[li];
            var src = link.srcNode;
            var tgt = link.tgtNode;

            var srcTop = src.y;
            var srcBot = src.y + src.h;
            var srcRight = src.x + src.w;
            var tgtTop = tgt.y;
            var tgtBot = tgt.y + tgt.h;
            var tgtLeft = tgt.x;

            var cpOff = (tgtLeft - srcRight) / 3;
            var srcAlpha = src.opacity * dimAlpha;
            var tgtAlpha = tgt.opacity * dimAlpha;
            var steps = 12;

            p.noStroke();
            for (var si = 0; si < steps; si++) {
              var t0 = si / steps;
              var t1 = (si + 1) / steps;

              var a0 = srcAlpha + (tgtAlpha - srcAlpha) * t0;
              var a1 = srcAlpha + (tgtAlpha - srcAlpha) * t1;
              var aMid = (a0 + a1) / 2;

              var topX0 = p.bezierPoint(srcRight, srcRight + cpOff, tgtLeft - cpOff, tgtLeft, t0);
              var topY0 = p.bezierPoint(srcTop, srcTop, tgtTop, tgtTop, t0);
              var topX1 = p.bezierPoint(srcRight, srcRight + cpOff, tgtLeft - cpOff, tgtLeft, t1);
              var topY1 = p.bezierPoint(srcTop, srcTop, tgtTop, tgtTop, t1);

              var botX0 = p.bezierPoint(srcRight, srcRight + cpOff, tgtLeft - cpOff, tgtLeft, t0);
              var botY0 = p.bezierPoint(srcBot, srcBot, tgtBot, tgtBot, t0);
              var botX1 = p.bezierPoint(srcRight, srcRight + cpOff, tgtLeft - cpOff, tgtLeft, t1);
              var botY1 = p.bezierPoint(srcBot, srcBot, tgtBot, tgtBot, t1);

              p.fill(rgb[0], rgb[1], rgb[2], aMid * 255);
              p.beginShape();
              p.vertex(topX0, topY0);
              p.vertex(topX1, topY1);
              p.vertex(botX1, botY1);
              p.vertex(botX0, botY0);
              p.endShape(p.CLOSE);
            }
          }

          // ── Draw nodes ──
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var node = slot.nodes[ni];
            if (!node.isReal) continue;

            var nAlpha = node.opacity * dimAlpha;
            p.fill(rgb[0], rgb[1], rgb[2], nAlpha * 255);
            p.noStroke();
            p.rect(node.x, node.y, node.w, node.h);
          }

          // ── Draw labels ──
          if (isActive || !hasHighlight) {
            p.textSize(9);
            p.textAlign(p.RIGHT, p.CENTER);
            p.fill(255, 255, 255, dimAlpha * 220);
            p.noStroke();
            for (var lci = 0; lci < slot.labelCols.length; lci++) {
              var lCol = slot.labelCols[lci];
              var lNode = slot.nodes[lCol];
              if (lNode && lNode.isReal) {
                var labelX = lNode.x - 4;
                var labelY = lNode.y + lNode.h / 2;
                p.text(slot.word, labelX, labelY);
              }
            }
          }
        }

        // ── Cross-stream links ──
        if (lay.crossLinks && lay.crossLinks.length > 0) {
          for (var cli = 0; cli < lay.crossLinks.length; cli++) {
            var cl = lay.crossLinks[cli];

            var clActive = !hasHighlight ||
              cl.srcWord === hWord || cl.tgtWord === hWord ||
              (locked && (locked.has(cl.srcWord) || locked.has(cl.tgtWord))) ||
              (propsRef.current.seeds && (propsRef.current.seeds.has(cl.srcWord) || propsRef.current.seeds.has(cl.tgtWord)));
            var clDim = clActive ? 1.0 : 0.08;

            var clSrc = cl.srcNode;
            var clTgt = cl.tgtNode;
            var clSrcRgb = _hexToRgb(cl.srcColor);
            var clTgtRgb = _hexToRgb(cl.tgtColor);

            var clSrcTop = clSrc.y;
            var clSrcBot = clSrc.y + clSrc.h;
            var clSrcRight = clSrc.x + clSrc.w;
            var clTgtTop = clTgt.y;
            var clTgtBot = clTgt.y + clTgt.h;
            var clTgtLeft = clTgt.x;

            var clCpOff = (clTgtLeft - clSrcRight) / 3;
            var clSrcAlpha = clSrc.opacity * clDim * 0.5 * cl.similarity;
            var clTgtAlpha = clTgt.opacity * clDim * 0.5 * cl.similarity;
            var clSteps = 10;

            p.noStroke();
            for (var csi = 0; csi < clSteps; csi++) {
              var ct0 = csi / clSteps;
              var ct1 = (csi + 1) / clSteps;
              var caMid = clSrcAlpha + (clTgtAlpha - clSrcAlpha) * ((ct0 + ct1) / 2);
              var cRgbMid = _lerpColor(clSrcRgb, clTgtRgb, (ct0 + ct1) / 2);

              var ctTopX0 = p.bezierPoint(clSrcRight, clSrcRight + clCpOff, clTgtLeft - clCpOff, clTgtLeft, ct0);
              var ctTopY0 = p.bezierPoint(clSrcTop, clSrcTop, clTgtTop, clTgtTop, ct0);
              var ctTopX1 = p.bezierPoint(clSrcRight, clSrcRight + clCpOff, clTgtLeft - clCpOff, clTgtLeft, ct1);
              var ctTopY1 = p.bezierPoint(clSrcTop, clSrcTop, clTgtTop, clTgtTop, ct1);

              var ctBotX0 = p.bezierPoint(clSrcRight, clSrcRight + clCpOff, clTgtLeft - clCpOff, clTgtLeft, ct0);
              var ctBotY0 = p.bezierPoint(clSrcBot, clSrcBot, clTgtBot, clTgtBot, ct0);
              var ctBotX1 = p.bezierPoint(clSrcRight, clSrcRight + clCpOff, clTgtLeft - clCpOff, clTgtLeft, ct1);
              var ctBotY1 = p.bezierPoint(clSrcBot, clSrcBot, clTgtBot, clTgtBot, ct1);

              p.fill(cRgbMid[0], cRgbMid[1], cRgbMid[2], caMid * 255);
              p.beginShape();
              p.vertex(ctTopX0, ctTopY0);
              p.vertex(ctTopX1, ctTopY1);
              p.vertex(ctBotX1, ctBotY1);
              p.vertex(ctBotX0, ctBotY0);
              p.endShape(p.CLOSE);
            }
          }
        }
      };

      // ── Mouse interaction ──
      p.mouseMoved = function() {
        if (!propsRef.current.layout) return;
        var lay = propsRef.current.layout;
        var mx = p.mouseX, my = p.mouseY;

        if (mx < 0 || mx > lay.canvasW || my < 0 || my > lay.canvasH) {
          if (propsRef.current.hoveredWord) propsRef.current.setHoveredWord(null);
          return;
        }

        var found = null;
        for (var wi = 0; wi < lay.wordSlots.length; wi++) {
          var slot = lay.wordSlots[wi];
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var node = slot.nodes[ni];
            if (!node.isReal) continue;
            if (mx >= node.x && mx <= node.x + node.w &&
                my >= node.y && my <= node.y + node.h) {
              found = slot.word;
              break;
            }
          }
          if (found) break;

          for (var li = 0; li < slot.links.length; li++) {
            var link = slot.links[li];
            var srcR = link.srcNode.x + link.srcNode.w;
            var tgtL = link.tgtNode.x;
            var minY = Math.min(link.srcNode.y, link.tgtNode.y);
            var maxY = Math.max(link.srcNode.y + link.srcNode.h, link.tgtNode.y + link.tgtNode.h);
            if (mx >= srcR && mx <= tgtL && my >= minY && my <= maxY) {
              found = slot.word;
              break;
            }
          }
          if (found) break;
        }

        if (found !== propsRef.current.hoveredWord) {
          propsRef.current.setHoveredWord(found);
        }
      };

      p.mousePressed = function() {
        if (!propsRef.current.layout) return;
        var lay = propsRef.current.layout;
        var mx = p.mouseX, my = p.mouseY;

        if (mx < 0 || mx > lay.canvasW || my < 0 || my > lay.canvasH) return;

        for (var wi = 0; wi < lay.wordSlots.length; wi++) {
          var slot = lay.wordSlots[wi];
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var node = slot.nodes[ni];
            if (!node.isReal) continue;
            if (mx >= node.x && mx <= node.x + node.w &&
                my >= node.y && my <= node.y + node.h) {
              if (propsRef.current.toggleLocked) {
                propsRef.current.toggleLocked(slot.word);
              }
              return;
            }
          }
          for (var li = 0; li < slot.links.length; li++) {
            var link = slot.links[li];
            var srcR = link.srcNode.x + link.srcNode.w;
            var tgtL = link.tgtNode.x;
            var minY = Math.min(link.srcNode.y, link.tgtNode.y);
            var maxY = Math.max(link.srcNode.y + link.srcNode.h, link.tgtNode.y + link.tgtNode.h);
            if (mx >= srcR && mx <= tgtL && my >= minY && my <= maxY) {
              if (propsRef.current.toggleLocked) {
                propsRef.current.toggleLocked(slot.word);
              }
              return;
            }
          }
        }
      };
    };

    p5Ref.current = new p5(sketch, containerRef.current);

    return function() {
      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }
    };
  }, [layout]);

  useEffect(function() {
    if (p5Ref.current) {
      p5Ref.current.redraw();
    }
  }, [props.hoveredWord, props.lockedWords, props.seeds, props.enabledEmos]);

  return React.createElement("div", {
    ref: containerRef,
    style: {
      background: T.bg,
      borderRadius: T.radius6,
      border: "1px solid " + T.border,
      overflow: "hidden"
    }
  });
}

// ── FibrasMinimap ──
// Always visible. Full width of chart. Polarity background + arousal line + navigation.
// Props: {numSegs, winStart, winSize, setWinStart, fibras, chartWidth}
function FibrasMinimap(props) {
  var numSegs = props.numSegs;
  var winStart = props.winStart;
  var winSize = props.winSize;
  var setWinStart = props.setWinStart;
  var fibras = props.fibras;
  var chartWidth = props.chartWidth || 700;

  var maxStart = Math.max(0, numSegs - winSize);
  var barH = 28;
  var segW = chartWidth / numSegs;

  // Get polarity and arousal data from layout or fibras
  var segPolarity = props.segPolarity || [];
  var segArousal = props.segArousal || [];

  // Find max arousal for normalization
  var maxArousal = 0;
  for (var ai = 0; ai < segArousal.length; ai++) {
    if (segArousal[ai] > maxArousal) maxArousal = segArousal[ai];
  }
  if (maxArousal === 0) maxArousal = 1;

  var navW = (winSize / numSegs) * chartWidth;
  var navX = (winStart / numSegs) * chartWidth;

  function handleClick(ev) {
    var rect = ev.currentTarget.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    var clickedSeg = Math.floor((x / chartWidth) * numSegs);
    var newStart = Math.max(0, Math.min(clickedSeg - Math.floor(winSize / 2), maxStart));
    setWinStart(newStart);
  }

  // Build arousal line points
  var arousalPoints = [];
  for (var api = 0; api < segArousal.length; api++) {
    var ax = (api + 0.5) * segW;
    var ay = barH - 3 - ((segArousal[api] / maxArousal) * (barH - 6));
    arousalPoints.push({ x: ax, y: ay });
  }

  return React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: T.gap6 }
  },
    // ◀ button
    numSegs > winSize && React.createElement("button", {
      onClick: function() { setWinStart(Math.max(0, winStart - 1)); },
      disabled: winStart <= 0,
      style: {
        background: "transparent",
        border: "1px solid " + T.borderLight,
        color: winStart <= 0 ? T.textFaint : T.textMid,
        borderRadius: T.radius3,
        padding: "2px 6px",
        fontSize: T.fs12,
        fontFamily: T.fontMono,
        cursor: winStart <= 0 ? "default" : "pointer",
        flexShrink: 0
      }
    }, "\u25C0"),

    // Minimap bar
    React.createElement("div", {
      onClick: handleClick,
      style: {
        position: "relative",
        width: chartWidth,
        height: barH,
        border: "1px solid " + T.border,
        borderRadius: T.radius3,
        cursor: "pointer",
        overflow: "hidden",
        flexShrink: 0
      }
    },
      // Polarity background per segment
      segPolarity.map(function(pol, i) {
        var rgb = _polarityToRgb(pol);
        return React.createElement("div", {
          key: i,
          style: {
            position: "absolute",
            left: i * segW,
            top: 0,
            width: Math.ceil(segW) + 1,
            height: barH,
            background: "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")",
            opacity: 0.35
          }
        });
      }),

      // Arousal line (SVG overlay)
      arousalPoints.length > 1 && React.createElement("svg", {
        style: { position: "absolute", top: 0, left: 0, width: chartWidth, height: barH, pointerEvents: "none" }
      },
        React.createElement("polyline", {
          points: arousalPoints.map(function(pt) { return pt.x + "," + pt.y; }).join(" "),
          fill: "none",
          stroke: "white",
          strokeWidth: 1.5,
          strokeLinejoin: "round",
          opacity: 0.8
        })
      ),

      // Navigator window (only if scrollable)
      numSegs > winSize && React.createElement("div", {
        style: {
          position: "absolute",
          left: navX,
          top: 0,
          width: navW,
          height: barH,
          border: "2px solid " + T.accent,
          borderRadius: T.radius3,
          background: T.accent + "15",
          pointerEvents: "none"
        }
      })
    ),

    // ▶ button
    numSegs > winSize && React.createElement("button", {
      onClick: function() { setWinStart(Math.min(maxStart, winStart + 1)); },
      disabled: winStart >= maxStart,
      style: {
        background: "transparent",
        border: "1px solid " + T.borderLight,
        color: winStart >= maxStart ? T.textFaint : T.textMid,
        borderRadius: T.radius3,
        padding: "2px 6px",
        fontSize: T.fs12,
        fontFamily: T.fontMono,
        cursor: winStart >= maxStart ? "default" : "pointer",
        flexShrink: 0
      }
    }, "\u25B6")
  );
}

// ── FibrasEmoBars ──
// Emotion intensity bars per visible segment. Rendered as React component above chart.
// Props: {layout, enabledEmos}
function FibrasEmoBars(props) {
  var layout = props.layout;
  var enabledEmos = props.enabledEmos;
  if (!layout || !layout.emoBars || layout.emoBars.length === 0) return null;

  var emoKeys = ["joy", "fear", "sadness", "anger"];
  var barH = layout.emoBarH - 8;
  var barW = Math.max(2, layout.nodeW * 0.6);

  // Find max for normalization
  var maxEmo = 0;
  for (var i = 0; i < layout.emoBars.length; i++) {
    for (var k = 0; k < emoKeys.length; k++) {
      var v = layout.emoBars[i][emoKeys[k]];
      if (v > maxEmo) maxEmo = v;
    }
  }
  if (maxEmo === 0) maxEmo = 1;

  return React.createElement("div", {
    style: {
      position: "relative",
      width: layout.canvasW,
      height: layout.emoBarH,
      marginLeft: 0
    }
  },
    layout.emoBars.map(function(ebar, ebi) {
      var activeKeys = emoKeys.filter(function(ek) { return enabledEmos && enabledEmos.has(ek); });
      var totalW = activeKeys.length * barW + (activeKeys.length - 1) * 1;
      var startX = ebar.x - totalW / 2;

      return React.createElement("div", { key: ebi }, activeKeys.map(function(ek, eki) {
        var eVal = ebar[ek] || 0;
        var eH = (eVal / maxEmo) * barH;
        return React.createElement("div", {
          key: ek,
          style: {
            position: "absolute",
            left: startX + eki * (barW + 1),
            bottom: 2,
            width: barW,
            height: eH,
            background: EC[ek],
            opacity: 0.7,
            borderRadius: 1
          }
        });
      }));
    })
  );
}

// ── FibrasDocStack ──
// Single document wrapper. Minimap + emotion bars at top, then chart.
// Props: {fibras, seeds, enabledEmos, docLabel, sortMode, colorMode,
//         lockedWords, toggleLocked, commMap, canvasW, canvasH, eng}
function FibrasDocStack(props) {
  var fibras = props.fibras;
  var seeds = props.seeds;
  var enabledEmos = props.enabledEmos;
  var sortMode = props.sortMode;
  var colorMode = props.colorMode;
  var lockedWords = props.lockedWords;
  var toggleLocked = props.toggleLocked;
  var commMap = props.commMap;
  var canvasW = props.canvasW || 800;
  var canvasH = props.canvasH || 500;
  var engProp = props.eng;

  var winSize = 10;

  var _ws = useState(0);
  var winStart = _ws[0], setWinStart = _ws[1];

  var _hw = useState(null);
  var hoveredWord = _hw[0], setHoveredWord = _hw[1];

  var layout = useMemo(function() {
    if (!fibras) return null;
    return buildWindowedLayout(
      fibras, winStart, winSize, seeds, sortMode, colorMode,
      canvasW, canvasH, commMap, engProp
    );
  }, [fibras, winStart, winSize, seeds, sortMode, colorMode, canvasW, canvasH, commMap, engProp]);

  if (!fibras) return null;

  // Chart width for minimap (match the Sankey area)
  var chartAreaW = canvasW - (layout ? layout.padLeft : 80) - 20;

  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", gap: T.gap4 }
  },
    // Doc label
    props.docLabel && React.createElement("div", {
      style: { fontSize: T.fs10, color: T.textMid, fontFamily: T.fontMono }
    }, props.docLabel),

    // Minimap (top, always visible)
    React.createElement("div", {
      style: { marginLeft: layout ? layout.padLeft : 80 }
    },
      React.createElement(FibrasMinimap, {
        numSegs: fibras.numSegs,
        winStart: winStart,
        winSize: winSize,
        setWinStart: setWinStart,
        fibras: fibras,
        chartWidth: chartAreaW,
        segPolarity: layout ? layout.segPolarity : [],
        segArousal: layout ? layout.segArousal : []
      })
    ),

    // Emotion bars (below minimap, above chart)
    layout && React.createElement(FibrasEmoBars, {
      layout: layout,
      enabledEmos: enabledEmos
    }),

    // Chart
    React.createElement(FibrasChart, {
      layout: layout,
      seeds: seeds,
      hoveredWord: hoveredWord,
      setHoveredWord: setHoveredWord,
      lockedWords: lockedWords,
      toggleLocked: toggleLocked,
      enabledEmos: enabledEmos
    })
  );
}

// ── FibrasMultiDoc ──
// Multi-document manager.
// Props: {selectedArr, fibrasDataMap, seedArr, enabledEmos, docs,
//         compareMode, sortMode, colorMode, lockedWords, toggleLocked,
//         commMapByDoc, canvasW, canvasH, eng}
function FibrasMultiDoc(props) {
  var selectedArr = props.selectedArr || [];
  var fibrasDataMap = props.fibrasDataMap || {};
  var seeds = props.seedArr;
  var enabledEmos = props.enabledEmos;
  var docs = props.docs || [];
  var compareMode = props.compareMode;
  var sortMode = props.sortMode;
  var colorMode = props.colorMode;
  var lockedWords = props.lockedWords;
  var toggleLocked = props.toggleLocked;
  var commMapByDoc = props.commMapByDoc || {};
  var canvasW = props.canvasW || 800;
  var canvasH = props.canvasH || 500;
  var engProp = props.eng;

  if (selectedArr.length === 0) {
    return React.createElement("div", {
      style: { color: T.textDim, fontFamily: T.fontMono, fontSize: T.fs12, padding: T.pad16 }
    }, "Selecciona un documento para ver Fibras.");
  }

  // Single document
  if (selectedArr.length === 1 || compareMode !== "stack") {
    var docId = selectedArr[0];
    var doc = null;
    for (var di = 0; di < docs.length; di++) {
      if (docs[di].id === docId) { doc = docs[di]; break; }
    }
    return React.createElement(FibrasDocStack, {
      fibras: fibrasDataMap[docId],
      seeds: seeds,
      enabledEmos: enabledEmos,
      docLabel: doc ? doc.label : "",
      sortMode: sortMode,
      colorMode: colorMode,
      lockedWords: lockedWords,
      toggleLocked: toggleLocked,
      commMap: commMapByDoc[docId],
      canvasW: canvasW,
      canvasH: canvasH,
      eng: engProp
    });
  }

  // Stacked view
  var stackH = Math.max(300, Math.floor(canvasH / selectedArr.length));
  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", gap: T.gap12 }
  },
    selectedArr.map(function(docId) {
      var doc = null;
      for (var di = 0; di < docs.length; di++) {
        if (docs[di].id === docId) { doc = docs[di]; break; }
      }
      return React.createElement(FibrasDocStack, {
        key: docId,
        fibras: fibrasDataMap[docId],
        seeds: seeds,
        enabledEmos: enabledEmos,
        docLabel: doc ? doc.label : "",
        sortMode: sortMode,
        colorMode: colorMode,
        lockedWords: lockedWords,
        toggleLocked: toggleLocked,
        commMap: commMapByDoc[docId],
        canvasW: canvasW,
        canvasH: stackH,
        eng: engProp
      });
    })
  );
}
