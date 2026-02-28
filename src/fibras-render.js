// ─────────────────────────────────────────────
// fibras-render.js — Texturas (ES) v2.0
// P5 canvas rendering for Fibras visualization
// Brightness-based encoding (no opacity), HSL color model
// Reads: T, EC, CC from config.js
// Reads: buildWindowedLayout from fibras-data.js
// Reads: React hook aliases from config.js
// Exports: FibrasChart, FibrasMinimap, FibrasEmoBars,
//          FibrasDocStack, FibrasMultiDoc
// ─────────────────────────────────────────────

// ── Color helpers ──

function _hexToRgb(hex) {
  var h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  var h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    var d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function _hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var hue2rgb = function(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function _hexToHsl(hex) {
  var rgb = _hexToRgb(hex);
  return _rgbToHsl(rgb[0], rgb[1], rgb[2]);
}

// Compute a color at given brightness level
// baseHsl: [h, s, l] of the stream color
// brightness: 0-1 (0 = near background, 1 = full color)
// bgL: background lightness (T.bg = #111 ≈ L:6.7)
var _bgL = 6.7;

function _colorAtBrightness(baseHsl, brightness) {
  // Interpolate lightness from background to the color's natural lightness
  var targetL = baseHsl[2];
  // Ensure minimum lightness difference from background
  if (targetL < 20) targetL = 20;
  var l = _bgL + (targetL - _bgL) * brightness;
  // Keep saturation, slightly reduce at low brightness for natural look
  var s = baseHsl[1] * (0.3 + brightness * 0.7);
  return _hslToRgb(baseHsl[0], s, l);
}

// Lerp between two HSL colors (hue interpolation via shortest path)
function _lerpHsl(hsl1, hsl2, t) {
  // Hue: shortest path around the wheel
  var h1 = hsl1[0], h2 = hsl2[0];
  var dh = h2 - h1;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  var h = h1 + dh * t;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return [
    h,
    hsl1[1] + (hsl2[1] - hsl1[1]) * t,
    hsl1[2] + (hsl2[2] - hsl1[2]) * t
  ];
}

// Polarity to rgb (for minimap)
var _polPositive = _hexToRgb(T.positive);
var _polNegative = _hexToRgb(T.negative);
var _polNeutral = _hexToRgb(T.neutral);

function _lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t)
  ];
}

function _polarityToRgb(pol) {
  if (pol > 0.05) return _lerpColor(_polNeutral, _polPositive, Math.min(1, pol * 4));
  if (pol < -0.05) return _lerpColor(_polNeutral, _polNegative, Math.min(1, -pol * 4));
  return _polNeutral;
}

