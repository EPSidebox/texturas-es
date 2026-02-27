// ─────────────────────────────────────────────
// weave-components.js — Texturas (ES) v1.0
// Weave annotated text reader + minimap + tooltip
// Reads: T, EC, CC, EMOTIONS, LAYER_CFG from config.js
// Exports: WeaveReader, WeaveMinimap, WeaveTooltip, EmoBars
// ─────────────────────────────────────────────

// ── EmoBars — small horizontal emotion bar set ──
function EmoBars(props) {
  var emolex = props.emolex;
  if (!emolex) return null;
  var bars = [];
  for (var i = 0; i < EMOTIONS.length; i++) {
    var em = EMOTIONS[i];
    if (emolex[em]) bars.push(em);
  }
  if (!bars.length) return null;
  return React.createElement("span", {
    style: { display: "inline-flex", gap: 1, marginLeft: 2, verticalAlign: "middle" }
  }, bars.map(function(em) {
    return React.createElement("span", {
      key: em,
      style: { display: "inline-block", width: 4, height: 4, borderRadius: 1, background: EC[em] },
      title: em
    });
  }));
}

// ── WeaveTooltip — hover detail for Weave tokens ──
function WeaveTooltip(props) {
  var tok = props.tok, pos = props.pos;
  if (!tok || tok.stop) return null;
  var emos = [];
  if (tok.emolex) {
    for (var i = 0; i < EMOTIONS.length; i++) {
      if (tok.emolex[EMOTIONS[i]]) emos.push(EMOTIONS[i]);
    }
  }
  return React.createElement("div", {
    style: {
      position: "fixed", left: pos.x + 12, top: pos.y - 8,
      padding: T.pad8, background: T.bg + "ee", border: "1px solid " + T.borderLight,
      borderRadius: T.radius4, fontFamily: T.fontMono, fontSize: T.fs10,
      zIndex: 100, pointerEvents: "none", maxWidth: 260, backdropFilter: "blur(2px)"
    }
  },
    React.createElement("div", { style: { color: T.accent, fontSize: T.fs12, marginBottom: 2 } },
      tok.surface, " ",
      React.createElement("span", { style: { color: T.textDim, fontSize: 9 } }, tok.lemma + " · " + tok.pos)
    ),
    React.createElement("div", { style: { color: T.textMid, fontSize: T.fs10 } },
      "Frec: ", React.createElement("span", { style: { color: T.accent } }, tok.freq),
      " \u00B7 Rel: ", React.createElement("span", { style: { color: T.flow } }, (tok.rel || 0).toFixed(1)),
      tok.polarity !== null && React.createElement("span", null,
        " \u00B7 Pol: ", React.createElement("span", {
          style: { color: tok.polarity > 0.05 ? T.positive : tok.polarity < -0.05 ? T.negative : T.textDim }
        }, (tok.polarity > 0 ? "+" : "") + tok.polarity.toFixed(3))
      ),
      tok.arousal !== null && React.createElement("span", null,
        " \u00B7 Act: ", React.createElement("span", { style: { color: T.arousal } }, tok.arousal.toFixed(3))
      )
    ),
    tok.comm >= 0 && React.createElement("div", { style: { marginTop: 2, fontSize: 9, color: CC[tok.comm % CC.length] } },
      "Comunidad " + tok.comm
    ),
    emos.length > 0 && React.createElement("div", {
      style: { display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }
    }, emos.map(function(em) {
      return React.createElement("span", { key: em, style: { fontSize: 9, color: EC[em] } }, em);
    }))
  );
}

