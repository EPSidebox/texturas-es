// ─────────────────────────────────────────────
// panels.js — Texturas (ES) v2.0
// Unified word panel + emotion toggle
// Reads: T, EC from config.js
// Reads: React hook aliases from config.js
// Exports: EmoToggle4, WordPanel
// ─────────────────────────────────────────────

// ── EmoToggle4 — 4 inline emotion buttons ──
// Props: {enabledEmos, setEnabledEmos}
// enabledEmos: Set of enabled emotion keys
// setEnabledEmos: setter function
var _emoToggle4Items = [
  { key: "joy",     label: "Felicidad", color: "#82e0aa" },
  { key: "fear",    label: "Miedo",     color: "#85c1e9" },
  { key: "sadness", label: "Tristeza",  color: "#45b7d1" },
  { key: "anger",   label: "Ira",       color: "#ff6b6b" }
];

function EmoToggle4(props) {
  var enabledEmos = props.enabledEmos;
  var setEnabledEmos = props.setEnabledEmos;

  function toggle(key) {
    var next = new Set(enabledEmos);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEnabledEmos(next);
  }

  return React.createElement("div", {
    style: { display: "flex", gap: T.gap6, flexWrap: "wrap" }
  }, _emoToggle4Items.map(function(item) {
    var on = enabledEmos.has(item.key);
    return React.createElement("button", {
      key: item.key,
      onClick: function() { toggle(item.key); },
      style: {
        background: on ? item.color + "33" : "transparent",
        border: "1px solid " + (on ? item.color : T.borderLight),
        color: on ? item.color : T.textDim,
        borderRadius: T.radius3,
        padding: "2px 8px",
        fontSize: T.fs10,
        fontFamily: T.fontMono,
        cursor: "pointer",
        transition: "all 0.15s"
      }
    }, item.label);
  }));
}

