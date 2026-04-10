// ─────────────────────────────────────────────
// fibras-render.js — Texturas (ES) v2.0
// Ridgeline visualization for Fibras
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
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var mx = Math.max(r,g,b), mn = Math.min(r,g,b);
  var hh = 0, s = 0, l = (mx+mn)/2;
  if (mx !== mn) {
    var d = mx-mn;
    s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
    if (mx === r) hh = ((g-b)/d+(g<b?6:0))/6;
    else if (mx === g) hh = ((b-r)/d+2)/6;
    else hh = ((r-g)/d+4)/6;
  }
  return [hh*360, s*100, l*100];
}

function _hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var hue2rgb = function(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p+(q-p)*6*t;
      if (t < 1/2) return q;
      if (t < 2/3) return p+(q-p)*(2/3-t)*6;
      return p;
    };
    var q = l < 0.5 ? l*(1+s) : l+s-l*s;
    var p = 2*l-q;
    r = hue2rgb(p,q,h+1/3);
    g = hue2rgb(p,q,h);
    b = hue2rgb(p,q,h-1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

function _hexToHsl(hex) {
  var rgb = _hexToRgb(hex);
  return _rgbToHsl(rgb[0], rgb[1], rgb[2]);
}

function _lerpHsl(hsl1, hsl2, t) {
  var h1 = hsl1[0], h2 = hsl2[0];
  var dh = h2-h1;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  var h = h1+dh*t;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return [h, hsl1[1]+(hsl2[1]-hsl1[1])*t, hsl1[2]+(hsl2[2]-hsl1[2])*t];
}

function _lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0]+(c2[0]-c1[0])*t),
    Math.round(c1[1]+(c2[1]-c1[1])*t),
    Math.round(c1[2]+(c2[2]-c1[2])*t)
  ];
}

var _polPositive = _hexToRgb(T.positive);
var _polNegative = _hexToRgb(T.negative);
var _polNeutral  = _hexToRgb(T.neutral);

function _polarityToRgb(pol) {
  if (pol > 0.05) return _lerpColor(_polNeutral, _polPositive, Math.min(1, pol*4));
  if (pol < -0.05) return _lerpColor(_polNeutral, _polNegative, Math.min(1, -pol*4));
  return _polNeutral;
}

// ── Ridgeline layout helper ──
// Computes row geometry from the windowed layout.
function _computeRidgelineLayout(lay) {
  var numWords = lay.wordSlots.length;
  var padTop = lay.padTop;
  var padBottom = 10;
  var ROW_OVERLAP = 10;
  var availH = lay.canvasH - padTop - padBottom;
  var ROW_STEP = numWords > 0
    ? Math.max(5, Math.floor((availH - ROW_OVERLAP) / numWords))
    : 20;
  var ROW_H = ROW_STEP + ROW_OVERLAP;
  var MAX_RISE = ROW_H + ROW_OVERLAP;

  var rowYs = [];
  for (var i = 0; i < numWords; i++) {
    rowYs.push(padTop + i * ROW_STEP + ROW_H);
  }

  return {
    ROW_STEP: ROW_STEP,
    ROW_H: ROW_H,
    MAX_RISE: MAX_RISE,
    rowYs: rowYs,
    rowLabelH: 14
  };
}

// ── Waveform path builder (module-level, no closure issues) ──
function _buildWavePath(ctx, pts, baseY) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, baseY);
  ctx.lineTo(pts[0].x, pts[0].y);
  for (var p = 1; p < pts.length; p++) {
    var cpx = (pts[p-1].x + pts[p].x) / 2;
    ctx.bezierCurveTo(cpx, pts[p-1].y, cpx, pts[p].y, pts[p].x, pts[p].y);
  }
  ctx.lineTo(pts[pts.length-1].x, baseY);
  ctx.closePath();
}

