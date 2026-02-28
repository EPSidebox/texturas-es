// ─────────────────────────────────────────────
// app.js — Texturas (ES) v2.0
// State management + tab routing
// Reads: all modules
// Exports: Texturas (main component, rendered to #root)
// ─────────────────────────────────────────────

// ── Layer labels (Spanish) ──
var LAYER_LABELS = {
  polarity: "Polaridad",
  emotion: "Emoci\u00F3n",
  arousal: "Activaci\u00F3n",
  frequency: "Frecuencia",
  community: "Comunidad"
};

// ── Doc protocol detection ──
function detectDocProtocol(text) {
  var re = /---DOC:(.+?)---/g;
  var m;
  var markers = [];
  while ((m = re.exec(text)) !== null) {
    markers.push({ idx: m.index, label: m[1].trim(), end: m.index + m[0].length });
  }
  if (markers.length < 2) return null;
  var docs = [];
  for (var i = 0; i < markers.length; i++) {
    var start = markers[i].end;
    var end = (i + 1 < markers.length) ? markers[i + 1].idx : text.length;
    var body = text.substring(start, end).trim();
    if (body.length > 0) {
      docs.push({ label: markers[i].label, text: body });
    }
  }
  return docs.length > 0 ? docs : null;
}

// ── Small number input ──
function NumInput(props) {
  var val = props.value, set = props.onChange, mn = props.min, mx = props.max, step = props.step, w = props.width;
  return React.createElement("input", {
    type: "number",
    value: val,
    min: mn,
    max: mx,
    step: step || 1,
    onChange: function(ev) {
      var v = parseFloat(ev.target.value);
      if (!isNaN(v)) set(Math.max(mn, Math.min(mx, v)));
    },
    style: {
      width: w || 50,
      background: T.bgCard,
      border: "1px solid " + T.border,
      borderRadius: T.radius3,
      color: T.text,
      padding: "2px 4px",
      fontSize: T.fs10,
      fontFamily: T.fontMono,
      textAlign: "center"
    }
  });
}

