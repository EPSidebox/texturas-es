// ─────────────────────────────────────────────
// fibras-render.js — Texturas (ES) v2.0
// P5 canvas rendering for Fibras visualization
// Canonical Sankey transparency, HSL color model
// Reads: T, EC, CC from config.js
// Reads: buildWindowedLayout from fibras-data.js
// Reads: React hook aliases from config.js
// Exports: FibrasChart, FibrasMinimap, FibrasEmoBars,
//          FibrasDocStack, FibrasMultiDoc
// ─────────────────────────────────────────────

// ── Spanish emotion labels ──
var _EMO_ES = { joy: "Felicidad", fear: "Miedo", sadness: "Tristeza", anger: "Ira" };

// ── Provenance labels ──
var _PROV_LABELS = {
  directo:   "Aparece directamente",
  vectorial: "Activado por similitud vectorial",
  semantico: "Activado por red sem\u00E1ntica"
};

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

function _lerpHsl(hsl1, hsl2, t) {
  var h1 = hsl1[0], h2 = hsl2[0];
  var dh = h2 - h1;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  var h = h1 + dh * t;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return [h, hsl1[1] + (hsl2[1] - hsl1[1]) * t, hsl1[2] + (hsl2[2] - hsl1[2]) * t];
}

var _polPositive = _hexToRgb(T.positive);
var _polNegative = _hexToRgb(T.negative);
var _polNeutral  = _hexToRgb(T.neutral);

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

// ── Ribbon drawing ──
function _drawRibbon(p, sT, sB, sR, tT, tB, tL, getColor, steps) {
  var baseCp = (tL - sR) / 3;
  var cpT = baseCp + Math.abs(tT - sT) * 0.4;
  var cpB = baseCp + Math.abs(tB - sB) * 0.4;

  p.noStroke();
  for (var si = 0; si < steps; si++) {
    var t0 = si / steps, t1 = (si + 1) / steps, tMid = (t0 + t1) / 2;

    var x0  = p.bezierPoint(sR, sR + cpT, tL - cpT, tL, t0);
    var x1  = p.bezierPoint(sR, sR + cpT, tL - cpT, tL, t1);
    var x0b = p.bezierPoint(sR, sR + cpB, tL - cpB, tL, t0);
    var x1b = p.bezierPoint(sR, sR + cpB, tL - cpB, tL, t1);

    var y0t = p.bezierPoint(sT, sT, tT, tT, t0);
    var y1t = p.bezierPoint(sT, sT, tT, tT, t1);
    var y0b = p.bezierPoint(sB, sB, tB, tB, t0);
    var y1b = p.bezierPoint(sB, sB, tB, tB, t1);

    var lo0 = Math.min(y0t, y0b), hi0 = Math.max(y0t, y0b);
    var lo1 = Math.min(y1t, y1b), hi1 = Math.max(y1t, y1b);

    p.fill(getColor(tMid));
    p.beginShape();
    p.vertex(x0,  lo0);
    p.vertex(x1,  lo1);
    p.vertex(x1b, hi1);
    p.vertex(x0b, hi0);
    p.endShape(p.CLOSE);
  }
}