// ════════════════════════════════════════════
// FibrasChart — P5 canvas
// ════════════════════════════════════════════
function FibrasChart(props) {
  var containerRef = useRef(null);
  var p5Ref = useRef(null);
  var propsRef = useRef(props);
  propsRef.current = props;

  useEffect(function() {
    if (!containerRef.current || !propsRef.current.layout) return;

    if (p5Ref.current) { p5Ref.current.remove(); p5Ref.current = null; }

    var sketch = function(p) {
      p.setup = function() {
        p.createCanvas(
          propsRef.current.layout.canvasW,
          propsRef.current.layout.canvasH
        ).style("display", "block");
        p.textFont("Roboto Mono");
        p.noLoop();
      };

      p.draw = function() {
        var lay = propsRef.current.layout;
        var hWord = propsRef.current.hoveredWord;
        var locked = propsRef.current.lockedWords;
        if (!lay) return;

        var hasHL = !!(hWord || (locked && locked.size > 0));

        function isWordActive(w) {
          if (!hasHL) return true;
          if (w === hWord) return true;
          if (locked && locked.has(w)) return true;
          if (propsRef.current.seeds && propsRef.current.seeds.has(w)) return true;
          return false;
        }

        p.background(17);

        // ── Vertical guidelines ──
        p.stroke(255, 255, 255, 18);
        p.strokeWeight(1);
        for (var gi = 0; gi < lay.columns.length; gi++) {
          p.line(lay.columns[gi].x, 0, lay.columns[gi].x, lay.canvasH);
        }
        p.noStroke();

        // ── Streams: back-to-front ──
        for (var wi = lay.wordSlots.length - 1; wi >= 0; wi--) {
          var slot = lay.wordSlots[wi];
          var baseHsl = _hexToHsl(slot.color);
          var active = isWordActive(slot.word);

          // ── Ribbon links ──
          for (var li = 0; li < slot.links.length; li++) {
            var lk = slot.links[li];
            var src = lk.srcNode, tgt = lk.tgtNode;
            var sT = src.y, sB = src.y + src.h, sR = src.x + src.w;
            var tT = tgt.y, tB = tgt.y + tgt.h, tL = tgt.x;
            var cp = (tL - sR) / 3;

            // Brightness from secondary metric
            var srcBri = active ? (0.3 + src.secondaryNorm * 0.7) : 0.06;
            var tgtBri = active ? (0.3 + tgt.secondaryNorm * 0.7) : 0.06;
            var steps = 12;

            p.noStroke();
            for (var si = 0; si < steps; si++) {
              var t0 = si / steps, t1 = (si + 1) / steps;
              var tMid = (t0 + t1) / 2;
              var bri = srcBri + (tgtBri - srcBri) * tMid;
              var rgb = _colorAtBrightness(baseHsl, bri);

              var tx0 = p.bezierPoint(sR, sR + cp, tL - cp, tL, t0);
              var ty0t = p.bezierPoint(sT, sT, tT, tT, t0);
              var tx1 = p.bezierPoint(sR, sR + cp, tL - cp, tL, t1);
              var ty1t = p.bezierPoint(sT, sT, tT, tT, t1);
              var ty0b = p.bezierPoint(sB, sB, tB, tB, t0);
              var ty1b = p.bezierPoint(sB, sB, tB, tB, t1);

              p.fill(rgb[0], rgb[1], rgb[2]);
              p.beginShape();
              p.vertex(tx0, ty0t);
              p.vertex(tx1, ty1t);
              p.vertex(tx1, ty1b);
              p.vertex(tx0, ty0b);
              p.endShape(p.CLOSE);
            }
          }

          // ── Nodes ──
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var nd = slot.nodes[ni];
            if (!nd.isReal) continue;
            var nodeBri = active ? (0.3 + nd.secondaryNorm * 0.7) : 0.06;
            var nRgb = _colorAtBrightness(baseHsl, nodeBri);
            p.fill(nRgb[0], nRgb[1], nRgb[2]);
            p.noStroke();
            p.rect(nd.x, nd.y, nd.w, nd.h);
          }

          // ── Labels ──
          if (active || !hasHL) {
            p.textSize(9);
            p.textAlign(p.RIGHT, p.CENTER);
            var lblBri = active ? 0.9 : 0.15;
            var lblRgb = _colorAtBrightness([0, 0, 90], lblBri);
            p.fill(lblRgb[0], lblRgb[1], lblRgb[2]);
            p.noStroke();
            for (var lci = 0; lci < slot.labelCols.length; lci++) {
              var ln = slot.nodes[slot.labelCols[lci]];
              if (ln && ln.isReal) {
                p.text(slot.word, ln.x - 4, ln.y + ln.h / 2);
              }
            }
          }
        }

        // ── Cross-stream links ──
        if (lay.crossLinks) {
          for (var cli = 0; cli < lay.crossLinks.length; cli++) {
            var cl = lay.crossLinks[cli];
            var clActive = isWordActive(cl.srcWord) || isWordActive(cl.tgtWord);

            var cs = cl.srcNode, ct = cl.tgtNode;
            var srcHsl = _hexToHsl(cl.srcColor);
            var tgtHsl = _hexToHsl(cl.tgtColor);

            var csT = cs.y, csB = cs.y + cs.h, csR = cs.x + cs.w;
            var ctT = ct.y, ctB = ct.y + ct.h, ctL = ct.x;
            var ccp = (ctL - csR) / 3;

            // Cross-stream: full brightness throughout, color blends
            var cSrcBri = clActive ? (0.5 + cs.secondaryNorm * 0.5) : 0.06;
            var cTgtBri = clActive ? (0.5 + ct.secondaryNorm * 0.5) : 0.06;
            var cSteps = 12;

            p.noStroke();
            for (var csi = 0; csi < cSteps; csi++) {
              var ct0 = csi / cSteps, ct1 = (csi + 1) / cSteps;
              var cMidT = (ct0 + ct1) / 2;

              // Blend hue from source to target
              var midHsl = _lerpHsl(srcHsl, tgtHsl, cMidT);
              // Brightness stays high — interpolate between source and target brightness
              var cBri = cSrcBri + (cTgtBri - cSrcBri) * cMidT;
              var cRgb = _colorAtBrightness(midHsl, cBri);

              var cx0 = p.bezierPoint(csR, csR + ccp, ctL - ccp, ctL, ct0);
              var cy0t = p.bezierPoint(csT, csT, ctT, ctT, ct0);
              var cx1 = p.bezierPoint(csR, csR + ccp, ctL - ccp, ctL, ct1);
              var cy1t = p.bezierPoint(csT, csT, ctT, ctT, ct1);
              var cy0b = p.bezierPoint(csB, csB, ctB, ctB, ct0);
              var cy1b = p.bezierPoint(csB, csB, ctB, ctB, ct1);

              p.fill(cRgb[0], cRgb[1], cRgb[2]);
              p.beginShape();
              p.vertex(cx0, cy0t);
              p.vertex(cx1, cy1t);
              p.vertex(cx1, cy1b);
              p.vertex(cx0, cy0b);
              p.endShape(p.CLOSE);
            }
          }
        }
      };

      // ── Mouse: hover ──
      p.mouseMoved = function() {
        var lay = propsRef.current.layout;
        if (!lay) return;
        var mx = p.mouseX, my = p.mouseY;
        if (mx < 0 || mx > lay.canvasW || my < 0 || my > lay.canvasH) {
          if (propsRef.current.hoveredWord) propsRef.current.setHoveredWord(null);
          return;
        }
        var found = null;
        for (var wi = 0; wi < lay.wordSlots.length; wi++) {
          var slot = lay.wordSlots[wi];
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var nd = slot.nodes[ni];
            if (!nd.isReal) continue;
            if (mx >= nd.x && mx <= nd.x + nd.w && my >= nd.y && my <= nd.y + nd.h) {
              found = slot.word; break;
            }
          }
          if (found) break;
          for (var li = 0; li < slot.links.length; li++) {
            var lk = slot.links[li];
            var lxMin = lk.srcNode.x + lk.srcNode.w;
            var lxMax = lk.tgtNode.x;
            var lyMin = Math.min(lk.srcNode.y, lk.tgtNode.y);
            var lyMax = Math.max(lk.srcNode.y + lk.srcNode.h, lk.tgtNode.y + lk.tgtNode.h);
            if (mx >= lxMin && mx <= lxMax && my >= lyMin && my <= lyMax) {
              found = slot.word; break;
            }
          }
          if (found) break;
        }
        if (found !== propsRef.current.hoveredWord) {
          propsRef.current.setHoveredWord(found);
        }
      };

      // ── Mouse: click to lock ──
      p.mousePressed = function() {
        var lay = propsRef.current.layout;
        if (!lay) return;
        var mx = p.mouseX, my = p.mouseY;
        if (mx < 0 || mx > lay.canvasW || my < 0 || my > lay.canvasH) return;
        for (var wi = 0; wi < lay.wordSlots.length; wi++) {
          var slot = lay.wordSlots[wi];
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var nd = slot.nodes[ni];
            if (!nd.isReal) continue;
            if (mx >= nd.x && mx <= nd.x + nd.w && my >= nd.y && my <= nd.y + nd.h) {
              if (propsRef.current.toggleLocked) propsRef.current.toggleLocked(slot.word);
              return;
            }
          }
          for (var li = 0; li < slot.links.length; li++) {
            var lk = slot.links[li];
            var lxMin = lk.srcNode.x + lk.srcNode.w;
            var lxMax = lk.tgtNode.x;
            var lyMin = Math.min(lk.srcNode.y, lk.tgtNode.y);
            var lyMax = Math.max(lk.srcNode.y + lk.srcNode.h, lk.tgtNode.y + lk.tgtNode.h);
            if (mx >= lxMin && mx <= lxMax && my >= lyMin && my <= lyMax) {
              if (propsRef.current.toggleLocked) propsRef.current.toggleLocked(slot.word);
              return;
            }
          }
        }
      };
    };

    p5Ref.current = new p5(sketch, containerRef.current);

    return function() {
      if (p5Ref.current) { p5Ref.current.remove(); p5Ref.current = null; }
    };
  }, [props.layout]);

  useEffect(function() {
    if (p5Ref.current) p5Ref.current.redraw();
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

// ════════════════════════════════════════════
// FibrasMinimap
// ════════════════════════════════════════════
function FibrasMinimap(props) {
  var numSegs = props.numSegs;
  var winStart = props.winStart;
  var winSize = props.winSize;
  var setWinStart = props.setWinStart;
  var chartWidth = props.chartWidth || 700;
  var segPolarity = props.segPolarity || [];
  var segArousal = props.segArousal || [];

  var maxStart = Math.max(0, numSegs - winSize);
  var showNav = numSegs > winSize;
  var barH = 28;
  var segW = chartWidth / numSegs;

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
    var seg = Math.floor((x / chartWidth) * numSegs);
    var ns = Math.max(0, Math.min(seg - Math.floor(winSize / 2), maxStart));
    setWinStart(ns);
  }

  var arousalPts = [];
  for (var api = 0; api < segArousal.length; api++) {
    arousalPts.push({
      x: (api + 0.5) * segW,
      y: barH - 3 - ((segArousal[api] / maxArousal) * (barH - 6))
    });
  }

  return React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: T.gap6 }
  },
    React.createElement("button", {
      onClick: function() { if (showNav) setWinStart(Math.max(0, winStart - 1)); },
      disabled: !showNav || winStart <= 0,
      style: {
        background: "transparent",
        border: "1px solid " + (showNav ? T.borderLight : "transparent"),
        color: !showNav || winStart <= 0 ? T.textFaint : T.textMid,
        borderRadius: T.radius3, padding: "2px 6px",
        fontSize: T.fs12, fontFamily: T.fontMono,
        cursor: !showNav || winStart <= 0 ? "default" : "pointer",
        flexShrink: 0, visibility: showNav ? "visible" : "hidden"
      }
    }, "\u25C0"),

    React.createElement("div", {
      onClick: handleClick,
      style: {
        position: "relative", width: chartWidth, height: barH,
        border: "1px solid " + T.border, borderRadius: T.radius3,
        cursor: "pointer", overflow: "hidden", flexShrink: 0
      }
    },
      segPolarity.map(function(pol, i) {
        var rgb = _polarityToRgb(pol);
        return React.createElement("div", {
          key: i,
          style: {
            position: "absolute", left: i * segW, top: 0,
            width: Math.ceil(segW) + 1, height: barH,
            background: "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")",
            opacity: 0.35
          }
        });
      }),
      arousalPts.length > 1 && React.createElement("svg", {
        style: { position: "absolute", top: 0, left: 0, width: chartWidth, height: barH, pointerEvents: "none" }
      },
        React.createElement("polyline", {
          points: arousalPts.map(function(pt) { return pt.x + "," + pt.y; }).join(" "),
          fill: "none", stroke: "white", strokeWidth: 1.5,
          strokeLinejoin: "round", opacity: 0.8
        })
      ),
      showNav && React.createElement("div", {
        style: {
          position: "absolute", left: navX, top: 0,
          width: navW, height: barH,
          border: "2px solid " + T.accent, borderRadius: T.radius3,
          background: T.accent + "15", pointerEvents: "none"
        }
      })
    ),

    React.createElement("button", {
      onClick: function() { if (showNav) setWinStart(Math.min(maxStart, winStart + 1)); },
      disabled: !showNav || winStart >= maxStart,
      style: {
        background: "transparent",
        border: "1px solid " + (showNav ? T.borderLight : "transparent"),
        color: !showNav || winStart >= maxStart ? T.textFaint : T.textMid,
        borderRadius: T.radius3, padding: "2px 6px",
        fontSize: T.fs12, fontFamily: T.fontMono,
        cursor: !showNav || winStart >= maxStart ? "default" : "pointer",
        flexShrink: 0, visibility: showNav ? "visible" : "hidden"
      }
    }, "\u25B6")
  );
}