// ── WordPanel — Unified word list + seed management ──
// Props: {
//   words,          — array of {word, freq, rel} to display (synced with Fibras)
//   seeds,          — Set of active seed words
//   toggleSeed,     — function(word)
//   seedInput,      — controlled input value
//   setSeedInput,   — setter
//   setSeeds,       — setter for full seed Set
//   sortBy,         — "freq" | "relevance" | "alpha"
//   setSortBy,      — setter
//   ngMode,         — 1 | 2 | 3 (unigrams, bigrams, trigrams)
//   setNgMode,      — setter
//   freqMap,        — full frequency map (for seed input validation)
//   maxFreq,        — for bar normalization
//   maxRel,         — for bar normalization
// }
function WordPanel(props) {
  var words = props.words || [];
  var seeds = props.seeds;
  var toggleSeed = props.toggleSeed;
  var seedInput = props.seedInput;
  var setSeedInput = props.setSeedInput;
  var setSeeds = props.setSeeds;
  var sortBy = props.sortBy;
  var setSortBy = props.setSortBy;
  var ngMode = props.ngMode || 1;
  var setNgMode = props.setNgMode;
  var freqMap = props.freqMap || {};
  var maxFreq = props.maxFreq || 1;
  var maxRel = props.maxRel || 1;

  // Manual seeds tracking (typed in, not clicked)
  var _ms = useState(new Set());
  var manualSeeds = _ms[0], setManualSeeds = _ms[1];

  // Not-found feedback
  var _nf = useState(false);
  var notFound = _nf[0], setNotFound = _nf[1];
  var _nfTimer = useRef(null);

  // Sort the display list independently from Fibras ordering
  var sorted = useMemo(function() {
    var arr = words.slice();
    if (sortBy === "alpha") {
      arr.sort(function(a, b) { return a.word.localeCompare(b.word); });
    } else if (sortBy === "relevance") {
      arr.sort(function(a, b) {
        if (b.rel !== a.rel) return b.rel - a.rel;
        if (b.freq !== a.freq) return b.freq - a.freq;
        return a.word.localeCompare(b.word);
      });
    } else {
      // freq (default)
      arr.sort(function(a, b) {
        if (b.freq !== a.freq) return b.freq - a.freq;
        if (b.rel !== a.rel) return b.rel - a.rel;
        return a.word.localeCompare(b.word);
      });
    }
    return arr;
  }, [words, sortBy]);

  function handleKeyDown(ev) {
    if (ev.key !== "Enter") return;
    var val = seedInput.trim().toLowerCase();
    if (!val) return;
    if (freqMap[val]) {
      // Add as manual seed
      var nextManual = new Set(manualSeeds);
      nextManual.add(val);
      setManualSeeds(nextManual);
      if (!seeds.has(val)) toggleSeed(val);
      setSeedInput("");
      setNotFound(false);
    } else {
      // Not found — show red feedback for 3s
      setNotFound(true);
      if (_nfTimer.current) clearTimeout(_nfTimer.current);
      _nfTimer.current = setTimeout(function() { setNotFound(false); }, 3000);
    }
  }

  var seedCount = seeds ? seeds.size : 0;

  // ── Render ──
  return React.createElement("div", {
    style: {
      width: T.wordPanelW,
      minWidth: T.wordPanelW,
      display: "flex",
      flexDirection: "column",
      gap: T.gap6,
      fontFamily: T.fontMono,
      fontSize: T.fs10
    }
  },
    // Seed input
    React.createElement("div", { style: { position: "relative" } },
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
          outline: "none"
        }
      }),
      notFound && React.createElement("div", {
        style: {
          color: T.negative,
          fontSize: 9,
          marginTop: 2
        }
      }, "No encontrado")
    ),

    // Clear all + sort toggles
    React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
    },
      // Clear button
      seedCount > 0 && React.createElement("button", {
        onClick: function() { setSeeds(new Set()); setManualSeeds(new Set()); },
        style: {
          background: "transparent",
          border: "1px solid " + T.borderLight,
          color: T.textMid,
          borderRadius: T.radius3,
          padding: "1px 5px",
          fontSize: 9,
          fontFamily: T.fontMono,
          cursor: "pointer"
        }
      }, "Limpiar (" + seedCount + ")"),

      // Sort toggles
      React.createElement("div", { style: { display: "flex", gap: 2 } },
        ["freq", "relevance", "alpha"].map(function(mode) {
          var label = mode === "freq" ? "Frec" : mode === "relevance" ? "Rel" : "A-Z";
          var active = sortBy === mode;
          return React.createElement("button", {
            key: mode,
            onClick: function() { setSortBy(mode); },
            style: {
              background: active ? T.accent + "22" : "transparent",
              border: "1px solid " + (active ? T.accent : T.border),
              color: active ? T.accent : T.textDim,
              borderRadius: T.radius3,
              padding: "1px 4px",
              fontSize: 9,
              fontFamily: T.fontMono,
              cursor: "pointer"
            }
          }, label);
        })
      )
    ),

    // N-gram toggle
    setNgMode && React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
    },
      React.createElement("span", { style: { fontSize: 9, color: T.textDim } }, "N-grama:"),
      React.createElement("div", { style: { display: "flex", gap: 2 } },
        [1, 2, 3].map(function(n) {
          var active = ngMode === n;
          return React.createElement("button", {
            key: n,
            onClick: function() { setNgMode(n); },
            style: {
              background: active ? T.accent + "22" : "transparent",
              border: "1px solid " + (active ? T.accent : T.border),
              color: active ? T.accent : T.textDim,
              borderRadius: T.radius3,
              padding: "1px 6px",
              fontSize: 9,
              fontFamily: T.fontMono,
              cursor: "pointer"
            }
          }, String(n));
        })
      )
    ),

    // Word list
    React.createElement("div", {
      style: {
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 1
      }
    },
      sorted.map(function(item) {
        var w = item.word;
        var isSeed = seeds.has(w);
        var isManual = manualSeeds.has(w);

        // Highlight active sort metric
        var freqColor = sortBy === "freq" ? T.accent : T.textDim;
        var relColor = sortBy === "relevance" ? T.flow : T.textDim;

        return React.createElement("div", {
          key: w,
          onClick: function() { toggleSeed(w); },
          style: {
            display: "flex",
            alignItems: "center",
            gap: 3,
            padding: "2px 4px",
            borderRadius: T.radius3,
            cursor: "pointer",
            background: isSeed ? T.accent + "18" : "transparent",
            borderLeft: isSeed ? "2px solid " + T.accent : "2px solid transparent"
          }
        },
          // Manual seed marker
          isManual && React.createElement("span", {
            style: { color: "#f0b27a", fontSize: 9, marginRight: 1 }
          }, "\u2605"),

          // Word
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

          // Freq | Rel display
          React.createElement("span", {
            style: { fontSize: 9, color: freqColor, minWidth: 18, textAlign: "right" }
          }, item.freq),
          React.createElement("span", {
            style: { fontSize: 9, color: T.textFaint }
          }, "|"),
          React.createElement("span", {
            style: { fontSize: 9, color: relColor, minWidth: 22, textAlign: "right" }
          }, (item.rel || 1).toFixed(1))
        );
      })
    )
  );
}