// ════════════════════════════════════════════
// FibrasChart — P5 canvas
// ════════════════════════════════════════════
function FibrasChart(props) {
  var containerRef = useRef(null);
  var p5Ref = useRef(null);
  var propsRef = useRef(props);
  propsRef.current = props;

  // Tooltip state — transient only, no pinning
  var _tt = useState(null);
  var tooltipData = _tt[0], setTooltipData = _tt[1];

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
        p.colorMode(p.RGB, 255, 255, 255, 1);
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
        p.stroke(255, 255, 255, 0.20);
        p.strokeWeight(1);
        for (var gi = 0; gi < lay.columns.length; gi++) {
          p.line(lay.columns[gi].x, 0, lay.columns[gi].x, lay.canvasH);
        }
        p.noStroke();

        // ── Streams: back-to-front ──
        for (var wi = lay.wordSlots.length - 1; wi >= 0; wi--) {
          var slot = lay.wordSlots[wi];
          var rgb = _hexToRgb(slot.color);
          var active = isWordActive(slot.word);

          // ── Ribbon links ──
          for (var ci = 0; ci < lay.numCols - 1; ci++) {
            var src = slot.nodes[ci];
            var tgt = slot.nodes[ci + 1];

            // Fade out: src real, tgt ghost
            if (src.isReal && !tgt.isReal) {
              var isCrossSrc = false;
              for (var xci = 0; xci < lay.crossLinks.length; xci++) {
                if (lay.crossLinks[xci].srcSlotIdx === wi && lay.crossLinks[xci].srcCol === ci) {
                  isCrossSrc = true; break;
                }
              }
              if (!isCrossSrc) {
                var ghostX  = tgt.x;
                var ghostCy = tgt.y + (slot.slotH / 2);
                var ghostH  = Math.max(2, src.h * 0.3);
                var ghostT  = ghostCy - ghostH / 2;
                var ghostB  = ghostCy + ghostH / 2;
                var srcOp   = active ? src.opacity : 0.06;
                (function(src, ghostT, ghostB, ghostX, rgb, srcOp) {
                  _drawRibbon(p,
                    src.y, src.y + src.h, src.x + src.w,
                    ghostT, ghostB, ghostX,
                    function(t) { return p.color(rgb[0], rgb[1], rgb[2], srcOp * (1 - t)); },
                    16
                  );
                })(src, ghostT, ghostB, ghostX, rgb, srcOp);
              }
              continue;
            }

            // Fade in: src ghost, tgt real
            if (!src.isReal && tgt.isReal) {
              var isCrossTgt = false;
              for (var xcj = 0; xcj < lay.crossLinks.length; xcj++) {
                if (lay.crossLinks[xcj].tgtSlotIdx === wi && lay.crossLinks[xcj].tgtCol === ci + 1) {
                  isCrossTgt = true; break;
                }
              }
              if (!isCrossTgt) {
                var ghostX2  = src.x + src.w;
                var ghostCy2 = src.y + (slot.slotH / 2);
                var ghostH2  = Math.max(2, tgt.h * 0.3);
                var ghostT2  = ghostCy2 - ghostH2 / 2;
                var ghostB2  = ghostCy2 + ghostH2 / 2;
                var tgtOp    = active ? tgt.opacity : 0.06;
                (function(tgt, ghostT2, ghostB2, ghostX2, rgb, tgtOp) {
                  _drawRibbon(p,
                    ghostT2, ghostB2, ghostX2,
                    tgt.y, tgt.y + tgt.h, tgt.x,
                    function(t) { return p.color(rgb[0], rgb[1], rgb[2], tgtOp * t); },
                    16
                  );
                })(tgt, ghostT2, ghostB2, ghostX2, rgb, tgtOp);
              }
              continue;
            }

            if (!src.isReal || !tgt.isReal) continue;
            (function(src, tgt, rgb, active) {
              var srcOp = active ? src.opacity : 0.06;
              var tgtOp = active ? tgt.opacity : 0.06;
              _drawRibbon(p,
                src.y, src.y + src.h, src.x + src.w,
                tgt.y, tgt.y + tgt.h, tgt.x,
                function(t) { return p.color(rgb[0], rgb[1], rgb[2], srcOp + (tgtOp - srcOp) * t); },
                16
              );
            })(src, tgt, rgb, active);
          }

          // ── Nodes ──
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var nd = slot.nodes[ni];
            if (!nd.isReal) continue;
            var ndOp = active ? nd.opacity : 0.06;
            p.fill(p.color(rgb[0], rgb[1], rgb[2], ndOp));
            p.noStroke();
            p.rect(nd.x, nd.y, nd.w, nd.h);
          }

          // ── Labels ──
          if (active || !hasHL) {
            p.textSize(9);
            p.textAlign(p.RIGHT, p.CENTER);
            p.fill(p.color(180, 180, 180, active ? 0.85 : 0.15));
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
            var cSrcOp = clActive ? cs.opacity : 0.06;
            var cTgtOp = clActive ? ct.opacity : 0.06;
            (function(cs, ct, srcHsl, tgtHsl, cSrcOp, cTgtOp) {
              _drawRibbon(p,
                cs.y, cs.y + cs.h, cs.x + cs.w,
                ct.y, ct.y + ct.h, ct.x,
                function(t) {
                  var midHsl = _lerpHsl(srcHsl, tgtHsl, t);
                  var midRgb = _hslToRgb(midHsl[0], midHsl[1], midHsl[2]);
                  var op = cSrcOp + (cTgtOp - cSrcOp) * t;
                  return p.color(midRgb[0], midRgb[1], midRgb[2], op);
                },
                16
              );
            })(cs, ct, srcHsl, tgtHsl, cSrcOp, cTgtOp);
          }
        }

        // ── Node circles (topmost layer) ──
        var accentRgb = _hexToRgb(T.accent);
        for (var wi2 = 0; wi2 < lay.wordSlots.length; wi2++) {
          var slot2 = lay.wordSlots[wi2];
          for (var ni2 = 0; ni2 < slot2.nodes.length; ni2++) {
            var nd2 = slot2.nodes[ni2];
            if (!nd2.isReal) continue;
            var isHov = propsRef.current.hoveredWord === slot2.word;
            var isLocked = propsRef.current.lockedWords && propsRef.current.lockedWords.has(slot2.word);
            p.noStroke();
            p.fill(p.color(255, 255, 255, isHov || isLocked ? 1.0 : 0.5));
            p.ellipse(nd2.x + nd2.w / 2, nd2.y + nd2.h / 2, isHov || isLocked ? 10 : 5, isHov || isLocked ? 10 : 5);
            if (isLocked) {
              p.noFill();
              p.stroke(p.color(accentRgb[0], accentRgb[1], accentRgb[2], 1.0));
              p.strokeWeight(1);
              p.ellipse(nd2.x + nd2.w / 2, nd2.y + nd2.h / 2, 16, 16);
              p.noStroke();
            }
          }
        }
      };

      // ── Mouse: hover — show transient tooltip ──
      p.mouseMoved = function() {
        var lay = propsRef.current.layout;
        if (!lay) return;
        var mx = p.mouseX, my = p.mouseY;
        if (mx < 0 || mx > lay.canvasW || my < 0 || my > lay.canvasH) {
          if (propsRef.current.hoveredWord) propsRef.current.setHoveredWord(null);
          if (propsRef.current.setTooltipData) propsRef.current.setTooltipData(null);
          return;
        }
        var HIT = 7;
        var found = null, foundData = null;
        outer: for (var wi = 0; wi < lay.wordSlots.length; wi++) {
          var slot = lay.wordSlots[wi];
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var nd = slot.nodes[ni];
            if (!nd.isReal) continue;
            var cx = nd.x + nd.w / 2, cy = nd.y + nd.h / 2;
            var dx = mx - cx, dy = my - cy;
            if (dx * dx + dy * dy < HIT * HIT) {
              found = slot.word;
              var rect = containerRef.current.getBoundingClientRect();
              foundData = { word: slot.word, nd: nd, mx: p.mouseX + rect.left, my: p.mouseY + rect.top };
              break outer;
            }
          }
        }
        if (found !== propsRef.current.hoveredWord) propsRef.current.setHoveredWord(found);
        if (propsRef.current.setTooltipData) propsRef.current.setTooltipData(foundData);
      };

      // ── Mouse: click ──
      // Node circle → pin/unpin tooltip
      // Ribbon edge → lock/unlock stream
      // Elsewhere → clear all
      p.mousePressed = function() {
        var lay = propsRef.current.layout;
        if (!lay) return;
        var mx = p.mouseX, my = p.mouseY;
        if (mx < 0 || mx > lay.canvasW || my < 0 || my > lay.canvasH) return;
        var HIT = 7;

        // Check node circles first
        outer: for (var wi = 0; wi < lay.wordSlots.length; wi++) {
          var slot = lay.wordSlots[wi];
          for (var ni = 0; ni < slot.nodes.length; ni++) {
            var nd = slot.nodes[ni];
            if (!nd.isReal) continue;
            var cx = nd.x + nd.w / 2, cy = nd.y + nd.h / 2;
            var dx = mx - cx, dy = my - cy;
            if (dx * dx + dy * dy < HIT * HIT) {
              // Toggle pinned tooltip for this node
              var cur = propsRef.current.pinnedTooltip;
              if (cur && cur.word === slot.word && cur.nd === nd) {
                if (propsRef.current.setPinnedTooltip) propsRef.current.setPinnedTooltip(null);
              } else {
                var rect = containerRef.current.getBoundingClientRect();
                var pinData = { word: slot.word, nd: nd, mx: p.mouseX + rect.left, my: p.mouseY + rect.top };
                if (propsRef.current.setPinnedTooltip) propsRef.current.setPinnedTooltip(pinData);
              }
              return;
            }
          }
        }

        // Check ribbon edges
        outer2: for (var wi2 = 0; wi2 < lay.wordSlots.length; wi2++) {
          var slot2 = lay.wordSlots[wi2];
          for (var li = 0; li < slot2.links.length; li++) {
            var lk = slot2.links[li];
            var lxMin = lk.srcNode.x + lk.srcNode.w;
            var lxMax = lk.tgtNode.x;
            var lyMin = Math.min(lk.srcNode.y, lk.tgtNode.y);
            var lyMax = Math.max(lk.srcNode.y + lk.srcNode.h, lk.tgtNode.y + lk.tgtNode.h);
            if (mx >= lxMin && mx <= lxMax && my >= lyMin && my <= lyMax) {
              if (propsRef.current.toggleLocked) propsRef.current.toggleLocked(slot2.word);
              break outer2;
            }
          }
        }

        // Click elsewhere — clear all
        if (propsRef.current.clearLocked) propsRef.current.clearLocked();
        if (propsRef.current.setPinnedTooltip) propsRef.current.setPinnedTooltip(null);
      };
    };

    p5Ref.current = new p5(sketch, containerRef.current);
    return function() {
      if (p5Ref.current) { p5Ref.current.remove(); p5Ref.current = null; }
    };
  }, [props.layout]);

  useEffect(function() {
    if (p5Ref.current) p5Ref.current.redraw();
  }, [props.hoveredWord, props.lockedWords, props.seeds, props.enabledEmos, props.pinnedTooltip]);

  function buildTipEl(data, pinned) {
    if (!data) return null;
    var nd = data.nd;
    var prov = nd.provenance || "directo";
    var provColor = prov === "directo" ? T.positive : prov === "vectorial" ? T.arousal : T.flow;
    var srcLine = null;
    if (nd.provenanceSource) {
      if (prov === "vectorial") {
        srcLine = React.createElement("div", { style: { fontSize: 9, color: T.textMid, marginTop: 2 } },
          "desde ",
          React.createElement("span", { style: { color: T.arousal } }, nd.provenanceSource),
          " \u00B7 sim: " + nd.provenanceSim.toFixed(2)
        );
      } else if (prov === "semantico") {
        srcLine = React.createElement("div", { style: { fontSize: 9, color: T.textMid, marginTop: 2 } },
          "desde ",
          React.createElement("span", { style: { color: T.flow } }, nd.provenanceSource)
        );
      }
    }
    return React.createElement("div", {
      style: {
        position: "fixed", pointerEvents: "none", zIndex: 100,
        left: data.mx + 14, top: data.my - 10,
        background: T.bgCard,
        border: "1px solid " + (pinned ? T.accent : T.borderLight),
        borderRadius: T.radius4, padding: T.pad8,
        fontFamily: T.fontMono, fontSize: T.fs10, color: T.text,
        lineHeight: 1.7, backdropFilter: "blur(2px)", whiteSpace: "nowrap"
      }
    },
      React.createElement("div", { style: { color: T.accent, fontSize: 9, marginBottom: 2 } },
        data.word + " \u00B7 S" + (nd.segIdx + 1)
      ),
      React.createElement("div", { style: { color: T.textMid } },
        "Frecuencia ", React.createElement("span", { style: { color: T.text } }, nd.primary !== undefined ? String(Math.round(nd.primary)) : "\u2014")
      ),
      React.createElement("div", { style: { color: T.textMid } },
        "Relevancia ", React.createElement("span", { style: { color: T.text } }, nd.secondary !== undefined ? nd.secondary.toFixed(3) : "\u2014")
      ),
      React.createElement("div", { style: { color: provColor, fontSize: 9, marginTop: 3 } },
        "\u2B21 " + (_PROV_LABELS[prov] || prov)
      ),
      srcLine
    );
  }

  return React.createElement("div", { style: { position: "relative" } },
    React.createElement("div", {
      ref: containerRef,
      style: { background: T.bg, borderRadius: T.radius6, border: "1px solid " + T.border, overflow: "hidden" }
    }),
    buildTipEl(tooltipData, false),
    buildTipEl(props.pinnedTooltip, true)
  );
}