// ════════════════════════════════════════════
// FibrasEmoBars
// ════════════════════════════════════════════
function FibrasEmoBars(props) {
  var layout = props.layout;
  var enabledEmos = props.enabledEmos;
  if (!layout || !layout.emoBars || layout.emoBars.length === 0) return null;

  var emoKeys = ["joy", "fear", "sadness", "anger"];
  var barH = layout.emoBarH - 8;
  var barW = Math.max(2, layout.nodeW * 0.6);

  var maxEmo = 0;
  for (var i = 0; i < layout.emoBars.length; i++) {
    for (var k = 0; k < emoKeys.length; k++) {
      var v = layout.emoBars[i][emoKeys[k]];
      if (v > maxEmo) maxEmo = v;
    }
  }
  if (maxEmo === 0) maxEmo = 1;

  return React.createElement("div", {
    style: { position: "relative", width: layout.canvasW, height: layout.emoBarH }
  },
    layout.emoBars.map(function(ebar, ebi) {
      var active = emoKeys.filter(function(ek) { return enabledEmos && enabledEmos.has(ek); });
      var totalW = active.length * barW + (active.length - 1) * 1;
      var startX = ebar.x - totalW / 2;
      return React.createElement("div", { key: ebi },
        active.map(function(ek, eki) {
          var eH = ((ebar[ek] || 0) / maxEmo) * barH;
          return React.createElement("div", {
            key: ek,
            style: {
              position: "absolute",
              left: startX + eki * (barW + 1),
              bottom: 2, width: barW, height: eH,
              background: EC[ek], opacity: 0.7, borderRadius: 1
            }
          });
        })
      );
    })
  );
}

