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

// ── FibrasChart ──
// Main P5 canvas renderer. Uses P5 instance mode.
// Props: {layout, seeds, hoveredWord, setHoveredWord, lockedWords, toggleLocked, enabledEmos}
function FibrasChart(props) {
  var layout = props.layout;
  var seeds = props.seeds;
  var hoveredWord = props.hoveredWord;
  var setHoveredWord = props.setHoveredWord;
  var lockedWords = props.lockedWords;
  var toggleLocked = props.toggleLocked;
  var enabledEmos = props.enabledEmos;

  var containerRef = useRef(null);
  var p5Ref = useRef(null);

  // Store props in a ref so the P5 sketch can access current values
  var propsRef = useRef(props);
  propsRef.current = props;

  useEffect(function() {
    if (!containerRef.current || !layout) return;

    // Clean up previous instance
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

        p.background(17); // #111

        // ── Segment labels at top ──
        p.textSize(9);
        p.textAlign(p.CENTER, p.TOP);
        p.fill(100);
        p.noStroke();
        for (var ci = 0; ci < lay.columns.length; ci++) {
          p.text((lay.columns[ci].segIdx + 1), lay.columns[ci].x, 4);
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

            // Source and target vertical boundaries
            var srcTop = src.y;
            var srcBot = src.y + src.h;
            var srcRight = src.x + src.w;
            var tgtTop = tgt.y;
            var tgtBot = tgt.y + tgt.h;
            var tgtLeft = tgt.x;

            // Control point offset (1/3 of horizontal distance)
            var cpOff = (tgtLeft - srcRight) / 3;

            // Opacity gradient across ribbon
            var srcAlpha = src.opacity * dimAlpha;
            var tgtAlpha = tgt.opacity * dimAlpha;
            var steps = 12;

            p.noStroke();
            for (var si = 0; si < steps; si++) {
              var t0 = si / steps;
              var t1 = (si + 1) / steps;

              // Interpolate alpha
              var a0 = srcAlpha + (tgtAlpha - srcAlpha) * t0;
              var a1 = srcAlpha + (tgtAlpha - srcAlpha) * t1;
              var aMid = (a0 + a1) / 2;

              // Bezier points at t0 and t1 for top curve
              var topX0 = p.bezierPoint(srcRight, srcRight + cpOff, tgtLeft - cpOff, tgtLeft, t0);
              var topY0 = p.bezierPoint(srcTop, srcTop, tgtTop, tgtTop, t0);
              var topX1 = p.bezierPoint(srcRight, srcRight + cpOff, tgtLeft - cpOff, tgtLeft, t1);
              var topY1 = p.bezierPoint(srcTop, srcTop, tgtTop, tgtTop, t1);

              // Bezier points at t0 and t1 for bottom curve
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
            p.rect(node.x, node.y, node.w, node.h, 2);
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

        // ── Emotion bars ──
        if (lay.emoBars && lay.emoBars.length > 0) {
          var emoKeys = ["joy", "fear", "sadness", "anger"];
          var emoColors = {
            joy: _hexToRgb(EC.joy),
            fear: _hexToRgb(EC.fear),
            sadness: _hexToRgb(EC.sadness),
            anger: _hexToRgb(EC.anger)
          };
          var barW = Math.max(2, lay.nodeW * 0.6);
          var emoMaxH = lay.emoBarH - 8;

          // Find max emo value for normalization
          var maxEmo = 0;
          for (var ei = 0; ei < lay.emoBars.length; ei++) {
            for (var ek = 0; ek < emoKeys.length; ek++) {
              var ev = lay.emoBars[ei][emoKeys[ek]];
              if (ev > maxEmo) maxEmo = ev;
            }
          }
          if (maxEmo === 0) maxEmo = 1;

          for (var ebi = 0; ebi < lay.emoBars.length; ebi++) {
            var ebar = lay.emoBars[ebi];
            var activeEmoCount = 0;
            for (var ek2 = 0; ek2 < emoKeys.length; ek2++) {
              if (emos && emos.has(emoKeys[ek2])) activeEmoCount++;
            }
            var totalBarW = activeEmoCount * barW + (activeEmoCount - 1) * 1;
            var exStart = ebar.x - totalBarW / 2;
            var drawn = 0;
            for (var ek3 = 0; ek3 < emoKeys.length; ek3++) {
              var ek3Name = emoKeys[ek3];
              if (!emos || !emos.has(ek3Name)) continue;
              var eVal = ebar[ek3Name] || 0;
              var eH = (eVal / maxEmo) * emoMaxH;
              var eRgb = emoColors[ek3Name];
              p.fill(eRgb[0], eRgb[1], eRgb[2], 180);
              p.noStroke();
              p.rect(exStart + drawn * (barW + 1), lay.emoBarY + emoMaxH - eH, barW, eH, 1);
              drawn++;
            }
          }
        }
      };

      // ── Mouse interaction ──
      p.mouseMoved = function() {
        if (!propsRef.current.layout) return;
        var lay = propsRef.current.layout;
        var mx = p.mouseX, my = p.mouseY;

        // Check if mouse is within canvas
        if (mx < 0 || mx > lay.canvasW || my < 0 || my > lay.canvasH) {
          if (propsRef.current.hoveredWord) propsRef.current.setHoveredWord(null);
          return;
        }

        // Find which word slot the mouse is over
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

          // Also check links (rough bounding box)
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

        // Find clicked word
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
          // Check links
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

  // Redraw when hover/locked/seeds change
  useEffect(function() {
    if (p5Ref.current) {
      p5Ref.current.redraw();
    }
  }, [hoveredWord, lockedWords, seeds, enabledEmos]);

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
// Navigation bar when numSegs > winSize.
// Props: {numSegs, winStart, winSize, setWinStart, fibras}
function FibrasMinimap(props) {
  var numSegs = props.numSegs;
  var winStart = props.winStart;
  var winSize = props.winSize;
  var setWinStart = props.setWinStart;
  var fibras = props.fibras;

  if (numSegs <= winSize) return null;

  var maxStart = numSegs - winSize;

  // Density: how many selected words appear per segment
  var densities = [];
  var maxDensity = 0;
  if (fibras && fibras.segData && fibras.nodeWords) {
    for (var s = 0; s < numSegs; s++) {
      var count = 0;
      for (var wi = 0; wi < fibras.nodeWords.length; wi++) {
        var entry = fibras.segData[s] ? fibras.segData[s][fibras.nodeWords[wi]] : null;
        if (entry && entry.act > 0) count++;
      }
      densities.push(count);
      if (count > maxDensity) maxDensity = count;
    }
  }

  var barW = 600;
  var barH = 28;
  var segW = barW / numSegs;
  var navW = (winSize / numSegs) * barW;
  var navX = (winStart / numSegs) * barW;

  function handleClick(ev) {
    var rect = ev.currentTarget.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    var clickedSeg = Math.floor((x / barW) * numSegs);
    var newStart = Math.max(0, Math.min(clickedSeg - Math.floor(winSize / 2), maxStart));
    setWinStart(newStart);
  }

  return React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: T.gap8, marginTop: T.gap6 }
  },
    // ◀ button
    React.createElement("button", {
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
        cursor: winStart <= 0 ? "default" : "pointer"
      }
    }, "\u25C0"),

    // Minimap bar
    React.createElement("div", {
      onClick: handleClick,
      style: {
        position: "relative",
        width: barW,
        height: barH,
        background: T.bgDeep,
        border: "1px solid " + T.border,
        borderRadius: T.radius3,
        cursor: "pointer",
        overflow: "hidden"
      }
    },
      // Density bars
      densities.map(function(d, i) {
        var h = maxDensity > 0 ? (d / maxDensity) * (barH - 4) : 0;
        return React.createElement("div", {
          key: i,
          style: {
            position: "absolute",
            left: i * segW,
            bottom: 2,
            width: Math.max(1, segW - 1),
            height: h,
            background: T.accent,
            opacity: 0.4,
            borderRadius: 1
          }
        });
      }),
      // Navigator window
      React.createElement("div", {
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
    React.createElement("button", {
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
        cursor: winStart >= maxStart ? "default" : "pointer"
      }
    }, "\u25B6")
  );
}

// ── FibrasDocStack ──
// Single document wrapper. Manages winStart state + minimap + chart.
// Props: {fibras, seeds, enabledEmos, docLabel, sortMode, colorMode,
//         lockedWords, toggleLocked, commMap, canvasW, canvasH}
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

  var winSize = 10;

  var _ws = useState(0);
  var winStart = _ws[0], setWinStart = _ws[1];

  var _hw = useState(null);
  var hoveredWord = _hw[0], setHoveredWord = _hw[1];

  var layout = useMemo(function() {
    if (!fibras) return null;
    return buildWindowedLayout(
      fibras, winStart, winSize, seeds, sortMode, colorMode,
      canvasW, canvasH, commMap
    );
  }, [fibras, winStart, winSize, seeds, sortMode, colorMode, canvasW, canvasH, commMap]);

  if (!fibras) return null;

  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", gap: T.gap4 }
  },
    // Doc label
    props.docLabel && React.createElement("div", {
      style: { fontSize: T.fs10, color: T.textMid, fontFamily: T.fontMono }
    }, props.docLabel),

    // Chart
    React.createElement(FibrasChart, {
      layout: layout,
      seeds: seeds,
      hoveredWord: hoveredWord,
      setHoveredWord: setHoveredWord,
      lockedWords: lockedWords,
      toggleLocked: toggleLocked,
      enabledEmos: enabledEmos
    }),

    // Minimap
    React.createElement(FibrasMinimap, {
      numSegs: fibras.numSegs,
      winStart: winStart,
      winSize: winSize,
      setWinStart: setWinStart,
      fibras: fibras
    })
  );
}

// ── FibrasMultiDoc ──
// Multi-document manager. Routes to single or stacked views.
// Props: {selectedArr, fibrasDataMap, seedArr, enabledEmos, docs,
//         compareMode, sortMode, colorMode, lockedWords, toggleLocked,
//         commMapByDoc, canvasW, canvasH}
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
      canvasH: canvasH
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
        canvasH: stackH
      });
    })
  );
}