// ── WeaveReader — annotated text with layered visual encoding ──
function WeaveReader(props) {
  var weaveEnriched = props.weaveEnriched, layers = props.layers,
      freqMap = props.freqMap, maxFreq = props.maxFreq,
      relevanceMap = props.relevanceMap, maxRel = props.maxRel,
      commMap = props.commMap, enabledEmos = props.enabledEmos,
      onWordClick = props.onWordClick;

  var _h = React.useState(null); var hovTok = _h[0], setHovTok = _h[1];
  var _p = React.useState({ x: 0, y: 0 }); var hovPos = _p[0], setHovPos = _p[1];
  var containerRef = React.useRef(null);

  var showPol = layers.polarity, showEmo = layers.emotion,
      showAro = layers.arousal, showFreq = layers.frequency, showComm = layers.community;

  function renderToken(tok, ti) {
    if (tok.type === "s") return React.createElement("span", { key: ti }, " ");
    if (tok.type === "x") return React.createElement("span", { key: ti, style: { color: T.textFaint } }, tok.surface);

    var isContent = !tok.stop && tok.type !== "x" && tok.type !== "s";
    var style = { fontFamily: T.fontMono, fontSize: T.fs13, cursor: isContent ? "pointer" : "default", lineHeight: 1.8, position: "relative" };

    // Base color
    style.color = tok.stop ? T.textFaint : T.text;

    // Polarity layer — text color
    if (showPol && isContent && tok.polarity !== null) {
      if (tok.polarity > 0.05) style.color = T.positive;
      else if (tok.polarity < -0.05) style.color = T.negative;
      else style.color = T.neutral;
    }

    // Frequency layer — brightness
    if (showFreq && isContent) {
      var fNorm = maxFreq > 0 ? (tok.freq / maxFreq) : 0;
      var bright = 0.3 + fNorm * 0.7;
      style.opacity = bright;
    }

    // Relevance — font weight
    if (isContent && relevanceMap) {
      var rNorm = maxRel > 0 ? ((relevanceMap[tok.lemma] || 0) / maxRel) : 0;
      style.fontWeight = rNorm > 0.3 ? "bold" : "normal";
    }

    // Community layer — background
    if (showComm && isContent && tok.comm >= 0) {
      style.backgroundColor = CC[tok.comm % CC.length] + "18";
      style.borderRadius = "2px";
      style.padding = "0 2px";
    }

    // Arousal layer — underline thickness (via border-bottom)
    if (showAro && isContent && tok.arousal !== null && Math.abs(tok.arousal) > 0.01) {
      var aBright = Math.min(1, Math.abs(tok.arousal) * 2);
      style.borderBottom = (1 + aBright * 2) + "px solid " + T.arousal + (Math.round(aBright * 80 + 20)).toString(16);
    }

    // Emotion underlines
    var emoUnderlines = null;
    if (showEmo && isContent && tok.emolex) {
      var activeEmos = [];
      for (var ei = 0; ei < EMOTIONS.length; ei++) {
        var em = EMOTIONS[ei];
        if (tok.emolex[em] && enabledEmos.has(em)) activeEmos.push(em);
      }
      if (activeEmos.length > 0) {
        emoUnderlines = React.createElement("span", {
          style: { position: "absolute", bottom: -2, left: 0, right: 0, display: "flex", gap: 0, height: 2 }
        }, activeEmos.map(function(em, idx) {
          return React.createElement("span", {
            key: em,
            style: { flex: 1, height: 2, background: EC[em], borderRadius: 1 }
          });
        }));
      }
    }

    return React.createElement("span", {
      key: ti,
      style: style,
      onMouseEnter: function(ev) {
        if (isContent) { setHovTok(tok); setHovPos({ x: ev.clientX, y: ev.clientY }); }
      },
      onMouseMove: function(ev) {
        if (isContent) setHovPos({ x: ev.clientX, y: ev.clientY });
      },
      onMouseLeave: function() { setHovTok(null); },
      onClick: function() { if (isContent && onWordClick) onWordClick(tok.lemma); }
    },
      tok.surface,
      emoUnderlines
    );
  }

  return React.createElement("div", {
    ref: containerRef,
    style: {
      padding: T.pad16, background: T.bgDeep, borderRadius: T.radius6,
      border: "1px solid " + T.border, maxHeight: T.contentH, overflowY: "auto", lineHeight: 1.8
    }
  },
    weaveEnriched.map(function(para, pi) {
      return React.createElement("p", {
        key: pi, style: { marginBottom: T.gap12, minHeight: "1em" }
      },
        para.map(function(tok, ti) { return renderToken(tok, pi + "-" + ti); })
      );
    }),
    hovTok && React.createElement(WeaveTooltip, { tok: hovTok, pos: hovPos })
  );
}

// ── WeaveMinimap — compact frequency/emotion overview ──
function WeaveMinimap(props) {
  var enriched = props.enriched, maxFreq = props.maxFreq, width = props.width;
  var canvasRef = React.useRef(null);
  var w = width || T.minimapW;

  React.useEffect(function() {
    var canvas = canvasRef.current;
    if (!canvas || !enriched || !enriched.length) return;
    var ctx = canvas.getContext("2d");
    var contentTokens = enriched.filter(function(t) { return !t.stop && t.type !== "x" && t.type !== "s"; });
    var h = Math.max(100, contentTokens.length);
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = T.bgDeep; ctx.fillRect(0, 0, w, h);

    var barH = Math.max(1, h / contentTokens.length);
    for (var i = 0; i < contentTokens.length; i++) {
      var tok = contentTokens[i];
      var y = (i / contentTokens.length) * h;
      var fNorm = maxFreq > 0 ? tok.freq / maxFreq : 0;

      // Frequency bar (left half)
      ctx.fillStyle = T.accent;
      ctx.globalAlpha = 0.2 + fNorm * 0.8;
      ctx.fillRect(0, y, w * 0.4, barH);

      // Polarity bar (middle)
      if (tok.polarity !== null) {
        ctx.fillStyle = tok.polarity > 0.05 ? T.positive : tok.polarity < -0.05 ? T.negative : T.neutral;
        ctx.globalAlpha = Math.min(1, Math.abs(tok.polarity) * 2 + 0.1);
        ctx.fillRect(w * 0.45, y, w * 0.2, barH);
      }

      // Emotion dots (right)
      if (tok.emolex) {
        var ex = w * 0.7;
        for (var ei = 0; ei < EMOTIONS.length; ei++) {
          if (tok.emolex[EMOTIONS[ei]]) {
            ctx.fillStyle = EC[EMOTIONS[ei]];
            ctx.globalAlpha = 0.7;
            ctx.fillRect(ex, y, 3, barH);
            ex += 4;
            if (ex > w - 2) break;
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  }, [enriched, maxFreq, w]);

  return React.createElement("canvas", {
    ref: canvasRef,
    style: { width: w, borderRadius: T.radius4, border: "1px solid " + T.border }
  });
}