// ════════════════════════════════════════════
// FibrasDocStack
// ════════════════════════════════════════════
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

  var _segTip = useState(null);
  var segTooltip = _segTip[0], setSegTooltip = _segTip[1];
  var _segPin = useState(null);
  var segPinned = _segPin[0], setSegPinned = _segPin[1];

  // Clamp winStart when segment count changes
  useEffect(function() {
    if (!fibras) return;
    var maxStart = Math.max(0, fibras.numSegs - winSize);
    if (winStart > maxStart) setWinStart(maxStart);
  }, [fibras ? fibras.numSegs : 0]);

  var layout = useMemo(function() {
    if (!fibras) return null;
    return buildWindowedLayout(
      fibras, winStart, winSize, seeds, sortMode, colorMode,
      canvasW, canvasH, commMap, engProp
    );
  }, [fibras, winStart, winSize, seeds, sortMode, colorMode, canvasW, canvasH, commMap, engProp]);

  if (!fibras) return null;

  var chartAreaW = canvasW - (layout ? layout.padLeft : 80) - 20;

  var segLabels = layout ? layout.columns.map(function(col) {
    return { segIdx: col.segIdx, x: col.x, label: col.label };
  }) : [];
  var activeTip = segPinned || segTooltip;

  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", gap: T.gap4, position: "relative" }
  },
    props.docLabel && React.createElement("div", {
      style: { fontSize: T.fs10, color: T.textMid, fontFamily: T.fontMono }
    }, props.docLabel),

    // Minimap (extended)
    React.createElement("div", {
      style: { marginLeft: (layout ? layout.padLeft : 80) - 66, marginRight: -14 }
    },
      React.createElement(FibrasMinimap, {
        numSegs: fibras.numSegs,
        winStart: winStart, winSize: winSize,
        setWinStart: setWinStart,
        chartWidth: chartAreaW + 66 + 14,
        segPolarity: layout ? layout.segPolarity : [],
        segArousal: layout ? layout.segArousal : []
      })
    ),

    // Emotion bars
    layout && React.createElement(FibrasEmoBars, {
      layout: layout, enabledEmos: enabledEmos
    }),

    // Segment labels (only source)
    segLabels.length > 0 && React.createElement("div", {
      style: { position: "relative", height: 14, width: canvasW, marginBottom: 2 }
    },
      segLabels.map(function(sl, sli) {
        var txt = sl.label ? "S" + (sl.segIdx + 1) : String(sl.segIdx + 1);
        return React.createElement("span", {
          key: sli,
          onMouseEnter: function() { if (sl.label && !segPinned) setSegTooltip(sl); },
          onMouseLeave: function() { if (!segPinned) setSegTooltip(null); },
          onClick: function() {
            if (!sl.label) return;
            if (segPinned && segPinned.segIdx === sl.segIdx) setSegPinned(null);
            else setSegPinned(sl);
          },
          style: {
            position: "absolute", left: sl.x, top: 0,
            transform: "translateX(-50%)",
            fontSize: 9, fontFamily: T.fontMono,
            color: sl.label ? T.textMid : T.textDim,
            cursor: sl.label ? "pointer" : "default"
          }
        }, txt);
      }),
      activeTip && React.createElement("div", {
        style: {
          position: "absolute",
          left: Math.min(activeTip.x, canvasW - 220),
          top: 18, maxWidth: 200,
          padding: T.pad8,
          background: T.bg + "ee",
          border: "1px solid " + (segPinned ? T.accent : T.borderLight),
          borderRadius: T.radius4,
          fontFamily: T.fontMono, fontSize: T.fs10,
          color: T.text, zIndex: 50,
          lineHeight: 1.5, backdropFilter: "blur(2px)",
          wordWrap: "break-word"
        }
      },
        React.createElement("div", { style: { color: T.accent, marginBottom: 2, fontSize: 9 } },
          "S" + (activeTip.segIdx + 1)
        ),
        activeTip.label
      )
    ),

    // P5 Chart
    React.createElement(FibrasChart, {
      layout: layout, seeds: seeds,
      hoveredWord: hoveredWord, setHoveredWord: setHoveredWord,
      lockedWords: lockedWords, toggleLocked: toggleLocked,
      enabledEmos: enabledEmos
    })
  );
}

