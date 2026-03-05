// ─────────────────────────────────────────────
// app.js — Texturas (ES) v1.0
// Main application component — UI in Spanish
// Reads everything from all modules
// ─────────────────────────────────────────────

function patchLayout(n) {
  if (n <= 1) return [1, 1]; if (n === 2) return [1, 2]; if (n === 3) return [1, 3];
  if (n === 4) return [2, 2]; if (n <= 6) return [2, 3]; return [3, Math.ceil(n / 3)];
}

// ── Spanish UI labels ──
var LAYER_LABELS = {
  polarity: "Polaridad", emotion: "Emoci\u00F3n", arousal: "Activaci\u00F3n",
  frequency: "Frecuencia", community: "Comunidad"
};

function Texturas() {
  // ── State ──
  var _docs = useState([{ id: "d1", label: "Documento 1", text: "" }]); var docs = _docs[0], setDocs = _docs[1];
  var _aid = useState("d1"); var activeInputDoc = _aid[0], setActiveInputDoc = _aid[1];
  var _svd = useState(new Set()); var selectedViewDocs = _svd[0], setSelectedViewDocs = _svd[1];
  var _tab = useState("input"); var tab = _tab[0], setTab = _tab[1];
  var _topN = useState(25); var topN = _topN[0], setTopN = _topN[1];
  var _wnD = useState(2); var wnDepth = _wnD[0], setWnDepth = _wnD[1];
  var _dec = useState(0.5); var decay = _dec[0], setDecay = _dec[1];
  var _flo = useState("bi"); var flow = _flo[0], setFlow = _flo[1];
  var _gs = useState(10); var gridSize = _gs[0], setGridSize = _gs[1];
  var _sc = useState("log"); var scale = _sc[0], setScale = _sc[1];
  var _ss = useState(true); var showSize = _ss[0], setShowSize = _ss[1];
  var _sco = useState(false); var showColor = _sco[0], setShowColor = _sco[1];
  var _sv = useState(false); var showVol = _sv[0], setShowVol = _sv[1];
  var _fw = useState(new Set()); var filterWords = _fw[0], setFilterWords = _fw[1];
  var _sb = useState("freq"); var sortBy = _sb[0], setSortBy = _sb[1];
  var _ng = useState("words"); var ngMode = _ng[0], setNgMode = _ng[1];
  var _s1c = useState({}); var stage1Cache = _s1c[0], setStage1Cache = _s1c[1];
  var _pdr = useState({}); var perDocResults = _pdr[0], setPerDocResults = _pdr[1];
  var _ld = useState(false); var loading = _ld[0], setLoading = _ld[1];
  var _msg = useState(""); var msg = _msg[0], setMsg = _msg[1];
  var _es = useState(0); var engSt = _es[0], setEngSt = _es[1];
  var _sp = useState(false); var showParams = _sp[0], setShowParams = _sp[1];
  var _vp = useState("channels"); var vellumPage = _vp[0], setVellumPage = _vp[1];
  var _esl = useState(new Set(EMOTIONS.concat(["center"]))); var enabledSlots = _esl[0], setEnabledSlots = _esl[1];
  var _pc = useState({}); var pinnedCells = _pc[0], setPinnedCells = _pc[1];
  var _ws = useState(new Set()); var weaveSeeds = _ws[0], setWeaveSeeds = _ws[1];
  var _wsi = useState(""); var weaveSeedInput = _wsi[0], setWeaveSeedInput = _wsi[1];
  var _wsb = useState("freq"); var weaveSortBy = _wsb[0], setWeaveSortBy = _wsb[1];
  var _ly = useState({ polarity: true, emotion: true, arousal: false, frequency: true, community: true });
  var layers = _ly[0], setLayers = _ly[1];
  var _ee = useState(new Set(EMOTIONS)); var enabledEmos = _ee[0], setEnabledEmos = _ee[1];

  var pinFor = useCallback(function(docId) {
    return function(idx) { setPinnedCells(function(prev) { var n = {}; for (var k in prev) n[k] = prev[k]; n[docId] = idx; return n; }); };
  }, []);

  // ── NLP Engines ──
  var eng = useRef({ pos: mkPOS(), lem: mkLem(), syn: mkSyn(), sent: mkSent(), vec: mkVec() });

  useEffect(function() {
    var cancelled = false;
    (function() {
      var e = eng.current;
      loadAsset("es-pos", "wordnet/pos-lookup-es.json", false, setMsg).then(function(d) { if (d && !cancelled) e.pos.load(d); });
      loadAsset("es-lem", "wordnet/lemmatizer-es.json", false, setMsg).then(function(d) { if (d && !cancelled) e.lem.load(d); });
      loadAsset("es-syn", "wordnet/synsets-es.json", false, setMsg).then(function(d) { if (d && !cancelled) e.syn.load(d); });
      loadAsset("es-emolex", "lexicons/nrc-emolex-es.json", false, setMsg).then(function(d) { if (d && !cancelled) e.sent.lEl(d); });
      loadAsset("es-int", "lexicons/nrc-intensity-es.json", false, setMsg).then(function(d) { if (d && !cancelled) e.sent.lInt(d); });
      loadAsset("es-vad", "lexicons/nrc-vad-es.json", false, setMsg).then(function(d) { if (d && !cancelled) e.sent.lVad(d); });
      loadAsset("es-swn", "lexicons/sentiwordnet-es.json", false, setMsg).then(function(d) { if (d && !cancelled) e.sent.lSwn(d); });
      // Load word vectors (split Float16)
      Promise.all([
        loadAsset("es-vec-vocab", "vectors/vocab.json", false, setMsg),
        loadAsset("es-vec-0", "vectors/vectors-0.bin", true, setMsg),
        loadAsset("es-vec-1", "vectors/vectors-1.bin", true, setMsg)
      ]).then(function(results) {
        var vj = results[0], v0 = results[1], v1 = results[2];
        if (vj && v0 && v1 && !cancelled) {
          e.vec.load(vj, [v0, v1]);
        }
      });
      setTimeout(function() { if (!cancelled) { setMsg(""); setEngSt(function(s) { return s + 1; }); } }, 500);
    })();
    return function() { cancelled = true; };
  }, []);

  // ── Document management ──
  var addDoc = function() {
    var id = "d" + Date.now();
    setDocs(function(d) { return d.concat([{ id: id, label: "Documento " + (d.length + 1), text: "" }]); });
    setActiveInputDoc(id);
  };
  var rmDoc = function(id) {
    if (docs.length <= 1) return;
    setDocs(function(d) { return d.filter(function(x) { return x.id !== id; }); });
    if (activeInputDoc === id) setActiveInputDoc(docs[0] ? docs[0].id : "d1");
    setSelectedViewDocs(function(prev) { var n = new Set(prev); n.delete(id); return n; });
  };
  var updDoc = function(id, field, val) {
    setDocs(function(d) { return d.map(function(x) { return x.id === id ? Object.assign({}, x, (function() { var o = {}; o[field] = val; return o; })()) : x; }); });
  };
  var handleFiles = function(files) {
    Array.from(files).forEach(function(f) {
      if (!f.name.endsWith(".txt")) return;
      var id = "d" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      var reader = new FileReader();
      reader.onload = function(ev) {
        setDocs(function(d) {
          return d.filter(function(x) { return x.text.trim(); }).concat([{ id: id, label: f.name.replace(".txt", ""), text: ev.target.result }]);
        });
      };
      reader.readAsText(f);
    });
  };

  var validDocs = docs.filter(function(d) { return d.text.trim(); });
  var analyzedIds = Object.keys(perDocResults);
  var selectedArr = Array.from(selectedViewDocs).filter(function(id) { return perDocResults[id]; });
  var isPatchwork = selectedArr.length > 1;

  // ── Analysis ──
  var runAnalysis = useCallback(function() {
    if (!validDocs.length) return;
    setLoading(true); setMsg("Analizando...");
    setTimeout(function() {
      var s1 = {}, pdr = {};
      validDocs.forEach(function(d) {
        s1[d.id] = analyzeStage1(d.text, eng.current, topN);
        pdr[d.id] = analyzeStage2(s1[d.id], eng.current, topN, wnDepth, decay, flow);
      });
      setStage1Cache(s1); setPerDocResults(pdr);
      setFilterWords(new Set()); setNgMode("words");
      setSelectedViewDocs(new Set([validDocs[0].id]));
      setPinnedCells({}); setLoading(false); setMsg(""); setTab("vellum");
    }, 50);
  }, [docs, topN, wnDepth, decay, flow]);

  var rerunStage2 = function(newDecay, newFlow) {
    var d = newDecay !== undefined ? newDecay : decay;
    var f = newFlow !== undefined ? newFlow : flow;
    if (newDecay !== undefined) setDecay(d);
    if (newFlow !== undefined) setFlow(f);
    setMsg("Actualizando...");
    setTimeout(function() {
      var pdr = {};
      var k;
      for (k in stage1Cache) {
        if (stage1Cache.hasOwnProperty(k)) {
          pdr[k] = analyzeStage2(stage1Cache[k], eng.current, topN, wnDepth, d, f);
        }
      }
      setPerDocResults(pdr); setFilterWords(new Set()); setMsg("");
    }, 10);
  };

  var rerunTopN = useCallback(function(n) {
    setTopN(n);
    if (!validDocs.length) return;
    setMsg("Actualizando...");
    setTimeout(function() {
      var s1 = {}, pdr = {};
      validDocs.forEach(function(d) {
        s1[d.id] = analyzeStage1(d.text, eng.current, n);
        pdr[d.id] = analyzeStage2(s1[d.id], eng.current, n, wnDepth, decay, flow);
      });
      setStage1Cache(s1); setPerDocResults(pdr);
      setFilterWords(new Set()); setNgMode("words"); setMsg("");
    }, 50);
  }, [docs, wnDepth, decay, flow]);

  var handleDocClick = function(id, ev) {
    if (ev.ctrlKey || ev.metaKey) {
      setSelectedViewDocs(function(prev) {
        var n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        if (n.size === 0) n.add(id);
        return n;
      });
    } else setSelectedViewDocs(new Set([id]));
  };

  var toggleWeaveSeed = useCallback(function(w) {
    setWeaveSeeds(function(prev) { var n = new Set(prev); if (n.has(w)) n.delete(w); else n.add(w); return n; });
  }, []);

  // ── Fibras stream lock ──
  var _lw = useState(new Set()); var lockedWords = _lw[0], setLockedWords = _lw[1];

  var toggleLocked = useCallback(function(w) {
    setLockedWords(function(prev) { var n = new Set(prev); if (n.has(w)) n.delete(w); else n.add(w); return n; });
  }, []);

  var clearLocked = useCallback(function() {
    setLockedWords(new Set());
  }, []);

  var toggleLayer = function(layer) {
    setLayers(function(prev) { var n = {}; for (var k in prev) n[k] = prev[k]; n[layer] = !prev[layer]; return n; });
  };

  // ── Vellum computed data ──
  var allVData = useMemo(function() {
    var out = {};
    selectedArr.forEach(function(id) {
      var r = perDocResults[id]; if (!r) return;
      var ngFM = ngMode === "bigrams" ? r.ng2Map : ngMode === "trigrams" ? r.ng3Map : null;
      out[id] = vellumBins(r.enriched, gridSize, filterWords, ngMode, ngFM);
    });
    return out;
  }, [perDocResults, selectedArr.join(","), gridSize, filterWords, ngMode]);

  var normMaxes = useMemo(function() {
    var mR = 0, mP = 0, mA = 0;
    var docId;
    for (docId in allVData) {
      if (!allVData.hasOwnProperty(docId)) continue;
      var vd = allVData[docId];
      for (var i = 0; i < vd.bins.length; i++) {
        var b = vd.bins[i];
        if (!b.empty && !b.dimmed) {
          mR = Math.max(mR, Math.abs(b.rel));
          mP = Math.max(mP, Math.abs(b.polarity));
          mA = Math.max(mA, Math.abs(b.arousal));
        }
      }
    }
    return { rel: mR || 1, polarity: mP || 0.01, arousal: mA || 1 };
  }, [allVData]);

  // ── Fibras computed data ──
  var fibrasDataMap = useMemo(function() {
    var out = {};
    selectedArr.forEach(function(id) {
      var r = perDocResults[id]; if (!r) return;
      out[id] = computeFibras(
        r.enriched, r.freqMap, r.relevanceMap, eng.current,
        Array.from(weaveSeeds), gridSize, "recurrentes", topN, decay, sortBy, null, 1
      );
    });
    return out;
  }, [perDocResults, selectedArr.join(","), weaveSeeds, gridSize, topN, decay, sortBy]);

  var commMapByDoc = useMemo(function() {
    var out = {};
    selectedArr.forEach(function(id) {
      var r = perDocResults[id]; if (!r) return;
      out[id] = r.commMap;
    });
    return out;
  }, [perDocResults, selectedArr.join(",")]);

  var e = eng.current;
  var aC = (showSize ? 1 : 0) + (showColor ? 1 : 0) + (showVol ? 1 : 0);
  var tS = function() { if (showSize && aC <= 1) return; setShowSize(!showSize); };
  var tC = function() { if (showColor && aC <= 1) return; setShowColor(!showColor); };
  var tV = function() { if (showVol && aC <= 1) return; setShowVol(!showVol); };

  var mainTabs = [
    { id: "input", l: "Entrada" }, { id: "vellum", l: "Vitela" },
    { id: "weave", l: "Tejido" }, { id: "fibras", l: "Fibras" },
    { id: "output", l: "Salida" }
  ];
  var rc = patchLayout(selectedArr.length);
  var rows = rc[0], cols = rc[1];
  var gridH = isPatchwork ? Math.max(240, Math.min(380, 520 / rows)) : T.contentH;

  // ── Render ──
  return (
    React.createElement("div", { style: { background: T.bg, color: T.text, minHeight: "100vh", fontFamily: T.fontMono, display: "flex", flexDirection: "column" } },

      // Header
      React.createElement("div", { style: { padding: "12px 20px", borderBottom: "1px solid " + T.border, display: "flex", alignItems: "center", gap: T.gap12 } },
        React.createElement("span", { style: { fontSize: T.fs18, color: T.accent, fontWeight: "bold" } }, "\u2B21 Texturas"),
        React.createElement("span", { style: { fontSize: T.fs11, color: T.textDim } }, "v1.0"),
        analyzedIds.length > 0 && React.createElement("span", { style: { fontSize: T.fs10, color: T.text, marginLeft: 8 } },
          "\u25CF " + analyzedIds.length + " doc" + (analyzedIds.length > 1 ? "s" : "")),
        React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8 } },
          e.vec.isLoaded() && React.createElement("span", { style: { fontSize: T.fs10, color: T.positive } }, "\u25CF vec"),
          e.sent.ready && React.createElement("span", { style: { fontSize: T.fs10, color: T.arousal } }, "\u25CF sent"),
          e.pos.ready && React.createElement("span", { style: { fontSize: T.fs10, color: T.grid } }, "\u25CF nlp"),
          e.syn.ready && React.createElement("span", { style: { fontSize: T.fs10, color: T.flow } }, "\u25CF wn")
        )
      ),

      // Tab bar
      React.createElement("div", { style: { display: "flex", borderBottom: "1px solid " + T.border } },
        mainTabs.filter(function(t) { return t.id !== "about"; }).map(function(t) {
          return React.createElement("button", {
            key: t.id, onClick: function() { setTab(t.id); },
            style: { padding: "10px 14px", background: tab === t.id ? T.bgCard : "transparent",
              color: tab === t.id ? T.accent : T.textMid, border: "none",
              borderBottom: tab === t.id ? "2px solid " + T.accent : "2px solid transparent",
              cursor: "pointer", fontSize: T.fs12, fontFamily: T.fontMono }
          }, t.l);
        }),
        React.createElement("div", { style: { flex: 1 } }),
        React.createElement("button", {
          onClick: function() { setTab("about"); },
          style: { padding: "10px 14px", background: tab === "about" ? T.bgCard : "transparent",
            color: tab === "about" ? T.accent : T.textMid, border: "none",
            borderBottom: tab === "about" ? "2px solid " + T.accent : "2px solid transparent",
            cursor: "pointer", fontSize: T.fs12, fontFamily: T.fontMono }
        }, "Acerca")
      ),

      // Doc selector bar
      (tab === "vellum" || tab === "weave" || tab === "fibras") && analyzedIds.length > 0 && React.createElement("div", {
        style: { display: "flex", gap: 4, padding: "8px 20px", borderBottom: "1px solid " + T.border, background: T.bgHover, overflowX: "auto", alignItems: "center" }
      },
        analyzedIds.length > 1 && React.createElement("span", { style: { fontSize: 9, color: T.textDim, marginRight: 4 } }, "Ctrl+clic mosaico"),
        validDocs.filter(function(d) { return perDocResults[d.id]; }).map(function(d) {
          var sel = selectedViewDocs.has(d.id), tw = perDocResults[d.id] ? perDocResults[d.id].tw : 0;
          return React.createElement("button", {
            key: d.id, onClick: function(ev) { handleDocClick(d.id, ev); },
            style: { padding: "4px 12px", borderRadius: T.radius3,
              border: "1px solid " + (sel ? T.flow : T.borderLight),
              background: sel ? T.flow : T.bgCard, color: sel ? T.bg : T.textMid,
              fontSize: T.fs11, fontFamily: T.fontMono, cursor: "pointer" }
          }, d.label + " (" + tw.toLocaleString() + ")");
        })
      ),

      // Content area
      React.createElement("div", { style: { flex: 1, padding: "16px 20px", overflowY: "auto" } },

        // ── ENTRADA TAB ──
        tab === "input" && React.createElement("div", { style: { maxWidth: T.maxWidthNarrow, margin: "0 auto" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: T.gap12 } },
            React.createElement("span", { style: { fontSize: T.fs13, color: "#aaa" } }, "Documentos (" + docs.length + ")"),
            React.createElement("button", {
              onClick: addDoc,
              style: { padding: "4px 12px", background: T.border, color: T.accent, border: "1px solid " + T.borderMed, borderRadius: T.radius4, fontSize: T.fs12, fontFamily: T.fontMono, cursor: "pointer" }
            }, "+ A\u00F1adir"),
            React.createElement("label", {
              style: { padding: "4px 12px", background: T.border, color: T.flow, border: "1px solid " + T.borderMed, borderRadius: T.radius4, fontSize: T.fs12, fontFamily: T.fontMono, cursor: "pointer" }
            }, "Subir .txt",
              React.createElement("input", { type: "file", multiple: true, accept: ".txt", style: { display: "none" }, onChange: function(ev) { handleFiles(ev.target.files); } })
            )
          ),
          // Doc tabs
          React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: T.gap12, flexWrap: "wrap" } },
            docs.map(function(d) {
              return React.createElement("button", {
                key: d.id, onClick: function() { setActiveInputDoc(d.id); },
                style: { padding: "5px 12px", borderRadius: T.radius4,
                  border: "1px solid " + (activeInputDoc === d.id ? T.flow : T.borderLight),
                  background: activeInputDoc === d.id ? "#1a2a2a" : T.bgCard,
                  color: activeInputDoc === d.id ? T.flow : T.textMid,
                  fontSize: T.fs12, fontFamily: T.fontMono, cursor: "pointer" }
              }, d.label,
                docs.length > 1 && React.createElement("span", {
                  onClick: function(ev) { ev.stopPropagation(); rmDoc(d.id); },
                  style: { marginLeft: 8, color: T.textDim, cursor: "pointer" }
                }, "\u00D7")
              );
            })
          ),
          // Active doc editor
          docs.filter(function(d) { return d.id === activeInputDoc; }).map(function(d) {
            return React.createElement("div", { key: d.id },
              React.createElement("input", {
                type: "text", value: d.label,
                onChange: function(ev) { updDoc(d.id, "label", ev.target.value); },
                style: { width: 300, padding: "6px 10px", background: T.bgCard, border: "1px solid " + T.borderMed,
                  borderRadius: T.radius4, color: T.text, fontSize: T.fs13, fontFamily: T.fontMono, boxSizing: "border-box", marginBottom: 8 }
              }),
              React.createElement("textarea", {
                value: d.text, onChange: function(ev) { updDoc(d.id, "text", ev.target.value); },
                placeholder: "Pegar texto aqu\u00ED...",
                style: { width: "100%", height: "calc(100vh - 400px)", background: T.bgDeep,
                  border: "1px solid " + T.border, borderRadius: T.radius6, color: T.text,
                  padding: 16, fontSize: T.fs13, fontFamily: T.fontMono, resize: "none",
                  boxSizing: "border-box", lineHeight: 1.6 }
              })
            );
          }),
          // Analyze button
          React.createElement("div", { style: { marginTop: T.gap12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
            React.createElement("button", {
              onClick: function() { setShowParams(!showParams); },
              style: { padding: "6px 12px", background: T.bgCard, color: T.textMid, border: "1px solid " + T.borderLight, borderRadius: T.radius4, cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono }
            }, "Par\u00E1metros " + (showParams ? "\u25BE" : "\u25B8")),
            React.createElement("button", {
              onClick: runAnalysis, disabled: !validDocs.length || loading,
              style: { padding: "8px 20px",
                background: validDocs.length && !loading ? T.accent : T.borderLight,
                color: validDocs.length && !loading ? T.bg : T.textDim,
                border: "none", borderRadius: T.radius4,
                cursor: validDocs.length && !loading ? "pointer" : "default",
                fontFamily: T.fontMono, fontSize: T.fs13, fontWeight: "bold" }
            }, "Analizar " + validDocs.length + " doc" + (validDocs.length !== 1 ? "s" : "") + " \u2192"),
            msg && React.createElement("span", { style: { fontSize: T.fs10, color: T.arousal } }, msg)
          ),
          showParams && React.createElement("div", {
            style: { marginTop: 10, padding: 14, background: T.bgCard, borderRadius: T.radius6,
              border: "1px solid " + T.borderLight, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }
          },
            React.createElement("div", null,
              React.createElement("label", { style: { fontSize: T.fs10, color: T.textMid, display: "block", marginBottom: 3 } }, "Top N: " + topN),
              React.createElement("input", { type: "range", min: 10, max: 50, value: topN, onChange: function(ev) { setTopN(+ev.target.value); }, style: { width: 100 } })
            ),
            React.createElement("div", null,
              React.createElement("label", { style: { fontSize: T.fs10, color: T.textMid, display: "block", marginBottom: 3 } }, "Prof. WN: " + wnDepth),
              React.createElement("input", { type: "range", min: 1, max: 3, value: wnDepth, onChange: function(ev) { setWnDepth(+ev.target.value); }, style: { width: 80 } })
            ),
            React.createElement("div", null,
              React.createElement("label", { style: { fontSize: T.fs10, color: T.textMid, display: "block", marginBottom: 3 } }, "Decaimiento: " + decay.toFixed(2)),
              React.createElement("input", { type: "range", min: 30, max: 80, value: decay * 100, onChange: function(ev) { setDecay(+ev.target.value / 100); }, style: { width: 100 } })
            )
          )
        ),

        // ── VITELA TAB ──
        tab === "vellum" && selectedArr.length > 0 && React.createElement("div", { style: { maxWidth: T.maxWidth, margin: "0 auto" } },
          // Toolbar
          React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: T.gap12, alignItems: "center", height: 36 } },
            React.createElement("div", { style: { display: "flex", gap: 0, border: "1px solid " + T.borderLight, borderRadius: T.radius4, overflow: "hidden" } },
              React.createElement("button", { onClick: function() { setVellumPage("channels"); },
                style: { padding: "5px 11px", background: vellumPage === "channels" ? T.accent : T.bgCard, color: vellumPage === "channels" ? T.bg : T.textDim, border: "none", cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono, fontWeight: vellumPage === "channels" ? "bold" : "normal" } }, "\u25C9 Canales"),
              React.createElement("button", { onClick: function() { setVellumPage("emotions"); },
                style: { padding: "5px 11px", background: vellumPage === "emotions" ? T.emotion : T.bgCard, color: vellumPage === "emotions" ? T.bg : T.textDim, border: "none", cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono, fontWeight: vellumPage === "emotions" ? "bold" : "normal" } }, "\u25C9 Emociones")
            ),
            React.createElement("div", { style: { width: 1, height: 22, background: T.borderLight } }),
            React.createElement("div", { style: { display: "flex", gap: 0, border: "1px solid " + T.borderLight, borderRadius: T.radius4, overflow: "hidden" } },
              ["linear", "log"].map(function(m) {
                return React.createElement("button", { key: m, onClick: function() { setScale(m); },
                  style: { padding: "5px 11px", background: scale === m ? T.accent : T.bgCard, color: scale === m ? T.bg : T.textDim, border: "none", cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono, fontWeight: scale === m ? "bold" : "normal" } }, m);
              })
            ),
            React.createElement("div", { style: { width: 1, height: 22, background: T.borderLight } }),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, width: 145, flexShrink: 0, justifyContent: vellumPage === "channels" ? "flex-start" : "flex-end" } },
              vellumPage === "channels" && React.createElement("button", { onClick: tS,
                style: { padding: "5px 10px", background: showSize ? "#0d2a28" : T.bgCard, color: showSize ? T.accent : T.textDim, border: "1px solid " + (showSize ? T.accentDim : T.borderLight), borderRadius: T.radius4, cursor: showSize && aC <= 1 ? "not-allowed" : "pointer", fontSize: T.fs11, fontFamily: T.fontMono, opacity: showSize && aC <= 1 ? 0.5 : 1 } }, "Frec/Rel"),
              vellumPage === "channels"
                ? React.createElement("button", { onClick: tC,
                    style: { padding: "5px 10px", background: showColor ? "#1a2a2a" : T.bgCard, color: showColor ? T.positive : T.textDim, border: "1px solid " + (showColor ? T.positive + "44" : T.borderLight), borderRadius: T.radius4, cursor: showColor && aC <= 1 ? "not-allowed" : "pointer", fontSize: T.fs11, fontFamily: T.fontMono, opacity: showColor && aC <= 1 ? 0.5 : 1 } }, "Polaridad")
                : React.createElement(EmoToggle, { enabledSlots: enabledSlots, setEnabledSlots: setEnabledSlots })
            ),
            React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" } },
              React.createElement("button", { onClick: vellumPage === "channels" ? tV : function() { setShowVol(!showVol); },
                style: { padding: "5px 10px", background: showVol ? "#2a2a1a" : T.bgCard, color: showVol ? T.arousal : T.textDim, border: "1px solid " + (showVol ? T.arousal + "44" : T.borderLight), borderRadius: T.radius4, cursor: vellumPage === "channels" && showVol && aC <= 1 ? "not-allowed" : "pointer", fontSize: T.fs11, fontFamily: T.fontMono, opacity: vellumPage === "channels" && showVol && aC <= 1 ? 0.5 : 1 } }, "Activaci\u00F3n"),
              React.createElement("div", { style: { width: 1, height: 22, background: T.borderLight } }),
              React.createElement("div", { style: { display: "flex", gap: 0, border: "1px solid " + T.borderLight, borderRadius: T.radius4, overflow: "hidden" } },
                [["bi", "Bi"], ["up", "\u2191"], ["down", "\u2193"]].map(function(p) {
                  return React.createElement("button", { key: p[0], onClick: function() { rerunStage2(undefined, p[0]); },
                    style: { padding: "5px 9px", background: flow === p[0] ? T.flow : T.bgCard, color: flow === p[0] ? T.bg : T.textDim, border: "none", cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono } }, p[1]);
                })
              ),
              React.createElement("div", { style: { width: 1, height: 22, background: T.borderLight } }),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5 } },
                React.createElement("span", { style: { fontSize: T.fs10, color: T.textDim } }, "N:"),
                React.createElement("input", { type: "range", min: 10, max: 50, value: topN, onChange: function(ev) { rerunTopN(+ev.target.value); }, style: { width: 60 } }),
                React.createElement("span", { style: { fontSize: T.fs10, color: "#aaa", width: 16 } }, topN)
              ),
              React.createElement("div", { style: { width: 1, height: 22, background: T.borderLight } }),
              React.createElement("div", { style: { display: "flex", gap: 0, border: "1px solid " + T.borderLight, borderRadius: T.radius4, overflow: "hidden" } },
                [10, 20, 30].map(function(g) {
                  return React.createElement("button", { key: g, onClick: function() { setGridSize(g); },
                    style: { padding: "5px 11px", background: gridSize === g ? T.grid : T.bgCard, color: gridSize === g ? T.bg : T.textDim, border: "none", cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono, fontWeight: gridSize === g ? "bold" : "normal" } }, g + "\u00B2");
                })
              ),
              isPatchwork && React.createElement("span", { style: { fontSize: T.fs10, color: T.emotion, marginLeft: 4 } }, "mosaico")
            )
          ),
          React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "stretch" } },
            React.createElement("div", { style: { flex: 1, minWidth: 0, overflow: "hidden" } },
              React.createElement("div", { style: { height: gridH } },
                selectedArr[0] && allVData[selectedArr[0]] && (
                  vellumPage === "channels"
                    ? React.createElement(VellumGrid, { bins: allVData[selectedArr[0]].bins, scale: scale, showSize: showSize, showColor: showColor, showVol: showVol, gridSize: gridSize, normMaxes: normMaxes, label: analyzedIds.length > 1 ? docs.find(function(d) { return d.id === selectedArr[0]; }).label : null, ngMode: ngMode, topNWords: perDocResults[selectedArr[0]].topWords, pinnedIdx: pinnedCells[selectedArr[0]] != null ? pinnedCells[selectedArr[0]] : null, onPin: pinFor(selectedArr[0]) })
                    : React.createElement(VellumEmoGrid, { bins: allVData[selectedArr[0]].bins, scale: scale, showVol: showVol, gridSize: gridSize, normMaxes: normMaxes, label: analyzedIds.length > 1 ? docs.find(function(d) { return d.id === selectedArr[0]; }).label : null, enabledSlots: enabledSlots, topNWords: perDocResults[selectedArr[0]].topWords, pinnedIdx: pinnedCells[selectedArr[0]] != null ? pinnedCells[selectedArr[0]] : null, onPin: pinFor(selectedArr[0]) })
                )
              )
            ),
            React.createElement("div", { style: { width: T.wordPanelW, flexShrink: 0, maxHeight: gridH, display: "flex", flexDirection: "column" } },
              React.createElement("div", { style: { fontSize: T.fs10, color: T.textMid, marginBottom: 3 } }, "Top " + topN + " \u00B7 clic para filtrar"),
              React.createElement(VellumWordPanel, { perDocData: perDocResults, selectedDocIds: selectedArr, filterWords: filterWords, setFilterWords: setFilterWords, sortBy: sortBy, setSortBy: setSortBy, topN: topN, ngMode: ngMode, setNgMode: setNgMode })
            )
          )
        ),
        tab === "vellum" && !selectedArr.length && React.createElement("div", { style: { color: T.textDim, textAlign: "center", marginTop: 80, fontSize: T.fs13 } }, "\u2190 A\u00F1adir documentos en Entrada, luego clic en Analizar."),

        // ── TEJIDO TAB ──
        tab === "weave" && selectedArr.length > 0 && React.createElement("div", { style: { maxWidth: T.maxWidth, margin: "0 auto" } },
          React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: T.gap12, alignItems: "center", flexWrap: "wrap" } },
            Object.keys(LAYER_CFG).map(function(lk) {
              var cfg = LAYER_CFG[lk]; var on = layers[lk];
              return React.createElement("button", {
                key: lk, onClick: function() { toggleLayer(lk); },
                style: { padding: "5px 10px", background: on ? cfg.color + "22" : T.bgCard,
                  color: on ? cfg.color : T.textDim,
                  border: "1px solid " + (on ? cfg.color + "44" : T.borderLight),
                  borderRadius: T.radius4, cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono }
              }, LAYER_LABELS[lk] || cfg.label);
            }),
            layers.emotion && React.createElement(EmoToggle, { enabledSlots: enabledEmos, setEnabledSlots: setEnabledEmos }),
            React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" } },
              React.createElement("div", { style: { display: "flex", gap: 0, border: "1px solid " + T.borderLight, borderRadius: T.radius4, overflow: "hidden" } },
                [["bi", "Bi"], ["up", "\u2191"], ["down", "\u2193"]].map(function(p) {
                  return React.createElement("button", { key: p[0], onClick: function() { rerunStage2(undefined, p[0]); },
                    style: { padding: "5px 9px", background: flow === p[0] ? T.flow : T.bgCard, color: flow === p[0] ? T.bg : T.textDim, border: "none", cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono } }, p[1]);
                })
              ),
              React.createElement("span", { style: { fontSize: T.fs10, color: T.textDim } }, "decaimiento:"),
              React.createElement("input", { type: "range", min: 30, max: 80, value: decay * 100,
                onChange: function(ev) { rerunStage2(+ev.target.value / 100, undefined); }, style: { width: 60 } }),
              React.createElement("span", { style: { fontSize: T.fs10, color: "#aaa" } }, decay.toFixed(2))
            )
          ),
          React.createElement("div", { style: { display: "flex", gap: 10 } },
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
              perDocResults[selectedArr[0]] && perDocResults[selectedArr[0]].weaveEnriched
                ? React.createElement(WeaveReader, {
                    weaveEnriched: perDocResults[selectedArr[0]].weaveEnriched,
                    layers: layers, freqMap: perDocResults[selectedArr[0]].freqMap,
                    maxFreq: perDocResults[selectedArr[0]].maxFreq,
                    relevanceMap: perDocResults[selectedArr[0]].relevanceMap,
                    maxRel: perDocResults[selectedArr[0]].maxRel,
                    commMap: perDocResults[selectedArr[0]].commMap,
                    enabledEmos: enabledEmos,
                    onWordClick: toggleWeaveSeed
                  })
                : React.createElement("div", { style: { height: T.contentH, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: T.radius6, border: "1px solid " + T.border, background: T.bgDeep } },
                    React.createElement("span", { style: { color: T.textDim, fontSize: T.fs12 } }, "Analizar documentos primero."))
            ),
            React.createElement("div", { style: { width: T.wordPanelW, flexShrink: 0, maxHeight: T.contentH, display: "flex", flexDirection: "column" } },
              React.createElement(WeaveWordPanel, {
                perDocData: perDocResults, selectedDocIds: selectedArr,
                weaveSeeds: weaveSeeds, toggleWeaveSeed: toggleWeaveSeed,
                weaveSeedInput: weaveSeedInput, setWeaveSeedInput: setWeaveSeedInput,
                setWeaveSeeds: setWeaveSeeds, weaveSortBy: weaveSortBy, setWeaveSortBy: setWeaveSortBy
              })
            )
          )
        ),
        tab === "weave" && !selectedArr.length && React.createElement("div", { style: { color: T.textDim, textAlign: "center", marginTop: 80, fontSize: T.fs13 } }, "\u2190 Analizar documentos primero."),

        // ── FIBRAS TAB ──
        tab === "fibras" && selectedArr.length > 0 && React.createElement("div", { style: { maxWidth: T.maxWidth, margin: "0 auto" } },
          // Toolbar
          React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: T.gap8, alignItems: "center" } },
            React.createElement("span", { style: { fontSize: T.fs10, color: T.textDim } },
              "Semillas: ", React.createElement("span", { style: { color: T.accent } }, weaveSeeds.size)),
            e.vec.isLoaded() && React.createElement("span", { style: { fontSize: T.fs10, color: T.positive } }, "\u25CF vec"),
            React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" } },
              React.createElement("div", { style: { display: "flex", gap: 0, border: "1px solid " + T.borderLight, borderRadius: T.radius4, overflow: "hidden" } },
                [10, 20, 30].map(function(g) {
                  return React.createElement("button", { key: g, onClick: function() { setGridSize(g); },
                    style: { padding: "5px 11px", background: gridSize === g ? T.grid : T.bgCard, color: gridSize === g ? T.bg : T.textDim, border: "none", cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono, fontWeight: gridSize === g ? "bold" : "normal" } }, g + " seg");
                })
              ),
              React.createElement("div", { style: { width: 1, height: 22, background: T.borderLight } }),
              React.createElement("span", { style: { fontSize: T.fs10, color: T.textDim } }, "decaimiento:"),
              React.createElement("input", { type: "range", min: 30, max: 80, value: decay * 100,
                onChange: function(ev) { rerunStage2(+ev.target.value / 100, undefined); }, style: { width: 60 } }),
              React.createElement("span", { style: { fontSize: T.fs10, color: "#aaa" } }, decay.toFixed(2)),
              React.createElement("div", { style: { width: 1, height: 22, background: T.borderLight } }),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5 } },
                React.createElement("span", { style: { fontSize: T.fs10, color: T.textDim } }, "N:"),
                React.createElement("input", { type: "range", min: 10, max: 50, value: topN, onChange: function(ev) { rerunTopN(+ev.target.value); }, style: { width: 60 } }),
                React.createElement("span", { style: { fontSize: T.fs10, color: "#aaa", width: 16 } }, topN)
              )
            )
          ),
          // FibrasMultiDoc
          React.createElement("div", { style: { display: "flex", gap: 10 } },
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
              React.createElement(FibrasMultiDoc, {
                selectedArr: selectedArr,
                fibrasDataMap: fibrasDataMap,
                seedArr: new Set(Array.from(weaveSeeds)),
                enabledEmos: enabledEmos,
                docs: docs,
                compareMode: selectedArr.length > 1 ? "stack" : "single",
                sortMode: sortBy,
                colorMode: "comunidad",
                lockedWords: lockedWords,
                toggleLocked: toggleLocked,
                clearLocked: clearLocked,
                commMapByDoc: commMapByDoc,
                canvasW: 800, canvasH: 500,
                eng: eng.current
              })
            ),
            React.createElement("div", { style: { width: T.wordPanelW, flexShrink: 0, maxHeight: T.contentH, display: "flex", flexDirection: "column" } },
              React.createElement(WeaveWordPanel, {
                perDocData: perDocResults, selectedDocIds: selectedArr,
                weaveSeeds: weaveSeeds, toggleWeaveSeed: toggleWeaveSeed,
                weaveSeedInput: weaveSeedInput, setWeaveSeedInput: setWeaveSeedInput,
                setWeaveSeeds: setWeaveSeeds, weaveSortBy: weaveSortBy, setWeaveSortBy: setWeaveSortBy
              })
            )
          )
        ),
        tab === "fibras" && !selectedArr.length && React.createElement("div", { style: { color: T.textDim, textAlign: "center", marginTop: 80, fontSize: T.fs13 } }, "\u2190 Analizar documentos primero."),

        // ── SALIDA TAB ──
        tab === "output" && React.createElement("div", { style: { maxWidth: T.maxWidthNarrow, margin: "0 auto" } },
          React.createElement("h3", { style: { color: T.accent, fontSize: T.fs15, fontWeight: "normal", marginBottom: T.gap16 } }, "Exportar"),
          analyzedIds.length === 0
            ? React.createElement("p", { style: { color: T.textDim, fontSize: T.fs13 } }, "Analizar documentos primero.")
            : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: T.gap8 } },
                validDocs.filter(function(d) { return perDocResults[d.id]; }).map(function(d) {
                  var r = perDocResults[d.id];
                  return React.createElement("div", {
                    key: d.id,
                    style: { padding: T.pad12, background: T.bgCard, borderRadius: T.radius6, border: "1px solid " + T.border }
                  },
                    React.createElement("div", { style: { fontSize: T.fs12, color: T.text, marginBottom: T.gap8 } }, d.label),
                    React.createElement("div", { style: { display: "flex", gap: T.gap8, flexWrap: "wrap" } },
                      React.createElement("button", {
                        onClick: function() { dlFile(genTEI(d.label, r), d.label + ".xml", "application/xml"); },
                        style: { padding: "6px 14px", background: T.bgDeep, color: T.accent, border: "1px solid " + T.borderLight, borderRadius: T.radius4, cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono }
                      }, "TEI XML"),
                      React.createElement("button", {
                        onClick: function() { dlFile(genCSV(d.label, r), d.label + ".csv", "text/csv"); },
                        style: { padding: "6px 14px", background: T.bgDeep, color: T.flow, border: "1px solid " + T.borderLight, borderRadius: T.radius4, cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono }
                      }, "CSV"),
                      React.createElement("button", {
                        onClick: function() { dlFile(genReport(d.label, r), d.label + "-informe.md", "text/markdown"); },
                        style: { padding: "6px 14px", background: T.bgDeep, color: T.emotion, border: "1px solid " + T.borderLight, borderRadius: T.radius4, cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono }
                      }, "Informe (.md)")
                    )
                  );
                }),
                analyzedIds.length > 1 && React.createElement("div", {
                  style: { padding: T.pad12, background: T.bgCard, borderRadius: T.radius6, border: "1px solid " + T.accent + "44", marginTop: T.gap8 }
                },
                  React.createElement("div", { style: { fontSize: T.fs12, color: T.accent, marginBottom: T.gap8 } }, "Corpus completo (" + analyzedIds.length + " docs)"),
                  React.createElement("button", {
                    onClick: function() {
                      var corpusDocs = validDocs.filter(function(d) { return perDocResults[d.id]; });
                      dlFile(genCorpusTEI(corpusDocs, perDocResults), "texturas-corpus.xml", "application/xml");
                    },
                    style: { padding: "6px 14px", background: T.bgDeep, color: T.accent, border: "1px solid " + T.borderLight, borderRadius: T.radius4, cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono }
                  }, "TEI Corpus XML")
                ),
                React.createElement("div", {
                  style: { padding: T.pad12, background: T.bgCard, borderRadius: T.radius6, border: "1px solid " + T.border, marginTop: T.gap16 }
                },
                  React.createElement("div", { style: { fontSize: T.fs12, color: T.textMid, marginBottom: T.gap8 } }, "Importar TEI"),
                  React.createElement("label", {
                    style: { padding: "6px 14px", background: T.bgDeep, color: T.grid, border: "1px solid " + T.borderLight, borderRadius: T.radius4, cursor: "pointer", fontSize: T.fs11, fontFamily: T.fontMono, display: "inline-block" }
                  }, "Subir TEI XML",
                    React.createElement("input", {
                      type: "file", accept: ".xml,.tei", style: { display: "none" },
                      onChange: function(ev) {
                        var file = ev.target.files[0];
                        if (!file) return;
                        var reader = new FileReader();
                        reader.onload = function(e) {
                          var parsed = parseTEIImport(e.target.result);
                          if (parsed.error) { setMsg(parsed.error); return; }
                          if (parsed.docs && parsed.docs.length > 0) {
                            var newDocs = parsed.docs.map(function(d, i) {
                              return { id: "d" + Date.now() + "_" + i, label: d.label, text: d.text };
                            });
                            setDocs(function(prev) { return prev.filter(function(d) { return d.text.trim(); }).concat(newDocs); });
                            setActiveInputDoc(newDocs[0].id);
                            setTab("input");
                            setMsg("Importados " + newDocs.length + " documento" + (newDocs.length > 1 ? "s" : ""));
                          }
                        };
                        reader.readAsText(file);
                      }
                    })
                  )
                )
              )
        ),

        // ── ACERCA TAB ──
        tab === "about" && React.createElement("div", { style: { maxWidth: T.maxWidthNarrow, margin: "0 auto", marginTop: 20 } },
          React.createElement("h2", { style: { color: T.accent, fontWeight: "normal", fontSize: T.fs18, marginBottom: T.gap16 } }, "\u2B21 Texturas v1.0"),
          React.createElement("p", { style: { color: T.textMid, lineHeight: 1.6, marginBottom: T.gap12 } },
            "An\u00E1lisis textual multicapa correlacionado para textos en espa\u00F1ol."),
          React.createElement("p", { style: { color: T.textMid, lineHeight: 1.6, marginBottom: T.gap12 } },
            "Creado por Ernesto Pe\u00F1a, Northeastern University."),
          React.createElement("p", { style: { color: T.textDim, lineHeight: 1.6, fontSize: T.fs11 } },
            "Pipeline NLP para espa\u00F1ol: NRC VAD (polaridad), NRC EmoLex (emoci\u00F3n), SentiWordNet v\u00EDa OMW (synsets), lematizador spaCy. Contenido completo de Acerca pr\u00F3ximamente en Fase 4.")
        )
      )
    )
  );
}

// ── Mount ──
ReactDOM.render(React.createElement(Texturas), document.getElementById("root"));