// ════════════════════════════════════════════
// FibrasMinimap
// ════════════════════════════════════════════
function FibrasMinimap(props) {
  var numSegs     = props.numSegs;
  var winStart    = props.winStart;
  var winSize     = props.winSize;
  var setWinStart = props.setWinStart;
  var chartWidth  = props.chartWidth || 700;
  var segPolarity = props.segPolarity || [];
  var segArousal  = props.segArousal  || [];

  var _tt = useState(null); var tipData = _tt[0], setTipData = _tt[1];
  var _tp = useState(null); var pinnedSeg = _tp[0], setPinnedSeg = _tp[1];

  var maxStart = Math.max(0, numSegs - winSize);
  var showNav  = numSegs > winSize;
  var barH     = 28;
  var segW     = chartWidth / numSegs;
  var midY     = barH / 2;

  var maxArousal = 0;
  for (var ai = 0; ai < segArousal.length; ai++) {
    if (Math.abs(segArousal[ai]) > maxArousal) maxArousal = Math.abs(segArousal[ai]);
  }
  if (maxArousal === 0) maxArousal = 1;

  var navW = (winSize / numSegs) * chartWidth;
  var navX = (winStart / numSegs) * chartWidth;

  function handleMouseMove(ev) {
    if (pinnedSeg !== null) return;
    var rect = ev.currentTarget.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    var seg = Math.floor((x / chartWidth) * numSegs);
    if (seg >= 0 && seg < numSegs) setTipData({ seg: seg, x: ev.clientX, y: ev.clientY });
  }

  function handleMouseLeave() {
    if (pinnedSeg === null) setTipData(null);
  }

  function handleClick(ev) {
    var rect = ev.currentTarget.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    var seg = Math.floor((x / chartWidth) * numSegs);
    if (pinnedSeg === seg) { setPinnedSeg(null); setTipData(null); }
    else { setPinnedSeg(seg); setTipData({ seg: seg, x: ev.clientX, y: ev.clientY }); }
    var ns = Math.max(0, Math.min(seg - Math.floor(winSize / 2), maxStart));
    setWinStart(ns);
  }

  var arousalDashes = segArousal.map(function(val, i) {
    var norm = val / maxArousal;
    var y = midY - norm * (midY - 3);
    return { x1: i * segW + 2, x2: (i + 1) * segW - 2, y: y };
  });

  var tipEl = null;
  if (tipData && tipData.seg >= 0 && tipData.seg < numSegs) {
    var pol = segPolarity[tipData.seg] || 0;
    var aro = segArousal[tipData.seg]  || 0;
    var polColor = pol > 0.05 ? T.positive : pol < -0.05 ? T.negative : T.neutral;
    tipEl = React.createElement("div", {
      style: {
        position: "fixed", pointerEvents: "none", zIndex: 100,
        left: tipData.x + 14, top: tipData.y - 10,
        background: T.bgCard,
        border: "1px solid " + (pinnedSeg !== null ? T.accent : T.borderLight),
        borderRadius: T.radius4, padding: T.pad8,
        fontFamily: T.fontMono, fontSize: T.fs10, color: T.text,
        lineHeight: 1.7, backdropFilter: "blur(2px)", whiteSpace: "nowrap"
      }
    },
      React.createElement("div", { style: { color: T.accent, fontSize: 9, marginBottom: 2 } }, "Segmento " + (tipData.seg + 1)),
      React.createElement("div", { style: { color: T.textMid } },
        "Polaridad ", React.createElement("span", { style: { color: polColor } }, (pol > 0 ? "+" : "") + pol.toFixed(3))
      ),
      React.createElement("div", { style: { color: T.textMid } },
        "Activaci\u00F3n ", React.createElement("span", { style: { color: T.arousal } }, (aro > 0 ? "+" : "") + aro.toFixed(3))
      )
    );
  }

  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: T.gap6 } },
    React.createElement("button", {
      onClick: function() { if (showNav) setWinStart(Math.max(0, winStart - 1)); },
      disabled: !showNav || winStart <= 0,
      style: {
        background: "transparent", border: "1px solid " + (showNav ? T.borderLight : "transparent"),
        color: !showNav || winStart <= 0 ? T.textFaint : T.textMid,
        borderRadius: T.radius3, padding: "2px 6px", fontSize: T.fs12, fontFamily: T.fontMono,
        cursor: !showNav || winStart <= 0 ? "default" : "pointer",
        flexShrink: 0, visibility: showNav ? "visible" : "hidden"
      }
    }, "\u25C0"),

    React.createElement("div", {
      onClick: handleClick,
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave,
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
            background: "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")", opacity: 0.35
          }
        });
      }),
      React.createElement("svg", {
        style: { position: "absolute", top: 0, left: 0, width: chartWidth, height: barH, pointerEvents: "none" }
      },
        React.createElement("line", {
          x1: 0, x2: chartWidth, y1: midY, y2: midY,
          stroke: "rgba(255,255,255,0.25)", strokeWidth: 1, strokeDasharray: "3,3"
        }),
        arousalDashes.map(function(d, i) {
          return React.createElement("line", {
            key: i, x1: d.x1, x2: d.x2, y1: d.y, y2: d.y,
            stroke: "white", strokeWidth: 1.5, opacity: 0.8
          });
        }),
        segW > 14 && segArousal.map(function(val, i) {
          return React.createElement("text", {
            key: "l" + i,
            x: i * segW + segW / 2, y: barH - 3,
            textAnchor: "middle",
            fontSize: Math.min(9, segW * 0.5),
            fontFamily: T.fontMono,
            fill: "rgba(255,255,255,0.35)"
          }, String(i + 1));
        })
      ),
      showNav && React.createElement("div", {
        style: {
          position: "absolute", left: navX, top: 0,
          width: navW, height: barH - 2,
          border: "2px solid " + T.accent, borderRadius: T.radius3,
          background: T.accent + "15", pointerEvents: "none", boxSizing: "border-box"
        }
      })
    ),

    React.createElement("button", {
      onClick: function() { if (showNav) setWinStart(Math.min(maxStart, winStart + 1)); },
      disabled: !showNav || winStart >= maxStart,
      style: {
        background: "transparent", border: "1px solid " + (showNav ? T.borderLight : "transparent"),
        color: !showNav || winStart >= maxStart ? T.textFaint : T.textMid,
        borderRadius: T.radius3, padding: "2px 6px", fontSize: T.fs12, fontFamily: T.fontMono,
        cursor: !showNav || winStart >= maxStart ? "default" : "pointer",
        flexShrink: 0, visibility: showNav ? "visible" : "hidden"
      }
    }, "\u25B6"),

    tipEl
  );
}