// ════════════════════════════════════════════
// FibrasMultiDoc
// ════════════════════════════════════════════
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

  function docById(id) {
    for (var i = 0; i < docs.length; i++) { if (docs[i].id === id) return docs[i]; }
    return null;
  }

  if (selectedArr.length === 1 || compareMode !== "stack") {
    var id = selectedArr[0];
    var doc = docById(id);
    return React.createElement(FibrasDocStack, {
      fibras: fibrasDataMap[id], seeds: seeds, enabledEmos: enabledEmos,
      docLabel: doc ? doc.label : "", sortMode: sortMode, colorMode: colorMode,
      lockedWords: lockedWords, toggleLocked: toggleLocked,
      commMap: commMapByDoc[id], canvasW: canvasW, canvasH: canvasH, eng: engProp
    });
  }

  var stackH = Math.max(300, Math.floor(canvasH / selectedArr.length));
  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", gap: T.gap12 }
  },
    selectedArr.map(function(did) {
      var doc = docById(did);
      return React.createElement(FibrasDocStack, {
        key: did, fibras: fibrasDataMap[did], seeds: seeds, enabledEmos: enabledEmos,
        docLabel: doc ? doc.label : "", sortMode: sortMode, colorMode: colorMode,
        lockedWords: lockedWords, toggleLocked: toggleLocked,
        commMap: commMapByDoc[did], canvasW: canvasW, canvasH: stackH, eng: engProp
      });
    })
  );
}