// ── Label column overlay ──
// rowGeom: { rowYs, rowLabelH } — ridgeline baseline positions.
function _buildLabelOverlay(layout, seeds, lockedWords, sortMode, onWordClick, rowGeom) {
  var padLeft = layout.padLeft;
  var hasHL = !!(seeds && seeds.size > 0);
  var fhc = sortMode === "freq" ? T.text : T.flow;
  var rhc = sortMode === "relevance" ? T.text : T.flow;
  var rowLabelH = rowGeom ? rowGeom.rowLabelH : 16;

  var rows = layout.wordSlots.map(function(slot, idx) {
    var isSeed   = !!(seeds && seeds.has(slot.word));
    var isLocked = !!(lockedWords && lockedWords.has(slot.word));
    var isDim    = hasHL && !isSeed && !isLocked;

    var fc = sortMode === "freq"
      ? (isDim ? "#181818" : T.text)
      : (isDim ? "#0c1818" : T.flow);
    var rc = sortMode === "relevance"
      ? (isDim ? "#181818" : T.text)
      : (isDim ? "#0c1818" : T.flow);
    var wc  = (isSeed || isLocked) ? T.accent : isDim ? "#222" : T.text;
    var sc  = isDim ? "#1c1c1c" : "#333";
    var bg  = (isSeed || isLocked) ? T.accent + "14" : "transparent";
    var lb  = (isSeed || isLocked) ? "2px solid " + T.accent : "2px solid transparent";

    var topY = rowGeom ? rowGeom.rowYs[idx] - rowLabelH : slot.y;
    var ht   = rowGeom ? rowLabelH : slot.slotH;
    var ai   = rowGeom ? "flex-end" : "center";
    var pb   = rowGeom ? "1px" : "0";

    return React.createElement("div", {
      key: slot.word,
      onClick: function(ev) {
        ev.stopPropagation();
        if (onWordClick) onWordClick(slot.word);
      },
      style: {
        position: "absolute", top: topY, left: 0, right: 0, height: ht,
        display: "flex", alignItems: ai, paddingBottom: pb,
        background: bg, borderLeft: lb,
        cursor: "pointer", boxSizing: "border-box", fontFamily: T.fontMono
      }
    },
      React.createElement("div", {
        style: { width: 74, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 5, flexShrink: 0 }
      },
        React.createElement("span", { style: { fontSize: 9, color: fc, minWidth: 20, textAlign: "right", lineHeight: 1 } }, slot.freq),
        React.createElement("span", { style: { fontSize: 9, color: sc, padding: "0 2px", lineHeight: 1 } }, "|"),
        React.createElement("span", { style: { fontSize: 9, color: rc, minWidth: 26, textAlign: "right", lineHeight: 1 } }, (slot.rel || 1).toFixed(1))
      ),
      React.createElement("div", {
        style: { flex: 1, minWidth: 0, display: "flex", justifyContent: "flex-end", paddingRight: 7 }
      },
        React.createElement("span", {
          style: { fontSize: 9, color: wc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 98 }
        }, slot.word)
      )
    );
  });

  // Header — column hints aligned with value columns
  var header = React.createElement("div", {
    style: {
      position: "absolute", top: 0, left: 0, right: 0, height: layout.padTop,
      display: "flex", alignItems: "flex-end", paddingBottom: 1,
      fontFamily: T.fontMono
    }
  },
    React.createElement("div", { style: { width: 74, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 5, flexShrink: 0 } },
      React.createElement("span", { style: { fontSize: 8, color: fhc, minWidth: 20, textAlign: "right" } }, "frec"),
      React.createElement("span", { style: { fontSize: 8, color: T.textDim, padding: "0 2px" } }, "|"),
      React.createElement("span", { style: { fontSize: 8, color: rhc, minWidth: 26, textAlign: "right" } }, "rel")
    )
  );

  return React.createElement("div", {
    style: {
      position: "absolute", top: 0, left: 0,
      width: padLeft, height: layout.canvasH,
      background: T.bgDeep, borderRight: "1px solid " + T.border,
      overflow: "hidden", zIndex: 2
    }
  }, header, rows);
}

