// ─────────────────────────────────────────────
// app.js — Texturas (ES) v3.0
// State management + layout
// Reads: all modules
// Exports: Texturas (main component, rendered to #root)
// ─────────────────────────────────────────────

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
    if (body.length > 0) docs.push({ label: markers[i].label, text: body });
  }
  return docs.length > 0 ? docs : null;
}

// ── Small number input ──
function NumInput(props) {
  var val = props.value, set = props.onChange;
  var mn = props.min, mx = props.max, step = props.step, w = props.width;
  return React.createElement("input", {
    type: "number",
    value: val,
    min: mn, max: mx, step: step || 1,
    onChange: function(ev) {
      var v = parseFloat(ev.target.value);
      if (!isNaN(v)) set(Math.max(mn, Math.min(mx, v)));
    },
    style: {
      width: w || 44,
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

// ── Toolbar button ──
function TBtn(props) {
  var active = props.active, onClick = props.onClick, label = props.label;
  var color = props.color || T.accent;
  return React.createElement("button", {
    onClick: onClick,
    style: {
      background: active ? color + "22" : "transparent",
      border: "1px solid " + (active ? color : T.border),
      color: active ? color : T.textDim,
      borderRadius: T.radius3,
      padding: "2px 7px",
      fontSize: 9,
      fontFamily: T.fontMono,
      cursor: "pointer"
    }
  }, label);
}

// ── Tejido Drawer ──
function TejidoDrawer(props) {
  var open = props.open;
  var onClose = props.onClose;
  var weaveEnriched = props.weaveEnriched;
  var layers = props.layers;
  var freqMap = props.freqMap;
  var maxFreq = props.maxFreq;
  var relevanceMap = props.relevanceMap;
  var maxRel = props.maxRel;
  var commMap = props.commMap;
  var enabledEmos = props.enabledEmos;
  var onWordClick = props.onWordClick;

  return React.createElement("div", {
    style: {
      position: "fixed",
      top: 0, right: 0,
      width: open ? 540 : 0,
      height: "100vh",
      background: T.bgCard,
      borderLeft: open ? "1px solid " + T.borderLight : "none",
      zIndex: 200,
      overflow: "hidden",
      transition: "width 0.25s ease",
      display: "flex",
      flexDirection: "column"
    }
  },
    open && React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid " + T.border,
        flexShrink: 0
      }
    },
      React.createElement("span", {
        style: { fontSize: T.fs12, color: T.accent, fontFamily: T.fontMono }
      }, "Tejido"),
      React.createElement("button", {
        onClick: onClose,
        style: {
          background: "transparent", border: "none",
          color: T.textDim, cursor: "pointer",
          fontSize: T.fs15, fontFamily: T.fontMono,
          lineHeight: 1, padding: "0 2px"
        }
      }, "\u00D7")
    ),
    open && React.createElement("div", {
      style: { display: "flex", flex: 1, overflow: "hidden" }
    },
      // WeaveReader
      React.createElement("div", {
        style: { flex: 1, overflowY: "auto", padding: T.pad12 }
      },
        weaveEnriched
          ? React.createElement(WeaveReader, {
              weaveEnriched: weaveEnriched,
              layers: layers,
              freqMap: freqMap || {},
              maxFreq: maxFreq || 1,
              relevanceMap: relevanceMap || {},
              maxRel: maxRel || 1,
              commMap: commMap || {},
              enabledEmos: enabledEmos,
              onWordClick: onWordClick
            })
          : React.createElement("div", {
              style: { color: T.textDim, fontFamily: T.fontMono, fontSize: T.fs12 }
            }, "Analiza un documento para ver Tejido.")
      ),
      // Vertical minimap placeholder
      React.createElement("div", {
        style: {
          width: 40,
          flexShrink: 0,
          borderLeft: "1px solid " + T.border,
          background: T.bgDeep,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }
      },
        React.createElement("span", {
          style: {
            fontSize: 9, color: T.textFaint,
            fontFamily: T.fontMono,
            writingMode: "vertical-rl",
            textOrientation: "mixed"
          }
        }, "minimapa")
      )
    )
  );
}

// ── Aligned Word Panel ──
// Height is driven by canvasH (topN * rowH) so it aligns with the Sankey.
function AlignedWordPanel(props) {
  var words = props.words || [];
  var seeds = props.seeds;
  var toggleSeed = props.toggleSeed;
  var seedInput = props.seedInput;
  var setSeedInput = props.setSeedInput;
  var setSeeds = props.setSeeds;
  var ngMode = props.ngMode;
  var setNgMode = props.setNgMode;
  var enabledEmos = props.enabledEmos;
  var setEnabledEmos = props.setEnabledEmos;
  var freqMap = props.freqMap || {};
  var sortMode = props.sortMode;
  var rowH = props.rowH || 20;

  var _nf = useState(false);
  var notFound = _nf[0], setNotFound = _nf[1];
  var _nft = useRef(null);

  function handleKeyDown(ev) {
    if (ev.key !== "Enter") return;
    var val = seedInput.trim().toLowerCase();
    if (!val) return;
    if (freqMap[val]) {
      if (!seeds.has(val)) toggleSeed(val);
      setSeedInput("");
      setNotFound(false);
    } else {
      setNotFound(true);
      if (_nft.current) clearTimeout(_nft.current);
      _nft.current = setTimeout(function() { setNotFound(false); }, 3000);
    }
  }

  var EMO_ITEMS = [
    { key: "joy",     label: "Felicidad", color: "#82e0aa" },
    { key: "fear",    label: "Miedo",     color: "#85c1e9" },
    { key: "sadness", label: "Tristeza",  color: "#45b7d1" },
    { key: "anger",   label: "Ira",       color: "#ff6b6b" }
  ];

  function toggleEmo(key) {
    var next = new Set(enabledEmos);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEnabledEmos(next);
  }

  return React.createElement("div", {
    style: {
      width: T.wordPanelW,
      minWidth: T.wordPanelW,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontMono,
      fontSize: T.fs10,
      flexShrink: 0
    }
  },
    // Seed input
    React.createElement("div", { style: { marginBottom: T.gap4 } },
      React.createElement("input", {
        type: "text",
        value: seedInput,
        onChange: function(ev) { setSeedInput(ev.target.value); },
        onKeyDown: handleKeyDown,
        placeholder: "Agregar semilla...",
        style: {
          width: "100%",
          background: T.bgCard,
          border: "1px solid " + (notFound ? T.negative : T.border),
          borderRadius: T.radius3,
          color: T.text,
          padding: T.pad4,
          fontSize: T.fs10,
          fontFamily: T.fontMono,
          outline: "none",
          boxSizing: "border-box"
        }
      }),
      notFound && React.createElement("div", {
        style: { color: T.negative, fontSize: 9, marginTop: 2 }
      }, "No encontrado")
    ),

    // Word list — fixed rows aligned to Sankey
    React.createElement("div", {
      style: { flex: 1 }
    },
      words.map(function(item, idx) {
        var w = item.word;
        var isSeed = seeds.has(w);
        var freqColor = sortMode === "freq" ? T.accent : T.textDim;
        var relColor = sortMode === "relevance" ? T.flow : T.textDim;
        return React.createElement("div", {
          key: w,
          onClick: function() { toggleSeed(w); },
          style: {
            height: rowH,
            display: "flex",
            alignItems: "center",
            gap: 3,
            padding: "0 4px",
            cursor: "pointer",
            background: isSeed ? T.accent + "18" : "transparent",
            borderLeft: "2px solid " + (isSeed ? T.accent : "transparent"),
            boxSizing: "border-box"
          }
        },
          React.createElement("span", {
            style: {
              flex: 1,
              color: isSeed ? T.accent : T.text,
              fontSize: T.fs10,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }
          }, w),
          React.createElement("span", {
            style: { fontSize: 9, color: freqColor, minWidth: 18, textAlign: "right" }
          }, item.freq),
          React.createElement("span", { style: { fontSize: 9, color: T.textFaint } }, "|"),
          React.createElement("span", {
            style: { fontSize: 9, color: relColor, minWidth: 22, textAlign: "right" }
          }, (item.rel || 1).toFixed(1))
        );
      })
    ),

    // Emotion toggles
    React.createElement("div", {
      style: {
        display: "flex", flexWrap: "wrap", gap: 2,
        marginTop: T.gap6, paddingTop: T.gap6,
        borderTop: "1px solid " + T.border
      }
    },
      EMO_ITEMS.map(function(item) {
        var on = enabledEmos.has(item.key);
        return React.createElement("button", {
          key: item.key,
          onClick: function() { toggleEmo(item.key); },
          style: {
            background: on ? item.color + "33" : "transparent",
            border: "1px solid " + (on ? item.color : T.borderLight),
            color: on ? item.color : T.textDim,
            borderRadius: T.radius3,
            padding: "2px 5px",
            fontSize: 9,
            fontFamily: T.fontMono,
            cursor: "pointer",
            flex: "1 0 45%"
          }
        }, item.label);
      })
    ),

    // N-gram toggle
    React.createElement("div", {
      style: {
        display: "flex", gap: 2, marginTop: T.gap4
      }
    },
      [1, 2, 3].map(function(n) {
        var active = ngMode === n;
        return React.createElement("button", {
          key: n,
          onClick: function() { setNgMode(n); },
          style: {
            flex: 1,
            background: active ? T.accent + "22" : "transparent",
            border: "1px solid " + (active ? T.accent : T.border),
            color: active ? T.accent : T.textDim,
            borderRadius: T.radius3,
            padding: "2px 0",
            fontSize: 9,
            fontFamily: T.fontMono,
            cursor: "pointer"
          }
        }, String(n));
      })
    )
  );
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

  // ── Tejido drawer ──
  var _tj = useState(false);
  var tejidoOpen = _tj[0], setTejidoOpen = _tj[1];

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

  // ── UI ──
  var _ld = useState(false);
  var loading = _ld[0], setLoading = _ld[1];
  var _msg = useState("");
  var msg = _msg[0], setMsg = _msg[1];

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

  // ── Sort / mode ──
  var _sb = useState("freq");
  var sortBy = _sb[0], setSortBy = _sb[1];
  var _pers = useState(false);
  var persistentes = _pers[0], setPersistentes = _pers[1];

  // ── N-gram ──
  var _ng = useState(1);
  var ngMode = _ng[0], setNgMode = _ng[1];

  // ── Locked words ──
  var _lw = useState(new Set());
  var lockedWords = _lw[0], setLockedWords = _lw[1];

  // ── Layers (Tejido) ──
  var _lay = useState({ polarity: true, emotion: true, arousal: false, frequency: true, community: false });
  var layers = _lay[0], setLayers = _lay[1];
  var _ee = useState(new Set(["joy", "fear", "sadness", "anger"]));
  var enabledEmos = _ee[0], setEnabledEmos = _ee[1];

  // ── Fibras params ──
  var _fs = useState(10);
  var fibrasSegs = _fs[0], setFibrasSegs = _fs[1];
  var _cm = useState("comunidad");
  var colorMode = _cm[0], setColorMode = _cm[1];

  // ── Custom segments ──
  var _csb = useState({});
  var customSegsByDoc = _csb[0], setCustomSegsByDoc = _csb[1];

  // ── Row height for aligned scroll ──
  var ROW_H = 20;
  var VISIBLE_ROWS = 25;

  // ── Load NLP engines ──
  useEffect(function() {
    if (engSt !== "idle") return;
    setEngSt("loading");
    setMsg("Cargando recursos NLP...");
    var statusCb = function(s) { setMsg(s); };
    Promise.all([
      loadAsset("pos-es",      "wordnet/pos-lookup-es.json",    false, statusCb),
      loadAsset("lem-es",      "wordnet/lemmatizer-es.json",    false, statusCb),
      loadAsset("syn-es",      "wordnet/synsets-es.json",       false, statusCb),
      loadAsset("emolex-es",   "lexicons/nrc-emolex-es.json",   false, statusCb),
      loadAsset("intensity-es","lexicons/nrc-intensity-es.json",false, statusCb),
      loadAsset("vad-es",      "lexicons/nrc-vad-es.json",      false, statusCb),
      loadAsset("swn-es",      "lexicons/sentiwordnet-es.json", false, statusCb),
      loadAsset("vocab-es",    "vectors/vocab.json",            false, statusCb),
      loadAsset("vec-0",       "vectors/vectors-0.bin",         true,  statusCb),
      loadAsset("vec-1",       "vectors/vectors-1.bin",         true,  statusCb)
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
      var newS1 = {}, newResults = {}, newCsb = {};
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        if (!d.text || d.text.trim().length === 0) continue;
        var cleanText = d.text.replace(/---SEG:.+?---/g, "\n\n");
        var s1 = analyzeStage1(cleanText, eng, topN);
        newS1[d.id] = s1;
        newResults[d.id] = analyzeStage2(s1, eng, topN, wnDepth, decay, flow);
        var segProto = detectSegProtocol(d.text);
        if (segProto) {
          newCsb[d.id] = buildCustomSegBoundaries(d.text, segProto, newResults[d.id].enriched, eng);
        }
      }
      setStage1Cache(newS1);
      setPerDocResults(newResults);
      setCustomSegsByDoc(newCsb);
      setLoading(false);
      setMsg("An\u00E1lisis completo.");
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
    var newS1 = {}, newResults = {};
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
    setDocs(docs.map(function(d) {
      return d.id === id ? { id: d.id, label: d.label, text: text } : d;
    }));
  }

  function updateDocLabel(id, label) {
    setDocs(docs.map(function(d) {
      return d.id === id ? { id: d.id, label: label, text: d.text } : d;
    }));
  }

  function doSplit() {
    var activeDoc = null;
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].id === activeInputDoc) { activeDoc = docs[i]; break; }
    }
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

  function clearLocked() { setLockedWords(new Set()); }

  // ── Fibras mode string ──
  var fibrasMode = persistentes ? "persistentes" : (seeds.size > 0 ? "semillas" : "recurrentes");

  // ── Fibras data (memoized) ──
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
        csb, ngMode
      );
    }
    return map;
  }, [selectedViewDocs, perDocResults, seeds, fibrasSegs, fibrasMode, topN, decay, sortBy, customSegsByDoc, ngMode]);

  // ── Word list for aligned panel ──
  var fibrasWords = useMemo(function() {
    var id = selectedViewDocs[0];
    var fd = fibrasDataMap[id];
    if (!fd) return [];
    return fd.nodeWords.map(function(w) {
      return { word: w, freq: fd.freqMap[w] || 0, rel: fd.relevanceMap[w] || 1 };
    });
  }, [fibrasDataMap, selectedViewDocs]);

  // ── CommMap by doc ──
  var commMapByDoc = useMemo(function() {
    var map = {};
    for (var i = 0; i < selectedViewDocs.length; i++) {
      var id = selectedViewDocs[i];
      var res = perDocResults[id];
      if (!res) continue;
      if (colorMode === "valencia") {
        var polMap = {}, polSums = {}, polCounts = {};
        for (var ti = 0; ti < res.enriched.length; ti++) {
          var tok = res.enriched[ti];
          if (tok.stop || tok.polarity === null) continue;
          if (!polSums[tok.lemma]) { polSums[tok.lemma] = 0; polCounts[tok.lemma] = 0; }
          polSums[tok.lemma] += tok.polarity;
          polCounts[tok.lemma] += 1;
        }
        for (var w in polSums) {
          if (polSums.hasOwnProperty(w)) polMap[w] = polSums[w] / polCounts[w];
        }
        map[id] = polMap;
      } else {
        map[id] = res.commMap || {};
      }
    }
    return map;
  }, [selectedViewDocs, perDocResults, colorMode]);

  // ── Canvas geometry ──
  var canvasH = Math.max(topN, VISIBLE_ROWS) * ROW_H;
  var scrollH = Math.min(VISIBLE_ROWS * ROW_H, canvasH);
  // canvasW: full width minus word panel and outer padding
  var canvasW = T.maxWidth - T.wordPanelW - T.gap12 * 2 - 32;

  // ── Active doc ──
  var activeDoc = null;
  for (var adi = 0; adi < docs.length; adi++) {
    if (docs[adi].id === activeInputDoc) { activeDoc = docs[adi]; break; }
  }

  // ── Active view doc result (for Tejido drawer) ──
  var viewRes = perDocResults[selectedViewDocs[0]] || null;

  // ── Tab button style ──
  function tabStyle(t) {
    var active = tab === t;
    return {
      background: active ? T.accent + "22" : "transparent",
      border: "1px solid " + (active ? T.accent : T.border),
      color: active ? T.accent : T.textMid,
      borderRadius: T.radius4,
      padding: "5px 14px",
      fontSize: T.fs12,
      fontFamily: T.fontMono,
      cursor: "pointer"
    };
  }

  // ── Tejido tab style (drawer toggle) ──
  function tejidoTabStyle() {
    return {
      background: tejidoOpen ? T.flow + "22" : "transparent",
      border: "1px solid " + (tejidoOpen ? T.flow : T.border),
      color: tejidoOpen ? T.flow : T.textMid,
      borderRadius: T.radius4,
      padding: "5px 14px",
      fontSize: T.fs12,
      fontFamily: T.fontMono,
      cursor: "pointer"
    };
  }

  // ── Custom seg display ──
  var activeViewId = selectedViewDocs[0];
  var hasCustom = customSegsByDoc[activeViewId] && customSegsByDoc[activeViewId].length > 0;
  var customCount = hasCustom ? customSegsByDoc[activeViewId].length : 0;

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

    // ── Tejido Drawer (fixed overlay) ──
    React.createElement(TejidoDrawer, {
      open: tejidoOpen,
      onClose: function() { setTejidoOpen(false); },
      weaveEnriched: viewRes ? viewRes.weaveEnriched : null,
      layers: layers,
      freqMap: viewRes ? viewRes.freqMap : {},
      maxFreq: viewRes ? viewRes.maxFreq : 1,
      relevanceMap: viewRes ? viewRes.relevanceMap : {},
      maxRel: viewRes ? viewRes.maxRel : 1,
      commMap: viewRes ? viewRes.commMap : {},
      enabledEmos: enabledEmos,
      onWordClick: toggleSeed
    }),

    // ── Row 1: Tab bar ──
    React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: T.gap6
      }
    },
      // Left tabs
      React.createElement("div", { style: { display: "flex", gap: T.gap6 } },
        React.createElement("button", {
          onClick: function() { setTab("input"); },
          style: tabStyle("input")
        }, "Importar"),
        React.createElement("button", {
          onClick: function() { setTejidoOpen(!tejidoOpen); },
          style: tejidoTabStyle()
        }, "Tejido"),
        React.createElement("button", {
          onClick: function() { setTab("output"); },
          style: tabStyle("output")
        }, "Exportar")
      ),
      // Status + right tab
      React.createElement("div", { style: { display: "flex", gap: T.gap12, alignItems: "center" } },
        React.createElement("span", { style: { fontSize: T.fs10, color: T.textDim } }, msg),
        React.createElement("button", {
          onClick: function() { setTab("about"); },
          style: tabStyle("about")
        }, "Acerca")
      )
    ),

    // ── Row 2: Document tabs ──
    React.createElement("div", {
      style: {
        display: "flex", gap: T.gap4, marginBottom: T.gap6,
        flexWrap: "wrap", alignItems: "center"
      }
    },
      docs.map(function(d) {
        var active = d.id === activeInputDoc;
        var selected = selectedViewDocs.indexOf(d.id) >= 0;
        return React.createElement("div", {
          key: d.id,
          style: { display: "flex", alignItems: "center", gap: 2 }
        },
          React.createElement("button", {
            onClick: function() {
              setActiveInputDoc(d.id);
              setSelectedViewDocs([d.id]);
            },
            style: {
              background: selected ? T.accent + "22" : (active ? T.bgCard : "transparent"),
              border: "1px solid " + (selected ? T.accent : T.border),
              color: selected ? T.accent : T.textMid,
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
              background: "transparent", border: "none",
              color: T.textFaint, cursor: "pointer",
              fontSize: T.fs10, padding: "0 2px"
            }
          }, "\u00D7")
        );
      }),
      React.createElement("button", {
        onClick: addDoc,
        style: {
          background: "transparent",
          border: "1px dashed " + T.borderLight,
          color: T.textDim, borderRadius: T.radius3,
          padding: "3px 8px", fontSize: T.fs10,
          fontFamily: T.fontMono, cursor: "pointer"
        }
      }, "+ Doc")
    ),

    // ── Row 3: Controls ──
    React.createElement("div", {
      style: {
        display: "flex", gap: T.gap8, alignItems: "center",
        marginBottom: T.gap8, flexWrap: "wrap",
        padding: "6px 8px",
        background: T.bgCard,
        border: "1px solid " + T.border,
        borderRadius: T.radius4
      }
    },
      // Palabras
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
        React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Palabras:"),
        React.createElement(NumInput, { value: topN, onChange: rerunTopN, min: 5, max: 100, width: 40 })
      ),

      React.createElement("span", { style: { color: T.border, fontSize: T.fs12 } }, "|"),

      // Segmentos
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
        React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Seg:"),
        hasCustom
          ? React.createElement("span", {
              style: { fontSize: 9, color: T.accent, fontFamily: T.fontMono }
            }, customCount + " (custom)")
          : React.createElement(NumInput, { value: fibrasSegs, onChange: setFibrasSegs, min: 3, max: 50, width: 40 })
      ),

      React.createElement("span", { style: { color: T.border, fontSize: T.fs12 } }, "|"),

      // Sort: Frecuencia / Relevancia
      React.createElement("div", { style: { display: "flex", gap: 2 } },
        React.createElement(TBtn, {
          active: sortBy === "freq",
          onClick: function() { setSortBy("freq"); },
          label: "Frecuencia"
        }),
        React.createElement(TBtn, {
          active: sortBy === "relevance",
          onClick: function() { setSortBy("relevance"); },
          label: "Relevancia"
        })
      ),

      React.createElement("span", { style: { color: T.border, fontSize: T.fs12 } }, "|"),

      // Decaimiento
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
        React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Decaimiento:"),
        React.createElement("input", {
          type: "range", min: 0.1, max: 0.9, step: 0.1, value: decay,
          onChange: function(ev) { rerunStage2(parseFloat(ev.target.value)); },
          style: { width: 55 }
        }),
        React.createElement("span", { style: { fontSize: 9, color: T.textMid } }, decay.toFixed(1))
      ),

      React.createElement("span", { style: { color: T.border, fontSize: T.fs12 } }, "|"),

      // Mode: Recurrentes / Persistentes
      React.createElement("div", { style: { display: "flex", gap: 2 } },
        React.createElement(TBtn, {
          active: !persistentes,
          onClick: function() { setPersistentes(false); },
          label: "Recurrentes"
        }),
        React.createElement(TBtn, {
          active: persistentes,
          onClick: function() { setPersistentes(true); },
          label: "Persistentes"
        })
      ),

      React.createElement("span", { style: { color: T.border, fontSize: T.fs12 } }, "|"),

      // Flujo
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 2 } },
        React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Flujo:"),
        React.createElement(TBtn, {
          active: flow === "bi",
          onClick: function() { rerunStage2(undefined, "bi"); },
          label: "Ambivalente"
        }),
        React.createElement(TBtn, {
          active: flow === "up",
          onClick: function() { rerunStage2(undefined, "up"); },
          label: "Ascendente"
        }),
        React.createElement(TBtn, {
          active: flow === "down",
          onClick: function() { rerunStage2(undefined, "down"); },
          label: "Descendente"
        })
      ),

      React.createElement("span", { style: { color: T.border, fontSize: T.fs12 } }, "|"),

      // Color
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 2 } },
        React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "Color:"),
        React.createElement(TBtn, {
          active: colorMode === "rango",
          onClick: function() { setColorMode("rango"); },
          label: "Rango"
        }),
        React.createElement(TBtn, {
          active: colorMode === "valencia",
          onClick: function() { setColorMode("valencia"); },
          label: "Polaridad"
        }),
        React.createElement(TBtn, {
          active: colorMode === "comunidad",
          onClick: function() { setColorMode("comunidad"); },
          label: "Comunidad"
        })
      )
    ),

    // ════════════════════════════════════════
    // TAB CONTENT
    // ════════════════════════════════════════

    // ── IMPORTAR ──
    tab === "input" && React.createElement("div", null,
      // Label editor
      activeDoc && React.createElement("div", { style: { marginBottom: T.gap8 } },
        React.createElement("input", {
          type: "text",
          value: activeDoc.label,
          onChange: function(ev) { updateDocLabel(activeDoc.id, ev.target.value); },
          style: {
            background: T.bgCard, border: "1px solid " + T.border,
            borderRadius: T.radius3, color: T.text, padding: T.pad4,
            fontSize: T.fs12, fontFamily: T.fontMono, width: 300
          }
        })
      ),
      // Textarea
      activeDoc && React.createElement("textarea", {
        value: activeDoc.text,
        onChange: function(ev) { updateDocText(activeDoc.id, ev.target.value); },
        placeholder: "Pega o escribe tu texto en espa\u00F1ol aqu\u00ED...",
        style: {
          width: "100%", height: 320,
          background: T.bgDeep, border: "1px solid " + T.border,
          borderRadius: T.radius4, color: T.text, padding: T.pad12,
          fontSize: T.fs13, fontFamily: T.fontMono,
          resize: "vertical", lineHeight: 1.6, boxSizing: "border-box"
        }
      }),
      // Split + Analyze
      React.createElement("div", {
        style: { marginTop: T.gap8, display: "flex", gap: T.gap8, alignItems: "center" }
      },
        React.createElement("button", {
          onClick: doSplit,
          style: {
            background: "transparent", border: "1px solid " + T.borderLight,
            color: T.textMid, borderRadius: T.radius3,
            padding: "4px 10px", fontSize: T.fs10,
            fontFamily: T.fontMono, cursor: "pointer"
          }
        }, "Separar (---DOC:---)"),
        React.createElement("button", {
          onClick: runAnalysis,
          disabled: loading || engSt !== "ready",
          style: {
            background: T.accent, border: "none", color: T.bg,
            borderRadius: T.radius4, padding: "7px 22px",
            fontSize: T.fs13, fontFamily: T.fontMono, fontWeight: 500,
            cursor: loading ? "wait" : "pointer",
            opacity: loading || engSt !== "ready" ? 0.5 : 1
          }
        }, loading ? "Analizando..." : "Analizar")
      )
    ),

    // ── FIBRAS (permanent main view, shown when not on another tab) ──
    tab !== "input" && tab !== "output" && tab !== "about" &&
    React.createElement("div", null,
      // Minimap + emotion bars + segment labels (non-scrolling, handled by FibrasDocStack)
      // Scrollable word panel + canvas
      React.createElement("div", {
        style: {
          height: scrollH,
          overflowY: topN > VISIBLE_ROWS ? "auto" : "visible",
          overflowX: "hidden"
        }
      },
        React.createElement("div", {
          style: { display: "flex", gap: T.gap12 }
        },
          // Aligned word panel
          React.createElement(AlignedWordPanel, {
            words: fibrasWords,
            seeds: seeds,
            toggleSeed: toggleSeed,
            seedInput: seedInput,
            setSeedInput: setSeedInput,
            setSeeds: setSeeds,
            ngMode: ngMode,
            setNgMode: setNgMode,
            enabledEmos: enabledEmos,
            setEnabledEmos: setEnabledEmos,
            freqMap: viewRes ? viewRes.freqMap : {},
            sortMode: sortBy,
            rowH: ROW_H
          }),

          // Fibras visualization
          React.createElement("div", { style: { flex: 1 } },
            React.createElement(FibrasMultiDoc, {
              selectedArr: selectedViewDocs,
              fibrasDataMap: fibrasDataMap,
              seedArr: seeds,
              enabledEmos: enabledEmos,
              docs: docs,
              compareMode: "stack",
              sortMode: sortBy === "relevance" ? "relevance" : "freq",
              colorMode: colorMode,
              lockedWords: lockedWords,
              toggleLocked: toggleLocked,
              clearLocked: clearLocked,
              commMapByDoc: commMapByDoc,
              canvasW: canvasW,
              canvasH: canvasH,
              eng: eng
            })
          )
        )
      )
    ),

    // ── EXPORTAR ──
    tab === "output" && React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: T.gap12 } },
        docs.map(function(d) {
          var res = perDocResults[d.id];
          if (!res) return null;
          return React.createElement("div", {
            key: d.id,
            style: {
              padding: T.pad12, background: T.bgCard,
              border: "1px solid " + T.border, borderRadius: T.radius4
            }
          },
            React.createElement("div", {
              style: { fontSize: T.fs12, color: T.accent, marginBottom: T.gap8 }
            }, d.label),
            React.createElement("div", { style: { display: "flex", gap: T.gap8, flexWrap: "wrap" } },
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
        Object.keys(perDocResults).length > 1 && React.createElement("button", {
          onClick: function() { dlFile(genCorpusTEI(docs, perDocResults), "texturas-corpus.xml", "application/xml"); },
          style: {
            background: "transparent", border: "1px solid " + T.borderLight,
            color: T.textMid, borderRadius: T.radius3, padding: "4px 10px",
            fontSize: T.fs10, fontFamily: T.fontMono, cursor: "pointer", alignSelf: "flex-start"
          }
        }, "Corpus TEI (todos)"),
        React.createElement("div", { style: { marginTop: T.gap16 } },
          React.createElement("div", {
            style: { fontSize: T.fs10, color: T.textDim, marginBottom: T.gap4 }
          }, "Importar TEI:"),
          React.createElement("input", {
            type: "file", accept: ".xml",
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
            style: { fontSize: T.fs10, fontFamily: T.fontMono, color: T.textMid }
          })
        )
      )
    ),

    // ── ACERCA ──
    tab === "about" && React.createElement("div", {
      style: {
        maxWidth: T.maxWidthNarrow, padding: T.pad16,
        color: T.textMid, fontSize: T.fs12, lineHeight: 1.8
      }
    },
      React.createElement("h2", {
        style: { color: T.accent, fontSize: T.fs15, marginBottom: T.gap12 }
      }, "Texturas v3.0"),
      React.createElement("p", null,
        "Herramienta de an\u00E1lisis textual multicapa para textos en espa\u00F1ol. ",
        "Combina frecuencia, relevancia sem\u00E1ntica (WordNet), polaridad (NRC VAD), ",
        "emociones (NRC EmoLex), activaci\u00F3n y comunidades l\u00E9xicas (Louvain)."
      ),
      React.createElement("p", null, "Desarrollado por Ernesto Pe\u00F1a. Northeastern University."),
      React.createElement("p", { style: { fontSize: T.fs10, color: T.textDim } },
        "Sin modelos neuronales. Sin transformers. Cada m\u00E9trica es determinista, auditable y reproducible."
      )
    )
  );
}

// ── Mount ──
ReactDOM.render(
  React.createElement(Texturas),
  document.getElementById("root")
);