// ── Main App ──
function Texturas() {
  // ── Documents ──
  var _d = useState([{ id: "doc1", label: "Documento 1", text: "" }]);
  var docs = _d[0], setDocs = _d[1];
  var _aid = useState("doc1");
  var activeInputDoc = _aid[0], setActiveInputDoc = _aid[1];
  var _sv = useState(["doc1"]);
  var selectedViewDocs = _sv[0], setSelectedViewDocs = _sv[1];

  // ── Tab ──
  var _tab = useState("input");
  var tab = _tab[0], setTab = _tab[1];

  // ── Analysis params ──
  var _topN = useState(25);
  var topN = _topN[0], setTopN = _topN[1];
  var _wnD = useState(2);
  var wnDepth = _wnD[0], setWnDepth = _wnD[1];
  var _dec = useState(0.5);
  var decay = _dec[0], setDecay = _dec[1];
  var _flow = useState("bi");
  var flow = _flow[0], setFlow = _flow[1];

  // ── Pipeline results ──
  var _s1c = useState({});
  var stage1Cache = _s1c[0], setStage1Cache = _s1c[1];
  var _pdr = useState({});
  var perDocResults = _pdr[0], setPerDocResults = _pdr[1];

  // ── UI state ──
  var _ld = useState(false);
  var loading = _ld[0], setLoading = _ld[1];
  var _msg = useState("");
  var msg = _msg[0], setMsg = _msg[1];
  var _sp = useState(false);
  var showParams = _sp[0], setShowParams = _sp[1];

  // ── NLP engine ──
  var _eng = useState({ pos: mkPOS(), lem: mkLem(), syn: mkSyn(), sent: mkSent(), vec: mkVec() });
  var eng = _eng[0];
  var _engSt = useState("idle");
  var engSt = _engSt[0], setEngSt = _engSt[1];

  // ── Seeds ──
  var _seeds = useState(new Set());
  var seeds = _seeds[0], setSeeds = _seeds[1];
  var _si = useState("");
  var seedInput = _si[0], setSeedInput = _si[1];
  var _sb = useState("freq");
  var sortBy = _sb[0], setSortBy = _sb[1];

  // ── Locked words (click-to-fix highlighting) ──
  var _lw = useState(new Set());
  var lockedWords = _lw[0], setLockedWords = _lw[1];

  // ── Layers ──
  var _lay = useState({ polarity: true, emotion: true, arousal: false, frequency: true, community: false });
  var layers = _lay[0], setLayers = _lay[1];
  var _ee = useState(new Set(["joy", "fear", "sadness", "anger"]));
  var enabledEmos = _ee[0], setEnabledEmos = _ee[1];

  // ── Fibras ──
  var _fm = useState("recurrentes");
  var fibrasMode = _fm[0], setFibrasMode = _fm[1];
  var _fs = useState(10);
  var fibrasSegs = _fs[0], setFibrasSegs = _fs[1];
  var _fc = useState("stack");
  var fibrasCompare = _fc[0], setFibrasCompare = _fc[1];

  // ── Custom segments per doc ──
  var _csb = useState({});
  var customSegsByDoc = _csb[0], setCustomSegsByDoc = _csb[1];
  var _cm = useState("comunidad");
  var colorMode = _cm[0], setColorMode = _cm[1];

  // ── Tejido filter ──
  var _tf = useState(true);
  var tejidoFilter = _tf[0], setTejidoFilter = _tf[1];

  // ── Load NLP engines on mount ──
  useEffect(function() {
    if (engSt !== "idle") return;
    setEngSt("loading");
    setMsg("Cargando recursos NLP...");

    var statusCb = function(s) { setMsg(s); };

    Promise.all([
      loadAsset("pos-es", "wordnet/pos-lookup-es.json", false, statusCb),
      loadAsset("lem-es", "wordnet/lemmatizer-es.json", false, statusCb),
      loadAsset("syn-es", "wordnet/synsets-es.json", false, statusCb),
      loadAsset("emolex-es", "lexicons/nrc-emolex-es.json", false, statusCb),
      loadAsset("intensity-es", "lexicons/nrc-intensity-es.json", false, statusCb),
      loadAsset("vad-es", "lexicons/nrc-vad-es.json", false, statusCb),
      loadAsset("swn-es", "lexicons/sentiwordnet-es.json", false, statusCb),
      loadAsset("vocab-es", "vectors/vocab.json", false, statusCb),
      loadAsset("vec-0", "vectors/vectors-0.bin", true, statusCb),
      loadAsset("vec-1", "vectors/vectors-1.bin", true, statusCb)
    ]).then(function(results) {
      if (results[0]) eng.pos.load(results[0]);
      if (results[1]) eng.lem.load(results[1]);
      if (results[2]) eng.syn.load(results[2]);
      if (results[3]) eng.sent.lEl(results[3]);
      if (results[4]) eng.sent.lInt(results[4]);
      if (results[5]) eng.sent.lVad(results[5]);
      if (results[6]) eng.sent.lSwn(results[6]);
      if (results[7] && results[8]) {
        var bufs = [results[8]];
        if (results[9]) bufs.push(results[9]);
        eng.vec.load(results[7], bufs);
      }
      setEngSt("ready");
      setMsg("Listo. " + (eng.vec.isLoaded() ? eng.vec.vocab + " vectores." : "Sin vectores."));
    }).catch(function(e) {
      setEngSt("error");
      setMsg("Error cargando recursos: " + e.message);
    });
  }, []);

  // ── Analysis ──
  function runAnalysis() {
    if (engSt !== "ready") { setMsg("Esperando recursos NLP..."); return; }
    setLoading(true);
    setMsg("Analizando...");

    setTimeout(function() {
      var newS1 = {};
      var newResults = {};
      var newCsb = {};
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        if (!d.text || d.text.trim().length === 0) continue;

        // Strip SEG markers from text before analysis
        var cleanText = d.text.replace(/---SEG:.+?---/g, "\n\n");

        var s1 = analyzeStage1(cleanText, eng, topN);
        newS1[d.id] = s1;
        var s2 = analyzeStage2(s1, eng, topN, wnDepth, decay, flow);
        newResults[d.id] = s2;

        // Detect custom segments from original text
        var segProto = detectSegProtocol(d.text);
        if (segProto) {
          var boundaries = buildCustomSegBoundaries(d.text, segProto, s2.enriched, eng);
          newCsb[d.id] = boundaries;
        }
      }
      setStage1Cache(newS1);
      setPerDocResults(newResults);
      setCustomSegsByDoc(newCsb);
      setLoading(false);
      setMsg("An\u00E1lisis completo.");
      setTab("fibras");
    }, 50);
  }

  function rerunStage2(newDecay, newFlow) {
    var d2 = newDecay !== undefined ? newDecay : decay;
    var f2 = newFlow !== undefined ? newFlow : flow;
    if (newDecay !== undefined) setDecay(d2);
    if (newFlow !== undefined) setFlow(f2);
    var newResults = {};
    for (var id in stage1Cache) {
      if (!stage1Cache.hasOwnProperty(id)) continue;
      newResults[id] = analyzeStage2(stage1Cache[id], eng, topN, wnDepth, d2, f2);
    }
    setPerDocResults(newResults);
  }

  function rerunTopN(n) {
    setTopN(n);
    if (engSt !== "ready") return;
    var newS1 = {};
    var newResults = {};
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      if (!d.text || d.text.trim().length === 0) continue;
      var cleanText = d.text.replace(/---SEG:.+?---/g, "\n\n");
      var s1 = analyzeStage1(cleanText, eng, n);
      newS1[d.id] = s1;
      newResults[d.id] = analyzeStage2(s1, eng, n, wnDepth, decay, flow);
    }
    setStage1Cache(newS1);
    setPerDocResults(newResults);
  }

  // ── Doc management ──
  function handleDocClick(id, ev) {
    if (ev && ev.ctrlKey) {
      var cur = selectedViewDocs.slice();
      var idx = cur.indexOf(id);
      if (idx >= 0) { cur.splice(idx, 1); }
      else if (cur.length < 3) { cur.push(id); }
      setSelectedViewDocs(cur);
    } else {
      setSelectedViewDocs([id]);
    }
  }

  function addDoc() {
    var id = "doc" + (docs.length + 1) + "_" + Date.now();
    setDocs(docs.concat([{ id: id, label: "Documento " + (docs.length + 1), text: "" }]));
    setActiveInputDoc(id);
  }

  function removeDoc(id) {
    if (docs.length <= 1) return;
    var next = docs.filter(function(d) { return d.id !== id; });
    setDocs(next);
    if (activeInputDoc === id) setActiveInputDoc(next[0].id);
    setSelectedViewDocs(selectedViewDocs.filter(function(sid) { return sid !== id; }));
  }

  function updateDocText(id, text) {
    setDocs(docs.map(function(d) { return d.id === id ? { id: d.id, label: d.label, text: text } : d; }));
  }

  function updateDocLabel(id, label) {
    setDocs(docs.map(function(d) { return d.id === id ? { id: d.id, label: label, text: d.text } : d; }));
  }

  function doSplit() {
    var activeDoc = null;
    for (var i = 0; i < docs.length; i++) { if (docs[i].id === activeInputDoc) { activeDoc = docs[i]; break; } }
    if (!activeDoc) return;
    var parsed = detectDocProtocol(activeDoc.text);
    if (!parsed) { setMsg("No se encontr\u00F3 protocolo ---DOC:Nombre---"); return; }
    var newDocs = parsed.map(function(p, idx) {
      return { id: "doc_split_" + idx + "_" + Date.now(), label: p.label, text: p.text };
    });
    setDocs(newDocs);
    setActiveInputDoc(newDocs[0].id);
    setSelectedViewDocs([newDocs[0].id]);
    setMsg("Separados " + newDocs.length + " documentos.");
  }

  // ── Seeds ──
  function toggleSeed(w) {
    var next = new Set(seeds);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    setSeeds(next);
  }

  function toggleLocked(w) {
    var next = new Set(lockedWords);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    setLockedWords(next);
  }

  // ── Fibras data (memoized per selected docs) ──
  var fibrasDataMap = useMemo(function() {
    var map = {};
    for (var i = 0; i < selectedViewDocs.length; i++) {
      var id = selectedViewDocs[i];
      var res = perDocResults[id];
      if (!res) continue;
      var csb = customSegsByDoc[id] || null;
      map[id] = computeFibras(
        res.enriched, res.freqMap, res.relevanceMap, eng,
        seeds, fibrasSegs, fibrasMode, topN, decay,
        sortBy === "relevance" ? "relevance" : "freq",
        csb
      );
    }
    return map;
  }, [selectedViewDocs, perDocResults, seeds, fibrasSegs, fibrasMode, topN, decay, sortBy, customSegsByDoc]);

  // ── Word list for panel (from fibras data) ──
  var fibrasWords = useMemo(function() {
    var id = selectedViewDocs[0];
    var fd = fibrasDataMap[id];
    if (!fd) return [];
    return fd.nodeWords.map(function(w) {
      return { word: w, freq: fd.freqMap[w] || 0, rel: fd.relevanceMap[w] || 1 };
    });
  }, [fibrasDataMap, selectedViewDocs]);

  // ── CommMap and polarity map by doc (for color modes) ──
  var commMapByDoc = useMemo(function() {
    var map = {};
    for (var i = 0; i < selectedViewDocs.length; i++) {
      var id = selectedViewDocs[i];
      var res = perDocResults[id];
      if (!res) continue;
      if (colorMode === "valencia") {
        // Build per-word average polarity
        var polMap = {};
        var polSums = {};
        var polCounts = {};
        for (var ti = 0; ti < res.enriched.length; ti++) {
          var tok = res.enriched[ti];
          if (tok.stop || tok.polarity === null) continue;
          if (!polSums[tok.lemma]) { polSums[tok.lemma] = 0; polCounts[tok.lemma] = 0; }
          polSums[tok.lemma] += tok.polarity;
          polCounts[tok.lemma] += 1;
        }
        for (var w in polSums) {
          if (polSums.hasOwnProperty(w)) {
            polMap[w] = polSums[w] / polCounts[w];
          }
        }
        map[id] = polMap;
      } else {
        map[id] = res.commMap || {};
      }
    }
    return map;
  }, [selectedViewDocs, perDocResults, colorMode]);

  // ── Top words for Tejido panel ──
  var tejidoWords = useMemo(function() {
    var id = selectedViewDocs[0];
    var res = perDocResults[id];
    if (!res) return [];
    return res.topWords.map(function(pair) {
      return { word: pair[0], freq: pair[1], rel: res.relevanceMap[pair[0]] || 1 };
    });
  }, [perDocResults, selectedViewDocs]);

  // ── Filtered weaveEnriched for Tejido (dims words not in active mode) ──
  var tejidoFilteredSet = useMemo(function() {
    if (!tejidoFilter) return null; // null = show all
    var id = selectedViewDocs[0];
    var fd = fibrasDataMap[id];
    if (!fd) return null;
    var set = {};
    for (var i = 0; i < fd.nodeWords.length; i++) {
      set[fd.nodeWords[i]] = true;
    }
    return set;
  }, [tejidoFilter, fibrasDataMap, selectedViewDocs]);

  function filterWeaveEnriched(weaveEnriched, filterSet) {
    if (!filterSet) return weaveEnriched;
    return weaveEnriched.map(function(para) {
      return para.map(function(tok) {
        if (tok.stop || tok.type === "s" || tok.type === "x") return tok;
        if (!filterSet[tok.lemma]) {
          // Clone and mark as stop so WeaveReader dims it
          return {
            surface: tok.surface, lemma: tok.lemma, pos: tok.pos,
            stop: true, type: tok.type, rel: tok.rel, freq: tok.freq,
            polarity: tok.polarity, arousal: tok.arousal,
            emolex: tok.emolex, comm: tok.comm
          };
        }
        return tok;
      });
    });
  }

  // ── Active doc for text area ──
  var activeDoc = null;
  for (var adi = 0; adi < docs.length; adi++) {
    if (docs[adi].id === activeInputDoc) { activeDoc = docs[adi]; break; }
  }

  // ── Tab bar style ──
  var tabBtnStyle = function(t) {
    return {
      background: tab === t ? T.accent + "22" : "transparent",
      border: "1px solid " + (tab === t ? T.accent : T.border),
      color: tab === t ? T.accent : T.textMid,
      borderRadius: T.radius4,
      padding: "6px 16px",
      fontSize: T.fs12,
      fontFamily: T.fontMono,
      cursor: "pointer"
    };
  };

  // ════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════
  return React.createElement("div", {
    style: {
      maxWidth: T.maxWidth,
      margin: "0 auto",
      padding: T.pad16,
      fontFamily: T.fontMono,
      color: T.text
    }
  },
    // ── Header ──
    React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.gap16 }
    },
      React.createElement("h1", {
        style: { fontSize: T.fs18, color: T.accent, margin: 0, fontWeight: 500 }
      }, "Texturas"),
      React.createElement("span", {
        style: { fontSize: T.fs10, color: T.textDim }
      }, msg)
    ),

    // ── Tab bar ──
    React.createElement("div", {
      style: { display: "flex", gap: T.gap6, marginBottom: T.gap16 }
    },
      React.createElement("button", { onClick: function() { setTab("input"); }, style: tabBtnStyle("input") }, "Importar"),
      React.createElement("button", { onClick: function() { setTab("fibras"); }, style: tabBtnStyle("fibras") }, "Fibras"),
      React.createElement("button", { onClick: function() { setTab("weave"); }, style: tabBtnStyle("weave") }, "Tejido"),
      React.createElement("button", { onClick: function() { setTab("output"); }, style: tabBtnStyle("output") }, "Exportar"),
      React.createElement("button", { onClick: function() { setTab("about"); }, style: tabBtnStyle("about") }, "Acerca")
    ),

    // ════════════════════════════════════════
    // TAB: ENTRADA
    // ════════════════════════════════════════
    tab === "input" && React.createElement("div", null,
      // Doc tabs
      React.createElement("div", {
        style: { display: "flex", gap: T.gap4, marginBottom: T.gap8, flexWrap: "wrap", alignItems: "center" }
      },
        docs.map(function(d) {
          var active = d.id === activeInputDoc;
          return React.createElement("div", {
            key: d.id,
            style: { display: "flex", alignItems: "center", gap: 2 }
          },
            React.createElement("button", {
              onClick: function() { setActiveInputDoc(d.id); },
              style: {
                background: active ? T.accent + "22" : T.bgCard,
                border: "1px solid " + (active ? T.accent : T.border),
                color: active ? T.accent : T.textMid,
                borderRadius: T.radius3,
                padding: "3px 8px",
                fontSize: T.fs10,
                fontFamily: T.fontMono,
                cursor: "pointer"
              }
            }, d.label),
            docs.length > 1 && React.createElement("button", {
              onClick: function() { removeDoc(d.id); },
              style: {
                background: "transparent",
                border: "none",
                color: T.textFaint,
                cursor: "pointer",
                fontSize: T.fs10,
                padding: "0 2px"
              }
            }, "\u00D7")
          );
        }),
        React.createElement("button", {
          onClick: addDoc,
          style: {
            background: "transparent",
            border: "1px dashed " + T.borderLight,
            color: T.textDim,
            borderRadius: T.radius3,
            padding: "3px 8px",
            fontSize: T.fs10,
            fontFamily: T.fontMono,
            cursor: "pointer"
          }
        }, "+ Doc")
      ),

      // Label editor
      activeDoc && React.createElement("div", {
        style: { marginBottom: T.gap8 }
      },
        React.createElement("input", {
          type: "text",
          value: activeDoc.label,
          onChange: function(ev) { updateDocLabel(activeDoc.id, ev.target.value); },
          style: {
            background: T.bgCard,
            border: "1px solid " + T.border,
            borderRadius: T.radius3,
            color: T.text,
            padding: T.pad4,
            fontSize: T.fs12,
            fontFamily: T.fontMono,
            width: 300
          }
        })
      ),

      // Text area
      activeDoc && React.createElement("textarea", {
        value: activeDoc.text,
        onChange: function(ev) { updateDocText(activeDoc.id, ev.target.value); },
        placeholder: "Pega o escribe tu texto en espa\u00F1ol aqu\u00ED...",
        style: {
          width: "100%",
          height: 300,
          background: T.bgDeep,
          border: "1px solid " + T.border,
          borderRadius: T.radius4,
          color: T.text,
          padding: T.pad12,
          fontSize: T.fs13,
          fontFamily: T.fontMono,
          resize: "vertical",
          lineHeight: 1.6
        }
      }),

      // Split button
      React.createElement("div", {
        style: { marginTop: T.gap8, display: "flex", gap: T.gap8, alignItems: "center" }
      },
        React.createElement("button", {
          onClick: doSplit,
          style: {
            background: "transparent",
            border: "1px solid " + T.borderLight,
            color: T.textMid,
            borderRadius: T.radius3,
            padding: "4px 10px",
            fontSize: T.fs10,
            fontFamily: T.fontMono,
            cursor: "pointer"
          }
        }, "Separar (---DOC:---)"),
        React.createElement("span", { style: { fontSize: 9, color: T.textFaint } },
          "Usa ---DOC:Nombre--- para separar m\u00FAltiples documentos"
        )
      ),

      // Parameters
      React.createElement("div", { style: { marginTop: T.gap16 } },
        React.createElement("button", {
          onClick: function() { setShowParams(!showParams); },
          style: {
            background: "transparent",
            border: "1px solid " + T.borderLight,
            color: T.textMid,
            borderRadius: T.radius3,
            padding: "4px 10px",
            fontSize: T.fs10,
            fontFamily: T.fontMono,
            cursor: "pointer",
            marginBottom: T.gap8
          }
        }, showParams ? "Ocultar par\u00E1metros" : "Par\u00E1metros"),

        showParams && React.createElement("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: T.gap8,
            alignItems: "center",
            padding: T.pad12,
            background: T.bgCard,
            border: "1px solid " + T.border,
            borderRadius: T.radius4,
            maxWidth: 400
          }
        },
          React.createElement("span", { style: { fontSize: T.fs10, color: T.textMid } }, "Top N:"),
          React.createElement(NumInput, { value: topN, onChange: setTopN, min: 10, max: 100, width: 60 }),

          React.createElement("span", { style: { fontSize: T.fs10, color: T.textMid } }, "WordNet depth:"),
          React.createElement(NumInput, { value: wnDepth, onChange: setWnDepth, min: 1, max: 3, width: 60 }),

          React.createElement("span", { style: { fontSize: T.fs10, color: T.textMid } }, "Decay:"),
          React.createElement(NumInput, { value: decay, onChange: setDecay, min: 0.1, max: 0.9, step: 0.1, width: 60 }),

          React.createElement("span", { style: { fontSize: T.fs10, color: T.textMid } }, "Flujo:"),
          React.createElement("div", { style: { display: "flex", gap: T.gap4 } },
            ["bi", "up", "down"].map(function(f) {
              var label = f === "bi" ? "Bi" : f === "up" ? "\u2191" : "\u2193";
              return React.createElement("button", {
                key: f,
                onClick: function() { setFlow(f); },
                style: {
                  background: flow === f ? T.accent + "22" : "transparent",
                  border: "1px solid " + (flow === f ? T.accent : T.border),
                  color: flow === f ? T.accent : T.textDim,
                  borderRadius: T.radius3,
                  padding: "2px 8px",
                  fontSize: T.fs10,
                  fontFamily: T.fontMono,
                  cursor: "pointer"
                }
              }, label);
            })
          )
        )
      ),

      // Analyze button
      React.createElement("div", { style: { marginTop: T.gap16 } },
        React.createElement("button", {
          onClick: runAnalysis,
          disabled: loading || engSt !== "ready",
          style: {
            background: T.accent,
            border: "none",
            color: T.bg,
            borderRadius: T.radius4,
            padding: "8px 24px",
            fontSize: T.fs13,
            fontFamily: T.fontMono,
            fontWeight: 500,
            cursor: loading ? "wait" : "pointer",
            opacity: loading || engSt !== "ready" ? 0.5 : 1
          }
        }, loading ? "Analizando..." : "Analizar")
      )
    ),

    // ════════════════════════════════════════
    // TAB: FIBRAS
    // ════════════════════════════════════════
    tab === "fibras" && React.createElement("div", null,
      // Controls — Row 1: Mode + Color + Emotions
      React.createElement("div", {
        style: {
          display: "flex", gap: T.gap12, alignItems: "center",
          marginBottom: T.gap6, flexWrap: "wrap"
        }
      },
        // Mode selector
        React.createElement("div", { style: { display: "flex", gap: T.gap4 } },
          [
            { key: "semillas", label: "Semillas" },
            { key: "recurrentes", label: "Recurrentes" },
            { key: "persistentes", label: "Persistentes" }
          ].map(function(m) {
            var active = fibrasMode === m.key;
            return React.createElement("button", {
              key: m.key,
              onClick: function() { setFibrasMode(m.key); },
              style: {
                background: active ? T.accent + "22" : "transparent",
                border: "1px solid " + (active ? T.accent : T.border),
                color: active ? T.accent : T.textDim,
                borderRadius: T.radius3,
                padding: "3px 8px",
                fontSize: T.fs10,
                fontFamily: T.fontMono,
                cursor: "pointer"
              }
            }, m.label);
          })
        ),

        // Color mode selector
        React.createElement("div", { style: { display: "flex", gap: T.gap4, alignItems: "center" } },
          React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Color:"),
          ["comunidad", "valencia", "rango"].map(function(cm) {
            var active = colorMode === cm;
            var label = cm === "comunidad" ? "Com" : cm === "valencia" ? "Pol" : "Rng";
            return React.createElement("button", {
              key: cm,
              onClick: function() { setColorMode(cm); },
              style: {
                background: active ? T.accent + "22" : "transparent",
                border: "1px solid " + (active ? T.accent : T.border),
                color: active ? T.accent : T.textDim,
                borderRadius: T.radius3,
                padding: "2px 6px",
                fontSize: 9,
                fontFamily: T.fontMono,
                cursor: "pointer"
              }
            }, label);
          })
        ),

        // Emotion toggle
        React.createElement(EmoToggle4, { enabledEmos: enabledEmos, setEnabledEmos: setEnabledEmos })
      ),

      // Controls — Row 2: Seg + Decay + N + Flow + Compare
      React.createElement("div", {
        style: {
          display: "flex", gap: T.gap12, alignItems: "center",
          marginBottom: T.gap12, flexWrap: "wrap"
        }
      },
        // Segments (disabled when custom segments present)
        (function() {
          var activeDocId = selectedViewDocs[0];
          var hasCustom = customSegsByDoc[activeDocId] && customSegsByDoc[activeDocId].length > 0;
          var customCount = hasCustom ? customSegsByDoc[activeDocId].length : 0;
          return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
            React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Seg:"),
            hasCustom
              ? React.createElement("span", {
                  style: { fontSize: 9, color: T.accent, fontFamily: T.fontMono }
                }, customCount + " (custom)")
              : React.createElement(NumInput, { value: fibrasSegs, onChange: setFibrasSegs, min: 3, max: 50, width: 45 })
          );
        })(),

        // Decay
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
          React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Dec:"),
          React.createElement("input", {
            type: "range",
            min: 0.1,
            max: 0.9,
            step: 0.1,
            value: decay,
            onChange: function(ev) { rerunStage2(parseFloat(ev.target.value)); },
            style: { width: 60 }
          }),
          React.createElement("span", { style: { fontSize: 9, color: T.textMid } }, decay.toFixed(1))
        ),

        // TopN
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
          React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "N:"),
          React.createElement(NumInput, { value: topN, onChange: rerunTopN, min: 10, max: 100, width: 45 })
        ),

        // Flow direction
        React.createElement("div", { style: { display: "flex", gap: T.gap4, alignItems: "center" } },
          React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Flujo:"),
          ["bi", "up", "down"].map(function(f) {
            var label = f === "bi" ? "Bi" : f === "up" ? "\u2191" : "\u2193";
            return React.createElement("button", {
              key: f,
              onClick: function() { rerunStage2(undefined, f); },
              style: {
                background: flow === f ? T.accent + "22" : "transparent",
                border: "1px solid " + (flow === f ? T.accent : T.border),
                color: flow === f ? T.accent : T.textDim,
                borderRadius: T.radius3,
                padding: "2px 6px",
                fontSize: 9,
                fontFamily: T.fontMono,
                cursor: "pointer"
              }
            }, label);
          })
        ),

        // Compare mode (if multiple docs)
        selectedViewDocs.length > 1 && React.createElement("div", { style: { display: "flex", gap: T.gap4 } },
          ["stack", "overlay"].map(function(cm) {
            var label = cm === "stack" ? "Apilar" : "Superponer";
            var active = fibrasCompare === cm;
            return React.createElement("button", {
              key: cm,
              onClick: function() { setFibrasCompare(cm); },
              style: {
                background: active ? T.accent + "22" : "transparent",
                border: "1px solid " + (active ? T.accent : T.border),
                color: active ? T.accent : T.textDim,
                borderRadius: T.radius3,
                padding: "2px 6px",
                fontSize: 9,
                fontFamily: T.fontMono,
                cursor: "pointer"
              }
            }, label);
          })
        )
      ),

      // Doc selector
      docs.length > 1 && React.createElement("div", {
        style: { display: "flex", gap: T.gap4, marginBottom: T.gap8 }
      },
        docs.map(function(d) {
          var sel = selectedViewDocs.indexOf(d.id) >= 0;
          return React.createElement("button", {
            key: d.id,
            onClick: function(ev) { handleDocClick(d.id, ev); },
            style: {
              background: sel ? T.accent + "22" : T.bgCard,
              border: "1px solid " + (sel ? T.accent : T.border),
              color: sel ? T.accent : T.textDim,
              borderRadius: T.radius3,
              padding: "2px 8px",
              fontSize: T.fs10,
              fontFamily: T.fontMono,
              cursor: "pointer"
            }
          }, d.label);
        }),
        React.createElement("span", { style: { fontSize: 9, color: T.textFaint, alignSelf: "center" } }, "Ctrl+clic: multi")
      ),

      // Main content: WordPanel + FibrasMultiDoc
      React.createElement("div", {
        style: { display: "flex", gap: T.gap12 }
      },
        // Word panel
        React.createElement(WordPanel, {
          words: fibrasWords,
          seeds: seeds,
          toggleSeed: toggleSeed,
          seedInput: seedInput,
          setSeedInput: setSeedInput,
          setSeeds: setSeeds,
          sortBy: sortBy,
          setSortBy: setSortBy,
          freqMap: perDocResults[selectedViewDocs[0]] ? perDocResults[selectedViewDocs[0]].freqMap : {},
          maxFreq: perDocResults[selectedViewDocs[0]] ? perDocResults[selectedViewDocs[0]].maxFreq : 1,
          maxRel: perDocResults[selectedViewDocs[0]] ? perDocResults[selectedViewDocs[0]].maxRel : 1
        }),

        // Fibras chart
        React.createElement(FibrasMultiDoc, {
          selectedArr: selectedViewDocs,
          fibrasDataMap: fibrasDataMap,
          seedArr: seeds,
          enabledEmos: enabledEmos,
          docs: docs,
          compareMode: fibrasCompare,
          sortMode: sortBy === "relevance" ? "relevance" : "freq",
          colorMode: colorMode,
          lockedWords: lockedWords,
          toggleLocked: toggleLocked,
          commMapByDoc: commMapByDoc,
          canvasW: T.maxWidth - T.wordPanelW - T.gap12 * 2,
          canvasH: T.contentH,
          eng: eng
        })
      )
    ),

    // ════════════════════════════════════════
    // TAB: TEJIDO
    // ════════════════════════════════════════
    tab === "weave" && React.createElement("div", null,
      // Mode selector + filter toggle
      React.createElement("div", {
        style: { display: "flex", gap: T.gap8, marginBottom: T.gap8, alignItems: "center", flexWrap: "wrap" }
      },
        // Shared mode selector
        React.createElement("div", { style: { display: "flex", gap: T.gap4 } },
          [
            { key: "semillas", label: "Semillas" },
            { key: "recurrentes", label: "Recurrentes" },
            { key: "persistentes", label: "Persistentes" }
          ].map(function(m) {
            var active = fibrasMode === m.key;
            return React.createElement("button", {
              key: m.key,
              onClick: function() { setFibrasMode(m.key); },
              style: {
                background: active ? T.accent + "22" : "transparent",
                border: "1px solid " + (active ? T.accent : T.border),
                color: active ? T.accent : T.textDim,
                borderRadius: T.radius3,
                padding: "3px 8px",
                fontSize: T.fs10,
                fontFamily: T.fontMono,
                cursor: "pointer"
              }
            }, m.label);
          })
        ),

        // Filter toggle
        React.createElement("button", {
          onClick: function() { setTejidoFilter(!tejidoFilter); },
          style: {
            background: tejidoFilter ? T.accent + "22" : "transparent",
            border: "1px solid " + (tejidoFilter ? T.accent : T.borderLight),
            color: tejidoFilter ? T.accent : T.textDim,
            borderRadius: T.radius3,
            padding: "3px 8px",
            fontSize: T.fs10,
            fontFamily: T.fontMono,
            cursor: "pointer"
          }
        }, tejidoFilter ? "Filtro activo" : "Mostrar todo")
      ),

      // Layer toggles
      React.createElement("div", {
        style: { display: "flex", gap: T.gap8, marginBottom: T.gap12, flexWrap: "wrap", alignItems: "center" }
      },
        Object.keys(LAYER_LABELS).map(function(lk) {
          var on = layers[lk];
          var cfg = LAYER_CFG[lk];
          return React.createElement("button", {
            key: lk,
            onClick: function() {
              var next = {};
              for (var k in layers) { if (layers.hasOwnProperty(k)) next[k] = layers[k]; }
              next[lk] = !on;
              setLayers(next);
            },
            style: {
              background: on ? cfg.color + "22" : "transparent",
              border: "1px solid " + (on ? cfg.color : T.borderLight),
              color: on ? cfg.color : T.textDim,
              borderRadius: T.radius3,
              padding: "3px 10px",
              fontSize: T.fs10,
              fontFamily: T.fontMono,
              cursor: "pointer"
            }
          }, LAYER_LABELS[lk]);
        }),
        React.createElement(EmoToggle4, { enabledEmos: enabledEmos, setEnabledEmos: setEnabledEmos }),

        // Decay slider
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
          React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Dec:"),
          React.createElement("input", {
            type: "range", min: 0.1, max: 0.9, step: 0.1, value: decay,
            onChange: function(ev) { rerunStage2(parseFloat(ev.target.value)); },
            style: { width: 60 }
          }),
          React.createElement("span", { style: { fontSize: 9, color: T.textMid } }, decay.toFixed(1))
        ),

        // Flow direction
        React.createElement("div", { style: { display: "flex", gap: T.gap4 } },
          ["bi", "up", "down"].map(function(f) {
            var label = f === "bi" ? "Bi" : f === "up" ? "\u2191" : "\u2193";
            return React.createElement("button", {
              key: f,
              onClick: function() { rerunStage2(undefined, f); },
              style: {
                background: flow === f ? T.accent + "22" : "transparent",
                border: "1px solid " + (flow === f ? T.accent : T.border),
                color: flow === f ? T.accent : T.textDim,
                borderRadius: T.radius3,
                padding: "2px 8px",
                fontSize: T.fs10,
                fontFamily: T.fontMono,
                cursor: "pointer"
              }
            }, label);
          })
        )
      ),

      // Doc selector
      docs.length > 1 && React.createElement("div", {
        style: { display: "flex", gap: T.gap4, marginBottom: T.gap8 }
      },
        docs.map(function(d) {
          var sel = selectedViewDocs.indexOf(d.id) >= 0;
          return React.createElement("button", {
            key: d.id,
            onClick: function(ev) { handleDocClick(d.id, ev); },
            style: {
              background: sel ? T.accent + "22" : T.bgCard,
              border: "1px solid " + (sel ? T.accent : T.border),
              color: sel ? T.accent : T.textDim,
              borderRadius: T.radius3,
              padding: "2px 8px",
              fontSize: T.fs10,
              fontFamily: T.fontMono,
              cursor: "pointer"
            }
          }, d.label);
        })
      ),

      // Content: WordPanel + WeaveReader
      React.createElement("div", {
        style: { display: "flex", gap: T.gap12 }
      },
        React.createElement(WordPanel, {
          words: tejidoWords,
          seeds: seeds,
          toggleSeed: toggleSeed,
          seedInput: seedInput,
          setSeedInput: setSeedInput,
          setSeeds: setSeeds,
          sortBy: sortBy,
          setSortBy: setSortBy,
          freqMap: perDocResults[selectedViewDocs[0]] ? perDocResults[selectedViewDocs[0]].freqMap : {},
          maxFreq: perDocResults[selectedViewDocs[0]] ? perDocResults[selectedViewDocs[0]].maxFreq : 1,
          maxRel: perDocResults[selectedViewDocs[0]] ? perDocResults[selectedViewDocs[0]].maxRel : 1
        }),

        React.createElement("div", { style: { flex: 1 } },
          selectedViewDocs.map(function(docId) {
            var res = perDocResults[docId];
            if (!res) return null;
            var weData = tejidoFilteredSet
              ? filterWeaveEnriched(res.weaveEnriched, tejidoFilteredSet)
              : res.weaveEnriched;
            return React.createElement(WeaveReader, {
              key: docId,
              weaveEnriched: weData,
              layers: layers,
              freqMap: res.freqMap,
              maxFreq: res.maxFreq,
              relevanceMap: res.relevanceMap,
              maxRel: res.maxRel,
              commMap: res.commMap,
              enabledEmos: enabledEmos,
              onWordClick: toggleSeed
            });
          })
        )
      )
    ),

    // ════════════════════════════════════════
    // TAB: SALIDA
    // ════════════════════════════════════════
    tab === "output" && React.createElement("div", null,
      React.createElement("div", {
        style: { display: "flex", flexDirection: "column", gap: T.gap12 }
      },
        docs.map(function(d) {
          var res = perDocResults[d.id];
          if (!res) return null;
          return React.createElement("div", {
            key: d.id,
            style: {
              padding: T.pad12,
              background: T.bgCard,
              border: "1px solid " + T.border,
              borderRadius: T.radius4
            }
          },
            React.createElement("div", {
              style: { fontSize: T.fs12, color: T.accent, marginBottom: T.gap8 }
            }, d.label),
            React.createElement("div", {
              style: { display: "flex", gap: T.gap8, flexWrap: "wrap" }
            },
              React.createElement("button", {
                onClick: function() { dlFile(genTEI(d.label, res), d.label + ".xml", "application/xml"); },
                style: {
                  background: "transparent", border: "1px solid " + T.borderLight,
                  color: T.textMid, borderRadius: T.radius3, padding: "4px 10px",
                  fontSize: T.fs10, fontFamily: T.fontMono, cursor: "pointer"
                }
              }, "TEI XML"),
              React.createElement("button", {
                onClick: function() { dlFile(genCSV(d.label, res), d.label + ".csv", "text/csv"); },
                style: {
                  background: "transparent", border: "1px solid " + T.borderLight,
                  color: T.textMid, borderRadius: T.radius3, padding: "4px 10px",
                  fontSize: T.fs10, fontFamily: T.fontMono, cursor: "pointer"
                }
              }, "CSV"),
              React.createElement("button", {
                onClick: function() { dlFile(genReport(d.label, res), d.label + "-informe.md", "text/markdown"); },
                style: {
                  background: "transparent", border: "1px solid " + T.borderLight,
                  color: T.textMid, borderRadius: T.radius3, padding: "4px 10px",
                  fontSize: T.fs10, fontFamily: T.fontMono, cursor: "pointer"
                }
              }, "Informe MD")
            )
          );
        }),

        // Corpus TEI
        Object.keys(perDocResults).length > 1 && React.createElement("button", {
          onClick: function() { dlFile(genCorpusTEI(docs, perDocResults), "texturas-corpus.xml", "application/xml"); },
          style: {
            background: "transparent", border: "1px solid " + T.borderLight,
            color: T.textMid, borderRadius: T.radius3, padding: "4px 10px",
            fontSize: T.fs10, fontFamily: T.fontMono, cursor: "pointer", alignSelf: "flex-start"
          }
        }, "Corpus TEI (todos)"),

        // TEI Import
        React.createElement("div", {
          style: { marginTop: T.gap16 }
        },
          React.createElement("div", {
            style: { fontSize: T.fs10, color: T.textDim, marginBottom: T.gap4 }
          }, "Importar TEI:"),
          React.createElement("input", {
            type: "file",
            accept: ".xml",
            onChange: function(ev) {
              var file = ev.target.files[0];
              if (!file) return;
              var reader = new FileReader();
              reader.onload = function(e) {
                var result = parseTEIImport(e.target.result);
                if (result.error) { setMsg(result.error); return; }
                if (result.docs) {
                  var newDocs = result.docs.map(function(d, i) {
                    return { id: "tei_" + i + "_" + Date.now(), label: d.label, text: d.text };
                  });
                  setDocs(newDocs);
                  setActiveInputDoc(newDocs[0].id);
                  setSelectedViewDocs([newDocs[0].id]);
                  setMsg("Importados " + newDocs.length + " documento(s) desde TEI.");
                  setTab("input");
                }
              };
              reader.readAsText(file);
            },
            style: {
              fontSize: T.fs10,
              fontFamily: T.fontMono,
              color: T.textMid
            }
          })
        )
      )
    ),

    // ════════════════════════════════════════
    // TAB: ACERCA
    // ════════════════════════════════════════
    tab === "about" && React.createElement("div", {
      style: {
        maxWidth: T.maxWidthNarrow,
        padding: T.pad16,
        color: T.textMid,
        fontSize: T.fs12,
        lineHeight: 1.8
      }
    },
      React.createElement("h2", { style: { color: T.accent, fontSize: T.fs15, marginBottom: T.gap12 } }, "Texturas v2.0"),
      React.createElement("p", null,
        "Herramienta de an\u00E1lisis textual multicapa para textos en espa\u00F1ol. ",
        "Combina frecuencia, relevancia sem\u00E1ntica (WordNet), polaridad (NRC VAD), ",
        "emociones (NRC EmoLex), activaci\u00F3n y comunidades l\u00E9xicas (Louvain)."
      ),
      React.createElement("p", null,
        "Desarrollado por Ernesto Pe\u00F1a. Northeastern University."
      ),
      React.createElement("p", { style: { fontSize: T.fs10, color: T.textDim } },
        "Sin modelos neuronales. Sin transformers. Cada m\u00E9trica es determinista, ",
        "auditable y reproducible."
      )
    )
  );
}

// ── Mount ──
ReactDOM.render(
  React.createElement(Texturas),
  document.getElementById("root")
);