// ════════════════════════════════════════════
// FibrasEmoBars
// ════════════════════════════════════════════
function FibrasEmoBars(props) {
  var layout      = props.layout;
  var enabledEmos = props.enabledEmos;
  if (!layout || !layout.emoBars || layout.emoBars.length === 0) return null;

  var _tt = useState(null); var tipData = _tt[0], setTipData = _tt[1];
  var _tp = useState(null); var pinnedSeg = _tp[0], setPinnedSeg = _tp[1];

  var emoKeys = ["joy", "fear", "sadness", "anger"];
  var barH    = layout.emoBarH - 8;
  var barW    = Math.max(2, layout.nodeW * 0.3);

  var maxEmo = 0;
  for (var i = 0; i < layout.emoBars.length; i++) {
    for (var k = 0; k < emoKeys.length; k++) {
      var v = layout.emoBars[i][emoKeys[k]];
      if (v > maxEmo) maxEmo = v;
    }
  }
  if (maxEmo === 0) maxEmo = 1;

  var tipEl = null;
  if (tipData) {
    var ebar = layout.emoBars[tipData.seg];
    if (ebar) {
      tipEl = React.createElement("div", {
        style: {
          position: "fixed", pointerEvents: "none", zIndex: 100,
          left: tipData.x + 14, top: tipData.y - 10,
          background: T.bgCard,
          border: "1px solid " + (pinnedSeg !== null ? T.accent : T.borderLight),
          borderRadius: T.radius4, padding: T.pad8,
          fontFamily: T.fontMono, fontSize: T.fs10, color: T.text,
          lineHeight: 1.7, backdropFilter: "blur(2px)", whiteSpace: "nowrap"
        }
      },
        React.createElement("div", { style: { color: T.accent, fontSize: 9, marginBottom: 2 } }, "Segmento " + (tipData.seg + 1)),
        emoKeys.map(function(ek) {
          return React.createElement("div", { key: ek, style: { color: T.textMid } },
            React.createElement("span", { style: { color: EC[ek] } }, _EMO_ES[ek] || ek),
            " ",
            React.createElement("span", { style: { color: T.text } }, ((ebar[ek] || 0) * 100).toFixed(1) + "%")
          );
        })
      );
    }
  }

  return React.createElement("div", { style: { position: "relative", width: layout.canvasW, height: layout.emoBarH } },
    layout.emoBars.map(function(ebar, ebi) {
      var active = emoKeys.filter(function(ek) { return enabledEmos && enabledEmos.has(ek); });
      var totalW = active.length * barW + (active.length - 1) * 1;
      var startX = ebar.x - totalW / 2;
      return React.createElement("div", {
        key: ebi,
        style: { position: "absolute", left: startX - 4, top: 0, width: totalW + 8, height: layout.emoBarH, cursor: "pointer" },
        onMouseMove: function(ev) {
          if (pinnedSeg !== null) return;
          setTipData({ seg: ebi, x: ev.clientX, y: ev.clientY });
        },
        onMouseLeave: function() { if (pinnedSeg === null) setTipData(null); },
        onClick: function(ev) {
          if (pinnedSeg === ebi) { setPinnedSeg(null); setTipData(null); }
          else { setPinnedSeg(ebi); setTipData({ seg: ebi, x: ev.clientX, y: ev.clientY }); }
        }
      },
        active.map(function(ek, eki) {
          var eH = ((ebar[ek] || 0) / maxEmo) * barH;
          return React.createElement("div", {
            key: ek,
            style: {
              position: "absolute", left: 4 + eki * (barW + 1), bottom: 2,
              width: barW, height: eH, background: EC[ek], opacity: 0.7, borderRadius: 1,
              pointerEvents: "none"
            }
          });
        })
      );
    }),
    tipEl
  );
}