// ════════════════════════════════════════════
// FibrasChart — HTML5 Canvas ridgeline
// ════════════════════════════════════════════
function FibrasChart(props) {
  var containerRef = useRef(null);
  var canvasRef    = useRef(null);
  var propsRef     = useRef(props);
  propsRef.current = props;

  var hovWordRef = useRef(null);
  var drawRef    = useRef(null);

  var _hw = useState(null); var hovWord = _hw[0], setHovWord = _hw[1];

  // ── Draw ──
  function draw() {
    var canvas = canvasRef.current;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var lay = propsRef.current.layout;
    if (!lay) return;

    var seeds  = propsRef.current.seeds;
    var locked = propsRef.current.lockedWords;
    var ridge  = _computeRidgelineLayout(lay);
    var MAX_RISE = ridge.MAX_RISE;
    var rowYs    = ridge.rowYs;

    var hasHL = !!(seeds && seeds.size > 0) || !!(locked && locked.size > 0);
    function isWordActive(w) {
      if (!hasHL) return true;
      if (seeds  && seeds.has(w))  return true;
      if (locked && locked.has(w)) return true;
      return false;
    }

    ctx.clearRect(0, 0, lay.canvasW, lay.canvasH);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, lay.canvasW, lay.canvasH);

    // Column guidelines
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (var g = 0; g < lay.columns.length; g++) {
      ctx.beginPath();
      ctx.moveTo(lay.columns[g].x, 0);
      ctx.lineTo(lay.columns[g].x, lay.canvasH);
      ctx.stroke();
    }

    // Draw bottom row first so top row renders on top
    for (var ri = lay.wordSlots.length - 1; ri >= 0; ri--) {
      var slot   = lay.wordSlots[ri];
      var rank   = ri;
      var active = isWordActive(slot.word);
      var isDim  = hasHL && !active;
      var isHov  = hovWordRef.current === slot.word;
      var baseY  = rowYs[rank];
      var col    = slot.color;

      // Build waveform points from node data
      var pts = [];
      for (var c = 0; c < lay.numCols; c++) {
        var nd = slot.nodes[c];
        var normAct = nd ? nd.primaryNorm : 0;
        pts.push({
          x:    lay.columns[c].x,
          y:    baseY - normAct * MAX_RISE,
          prov: nd ? nd.provenance : null
        });
      }

      if (!isDim) {
        // 1. Partial occlusion — dark waveform shape partially hides row below
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.62;
        ctx.fillStyle = '#111';
        _buildWavePath(ctx, pts, baseY);
        ctx.fill();
        ctx.restore();

        // 2. Ghost fill — lighter blend, always present trace
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = col;
        _buildWavePath(ctx, pts, baseY);
        ctx.fill();
        ctx.restore();

        // 3. Direct fill — lighter blend, higher alpha, only direct segments
        for (var ds = 0; ds < lay.numCols - 1; ds++) {
          if (pts[ds].prov !== "directo" && pts[ds+1].prov !== "directo") continue;
          (function(p0, p1, bY, cl) {
            var cpx = (p0.x + p1.x) / 2;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.60;
            ctx.fillStyle = cl;
            ctx.beginPath();
            ctx.moveTo(p0.x, bY);
            ctx.lineTo(p0.x, p0.y);
            ctx.bezierCurveTo(cpx, p0.y, cpx, p1.y, p1.x, p1.y);
            ctx.lineTo(p1.x, bY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          })(pts[ds], pts[ds+1], baseY, col);
        }
      }

      // 4. Stroke — segment by segment, direct brighter than ghost
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (var ss = 0; ss < lay.numCols - 1; ss++) {
        var isDirect = pts[ss].prov === "directo" || pts[ss+1].prov === "directo";
        ctx.globalAlpha = isDim ? 0.12 : (isDirect ? 0.90 : 0.25);
        ctx.strokeStyle = col;
        ctx.lineWidth = isHov ? 2.2 : 1.2;
        ctx.setLineDash([]);
        var cpx2 = (pts[ss].x + pts[ss+1].x) / 2;
        ctx.beginPath();
        ctx.moveTo(pts[ss].x, pts[ss].y);
        ctx.bezierCurveTo(cpx2, pts[ss].y, cpx2, pts[ss+1].y, pts[ss+1].x, pts[ss+1].y);
        ctx.stroke();
      }
      ctx.restore();

      // 5. Row baseline rule
      ctx.save();
      ctx.globalAlpha = isDim ? 0.05 : 0.13;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(lay.padLeft, baseY);
      ctx.lineTo(lay.canvasW - 20, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 6. Dots at direct-presence segment peaks
      if (!isDim) {
        for (var sd = 0; sd < lay.numCols; sd++) {
          if (pts[sd].prov !== "directo" || pts[sd].y >= baseY - 1) continue;
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(pts[sd].x, pts[sd].y, isHov ? 3 : 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Hovered word label on canvas
    if (hovWordRef.current) {
      for (var hwi = 0; hwi < lay.wordSlots.length; hwi++) {
        if (lay.wordSlots[hwi].word !== hovWordRef.current) continue;
        var hslot = lay.wordSlots[hwi];
        var hrank = hwi;
        var maxNorm = 0, maxCol = 0;
        for (var hc = 0; hc < lay.numCols; hc++) {
          var hn = hslot.nodes[hc];
          if (hn && hn.primaryNorm > maxNorm) { maxNorm = hn.primaryNorm; maxCol = hc; }
        }
        var labelY = rowYs[hrank] - maxNorm * MAX_RISE - 6;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = hslot.color;
        ctx.font = 'bold 9px Roboto Mono';
        ctx.textAlign = 'center';
        ctx.fillText(hslot.word, lay.columns[maxCol].x, Math.max(12, labelY));
        ctx.restore();
        break;
      }
    }
  }

  drawRef.current = draw;

  // ── Mount canvas and attach events ──
  useEffect(function() {
    if (!containerRef.current || !propsRef.current.layout) return;

    // Clear previous canvas
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    var lay = propsRef.current.layout;
    var canvas = document.createElement('canvas');
    canvas.width  = lay.canvasW;
    canvas.height = lay.canvasH;
    canvas.style.display = 'block';

    canvas.addEventListener('mousemove', function(ev) {
      var curLay = propsRef.current.layout;
      if (!curLay) return;
      var rect = canvas.getBoundingClientRect();
      var scale = curLay.canvasW / rect.width;
      var mx = (ev.clientX - rect.left) * scale;
      var my = (ev.clientY - rect.top)  * scale;

      // Ignore padLeft zone — handled by React overlay
      if (mx < curLay.padLeft) {
        if (hovWordRef.current !== null) {
          hovWordRef.current = null; setHovWord(null); drawRef.current();
        }
        return;
      }

      var ridge2   = _computeRidgelineLayout(curLay);
      var rowYs2   = ridge2.rowYs;
      var MAX_RISE2 = ridge2.MAX_RISE;
      var best = null, bd = Infinity;
      for (var wi = 0; wi < curLay.wordSlots.length; wi++) {
        var sl2 = curLay.wordSlots[wi];
        for (var c2 = 0; c2 < curLay.numCols; c2++) {
          var nd2 = sl2.nodes[c2];
          if (!nd2) continue;
          var px = curLay.columns[c2].x;
          var py = rowYs2[wi] - nd2.primaryNorm * MAX_RISE2;
          var d  = (mx-px)*(mx-px) + (my-py)*(my-py);
          if (d < bd && d < 900) { bd = d; best = sl2.word; }
        }
      }
      if (best !== hovWordRef.current) {
        hovWordRef.current = best; setHovWord(best); drawRef.current();
      }
    });

    canvas.addEventListener('mouseleave', function() {
      hovWordRef.current = null; setHovWord(null); drawRef.current();
    });

    canvas.addEventListener('click', function(ev) {
      var curLay = propsRef.current.layout;
      if (!curLay) return;
      var rect = canvas.getBoundingClientRect();
      var mx = (ev.clientX - rect.left) * (curLay.canvasW / rect.width);
      if (mx < curLay.padLeft) return;
      if (hovWordRef.current) {
        if (propsRef.current.toggleLocked) propsRef.current.toggleLocked(hovWordRef.current);
      } else {
        if (propsRef.current.clearAllPins) propsRef.current.clearAllPins();
        if (propsRef.current.clearLocked)  propsRef.current.clearLocked();
      }
      drawRef.current();
    });

    containerRef.current.appendChild(canvas);
    canvasRef.current = canvas;
    drawRef.current();

    return function() { canvasRef.current = null; };
  }, [props.layout]);

  useEffect(function() {
    drawRef.current();
  }, [props.lockedWords, props.seeds, props.enabledEmos]);

  var rowGeom = props.layout ? _computeRidgelineLayout(props.layout) : null;

  return React.createElement("div", {
    style: {
      position: "relative",
      border: "1px solid " + T.border,
      borderRadius: T.radius6,
      overflow: "hidden"
    }
  },
    React.createElement("div", {
      ref: containerRef,
      onClick: function(ev) { ev.stopPropagation(); },
      style: { background: T.bg }
    }),
    props.layout && _buildLabelOverlay(
      props.layout, props.seeds, props.lockedWords,
      props.sortMode, props.onWordClick,
      rowGeom ? { rowYs: rowGeom.rowYs, rowLabelH: rowGeom.rowLabelH } : null
    )
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
  var pinnedSeg    = props.pinnedSeg;
  var setPinnedSeg = props.setPinnedSeg;
  var tipData    = props.tipData;
  var setTipData = props.setTipData;

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
    ev.stopPropagation();
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
        "Polaridad ", React.createElement("span", { style: { color: polColor } }, (pol > 0 ? "+" : "") + pol.toFixed(3))),
      React.createElement("div", { style: { color: T.textMid } },
        "Activaci\u00F3n ", React.createElement("span", { style: { color: T.arousal } }, (aro > 0 ? "+" : "") + aro.toFixed(3)))
    );
  }

  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: T.gap6 } },
    React.createElement("button", {
      onClick: function(ev) { ev.stopPropagation(); if (showNav) setWinStart(Math.max(0, winStart - 1)); },
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
      onClick: handleClick, onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave,
      style: {
        position: "relative", width: chartWidth, height: barH,
        border: "1px solid " + T.border, borderRadius: T.radius3,
        cursor: "pointer", overflow: "hidden", flexShrink: 0
      }
    },
      segPolarity.map(function(pol, i) {
        var rgb = _polarityToRgb(pol);
        return React.createElement("div", { key: i, style: {
          position: "absolute", left: i * segW, top: 0,
          width: Math.ceil(segW) + 1, height: barH,
          background: "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")", opacity: 0.35
        }});
      }),
      React.createElement("svg", {
        style: { position: "absolute", top: 0, left: 0, width: chartWidth, height: barH, pointerEvents: "none" }
      },
        React.createElement("line", {
          x1: 0, x2: chartWidth, y1: midY, y2: midY,
          stroke: "rgba(255,255,255,0.25)", strokeWidth: 1, strokeDasharray: "3,3"
        }),
        arousalDashes.map(function(d, i) {
          return React.createElement("line", { key: i, x1: d.x1, x2: d.x2, y1: d.y, y2: d.y,
            stroke: "white", strokeWidth: 1.5, opacity: 0.8 });
        }),
        segW > 14 && segArousal.map(function(val, i) {
          return React.createElement("text", { key: "l"+i,
            x: i * segW + segW / 2, y: barH - 3, textAnchor: "middle",
            fontSize: Math.min(9, segW * 0.5), fontFamily: T.fontMono,
            fill: "rgba(255,255,255,0.35)"
          }, String(i + 1));
        })
      ),
      showNav && React.createElement("div", { style: {
        position: "absolute", left: navX, top: 0, width: navW, height: barH - 2,
        border: "2px solid " + T.accent, borderRadius: T.radius3,
        background: T.accent + "15", pointerEvents: "none", boxSizing: "border-box"
      }})
    ),

    React.createElement("button", {
      onClick: function(ev) { ev.stopPropagation(); if (showNav) setWinStart(Math.min(maxStart, winStart + 1)); },
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

  var pinnedSeg    = props.pinnedSeg;
  var setPinnedSeg = props.setPinnedSeg;
  var tipData      = props.tipData;
  var setTipData   = props.setTipData;

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
            React.createElement("span", { style: { color: EC[ek] } }, _EMO_ES[ek] || ek), " ",
            React.createElement("span", { style: { color: T.text } }, ((ebar[ek] || 0) * 100).toFixed(1) + "%"));
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
          ev.stopPropagation();
          if (pinnedSeg === ebi) { setPinnedSeg(null); setTipData(null); }
          else { setPinnedSeg(ebi); setTipData({ seg: ebi, x: ev.clientX, y: ev.clientY }); }
        }
      },
        active.map(function(ek, eki) {
          var eH = ((ebar[ek] || 0) / maxEmo) * barH;
          return React.createElement("div", { key: ek, style: {
            position: "absolute", left: 4 + eki * (barW + 1), bottom: 2,
            width: barW, height: eH, background: EC[ek], opacity: 0.7, borderRadius: 1,
            pointerEvents: "none"
          }});
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
  var onWordClick  = props.onWordClick;
  var winSize      = 10;

  var _ws  = useState(0);    var winStart  = _ws[0],  setWinStart  = _ws[1];
  var _mmp = useState(null); var mmPinned  = _mmp[0], setMmPinned  = _mmp[1];
  var _mmt = useState(null); var mmTip     = _mmt[0], setMmTip     = _mmt[1];
  var _emp = useState(null); var emPinned  = _emp[0], setEmPinned  = _emp[1];
  var _emt = useState(null); var emTip     = _emt[0], setEmTip     = _emt[1];
  var _segTip = useState(null); var segTooltip = _segTip[0], setSegTooltip = _segTip[1];
  var _segPin = useState(null); var segPinned  = _segPin[0], setSegPinned  = _segPin[1];

  var clearAllPinsRef = useRef(null);

  function clearAllPins() {
    setMmPinned(null); setMmTip(null);
    setEmPinned(null); setEmTip(null);
    setSegPinned(null); setSegTooltip(null);
  }

  clearAllPinsRef.current = clearAllPins;

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

  var padLeft    = layout ? layout.padLeft : 80;
  var padRight   = 20;
  var chartAreaW = canvasW - padLeft - padRight;

  var segLabels = layout ? layout.columns.map(function(col) {
    return { segIdx: col.segIdx, x: col.x, label: col.label };
  }) : [];
  var activeTip = segPinned || segTooltip;

  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", gap: T.gap4, position: "relative" },
    onClick: function() { clearAllPinsRef.current(); }
  },
    props.docLabel && React.createElement("div", {
      style: { fontSize: T.fs10, color: T.textMid, fontFamily: T.fontMono }
    }, props.docLabel),

    React.createElement("div", { style: { marginLeft: padLeft - 32 } },
      React.createElement(FibrasMinimap, {
        numSegs: fibras.numSegs, winStart: winStart, winSize: winSize,
        setWinStart: setWinStart, chartWidth: chartAreaW,
        segPolarity: layout ? layout.segPolarity : [],
        segArousal:  layout ? layout.segArousal  : [],
        pinnedSeg: mmPinned, setPinnedSeg: setMmPinned,
        tipData: mmTip, setTipData: setMmTip
      })
    ),

    layout && React.createElement(FibrasEmoBars, {
      layout: layout, enabledEmos: enabledEmos,
      pinnedSeg: emPinned, setPinnedSeg: setEmPinned,
      tipData: emTip, setTipData: setEmTip
    }),

    segLabels.length > 0 && React.createElement("div", {
      style: { position: "relative", height: 14, width: canvasW, marginBottom: 2 }
    },
      segLabels.map(function(sl, sli) {
        var txt = sl.label ? "S" + (sl.segIdx + 1) : String(sl.segIdx + 1);
        return React.createElement("span", {
          key: sli,
          onMouseEnter: function() { if (sl.label && !segPinned) setSegTooltip(sl); },
          onMouseLeave: function() { if (!segPinned) setSegTooltip(null); },
          onClick: function(ev) {
            ev.stopPropagation();
            if (!sl.label) return;
            if (segPinned && segPinned.segIdx === sl.segIdx) setSegPinned(null);
            else setSegPinned(sl);
          },
          style: {
            position: "absolute", left: sl.x, top: 0, transform: "translateX(-50%)",
            fontSize: 9, fontFamily: T.fontMono, color: "#ffffff", fontWeight: "bold",
            cursor: sl.label ? "pointer" : "default"
          }
        }, txt);
      }),
      activeTip && React.createElement("div", {
        style: {
          position: "absolute", left: Math.min(activeTip.x, canvasW - 220), top: 18,
          maxWidth: 200, padding: T.pad8, background: T.bg + "ee",
          border: "1px solid " + (segPinned ? T.accent : T.borderLight),
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
      lockedWords: lockedWords, toggleLocked: toggleLocked,
      clearLocked: clearLocked, clearAllPins: clearAllPins,
      enabledEmos: enabledEmos,
      sortMode: sortMode,
      onWordClick: onWordClick
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
  var onWordClick   = props.onWordClick;

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
    var id  = selectedArr[0];
    var doc = docById(id);
    return React.createElement(FibrasDocStack, {
      fibras: fibrasDataMap[id], seeds: seeds, enabledEmos: enabledEmos,
      docLabel: doc ? doc.label : "", sortMode: sortMode, colorMode: colorMode,
      lockedWords: lockedWords, toggleLocked: toggleLocked, clearLocked: clearLocked,
      commMap: commMapByDoc[id], canvasW: canvasW, canvasH: canvasH, eng: engProp,
      onWordClick: onWordClick
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
        commMap: commMapByDoc[did], canvasW: canvasW, canvasH: stackH, eng: engProp,
        onWordClick: onWordClick
      });
    })
  );
}