// ════════════════════════════════════════════
// FibrasDocStack
// ════════════════════════════════════════════
function FibrasDocStack(props) {
  var fibras       = props.fibras;
  var seeds        = props.seeds;
  var enabledEmos  = props.enabledEmos;
  var sortMode     = props.sortMode;
  var colorMode    = props.colorMode;
  var lockedWords  = props.lockedWords;
  var toggleLocked = props.toggleLocked;
  var clearLocked  = props.clearLocked;
  var commMap      = props.commMap;
  var canvasW      = props.canvasW || 800;
  var canvasH      = props.canvasH || 500;
  var engProp      = props.eng;
  var winSize      = 10;

  var _ws = useState(0); var winStart = _ws[0], setWinStart = _ws[1];
  var _hw = useState(null); var hoveredWord = _hw[0], setHoveredWord = _hw[1];
  var _td = useState(null); var tooltipData = _td[0], setTooltipData = _td[1];
  var _pt = useState(null); var pinnedTooltip = _pt[0], setPinnedTooltip = _pt[1];
  var _segTip = useState(null); var segTooltip = _segTip[0], setSegTooltip = _segTip[1];
  var _segPin = useState(null); var segPinned = _segPin[0], setSegPinned = _segPin[1];

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

    React.createElement("div", {
      style: { marginLeft: (layout ? layout.padLeft : 80) - 66, marginRight: -14 }
    },
      React.createElement(FibrasMinimap, {
        numSegs: fibras.numSegs, winStart: winStart, winSize: winSize,
        setWinStart: setWinStart, chartWidth: chartAreaW + 66 + 14,
        segPolarity: layout ? layout.segPolarity : [],
        segArousal:  layout ? layout.segArousal  : []
      })
    ),

    layout && React.createElement(FibrasEmoBars, { layout: layout, enabledEmos: enabledEmos }),

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
            position: "absolute", left: sl.x, top: 0, transform: "translateX(-50%)",
            fontSize: 9, fontFamily: T.fontMono,
            color: "#ffffff", fontWeight: "bold",
            cursor: sl.label ? "pointer" : "default"
          }
        }, txt);
      }),
      activeTip && React.createElement("div", {
        style: {
          position: "absolute", left: Math.min(activeTip.x, canvasW - 220), top: 18,
          maxWidth: 200, padding: T.pad8,
          background: T.bg + "ee", border: "1px solid " + (segPinned ? T.accent : T.borderLight),
          borderRadius: T.radius4, fontFamily: T.fontMono, fontSize: T.fs10,
          color: T.text, zIndex: 50, lineHeight: 1.5,
          backdropFilter: "blur(2px)", wordWrap: "break-word"
        }
      },
        React.createElement("div", { style: { color: T.accent, marginBottom: 2, fontSize: 9 } }, "S" + (activeTip.segIdx + 1)),
        activeTip.label
      )
    ),

    React.createElement(FibrasChart, {
      layout: layout, seeds: seeds,
      hoveredWord: hoveredWord, setHoveredWord: setHoveredWord,
      lockedWords: lockedWords, toggleLocked: toggleLocked,
      clearLocked: clearLocked,
      enabledEmos: enabledEmos,
      tooltipData: tooltipData, setTooltipData: setTooltipData,
      pinnedTooltip: pinnedTooltip, setPinnedTooltip: setPinnedTooltip
    })
  );
}

// ════════════════════════════════════════════
// FibrasMultiDoc
// ════════════════════════════════════════════
function FibrasMultiDoc(props) {
  var selectedArr   = props.selectedArr  || [];
  var fibrasDataMap = props.fibrasDataMap || {};
  var seeds         = props.seedArr;
  var enabledEmos   = props.enabledEmos;
  var docs          = props.docs || [];
  var compareMode   = props.compareMode;
  var sortMode      = props.sortMode;
  var colorMode     = props.colorMode;
  var lockedWords   = props.lockedWords;
  var toggleLocked  = props.toggleLocked;
  var clearLocked   = props.clearLocked;
  var commMapByDoc  = props.commMapByDoc || {};
  var canvasW       = props.canvasW || 800;
  var canvasH       = props.canvasH || 500;
  var engProp       = props.eng;

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
      lockedWords: lockedWords, toggleLocked: toggleLocked, clearLocked: clearLocked,
      commMap: commMapByDoc[id], canvasW: canvasW, canvasH: canvasH, eng: engProp
    });
  }

  var stackH = Math.max(300, Math.floor(canvasH / selectedArr.length));
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: T.gap12 } },
    selectedArr.map(function(did) {
      var doc = docById(did);
      return React.createElement(FibrasDocStack, {
        key: did, fibras: fibrasDataMap[did], seeds: seeds, enabledEmos: enabledEmos,
        docLabel: doc ? doc.label : "", sortMode: sortMode, colorMode: colorMode,
        lockedWords: lockedWords, toggleLocked: toggleLocked, clearLocked: clearLocked,
        commMap: commMapByDoc[did], canvasW: canvasW, canvasH: stackH, eng: engProp
      });
    })
  );
}
