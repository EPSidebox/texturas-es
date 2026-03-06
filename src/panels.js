// ─────────────────────────────────────────────
// panels.js — Texturas (ES) v3.0
// Unified word panel: seed input, word list,
// emotion toggles, n-gram selector
// Reads: T, EC from config.js
// Reads: React hook aliases from config.js
// Exports: WordPanel
// ─────────────────────────────────────────────

var _EMO_PANEL = [
  { key: "joy",     label: "Felicidad", color: "#82e0aa" },
  { key: "fear",    label: "Miedo",     color: "#85c1e9" },
  { key: "sadness", label: "Tristeza",  color: "#45b7d1" },
  { key: "anger",   label: "Ira",       color: "#ff6b6b" }
];

// ── WordPanel ──
// Props: {
//   words,          — [{word, freq, rel}] in Sankey rank order
//   seeds,          — Set of active seed words
//   toggleSeed,     — function(word)
//   seedInput,      — controlled input value
//   setSeedInput,   — setter
//   setSeeds,       — setter for full seed Set
//   sortBy,         — "freq" | "relevance"
//   enabledEmos,    — Set of enabled emotion keys
//   setEnabledEmos, — setter
//   ngMode,         — 1 | 2 | 3
//   setNgMode,      — setter
//   freqMap,        — full frequency map (for seed input validation)
//   rowH,           — px height per word row (for alignment with Sankey)
// }
function WordPanel(props) {
  var words        = props.words || [];
  var seeds        = props.seeds;
  var toggleSeed   = props.toggleSeed;
  var seedInput    = props.seedInput;
  var setSeedInput = props.setSeedInput;
  var setSeeds     = props.setSeeds;
  var sortBy       = props.sortBy;
  var enabledEmos  = props.enabledEmos;
  var setEnabledEmos = props.setEnabledEmos;
  var ngMode       = props.ngMode || 1;
  var setNgMode    = props.setNgMode;
  var freqMap      = props.freqMap || {};
  var rowH         = props.rowH || 20;

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

  function toggleEmo(key) {
    var next = new Set(enabledEmos);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEnabledEmos(next);
  }

  var seedCount = seeds ? seeds.size : 0;
  var freqColor = sortBy === "freq" ? T.accent : T.textDim;
  var relColor  = sortBy === "relevance" ? T.flow : T.textDim;

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

    // ── Seed input ──
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

    // ── Clear seeds ──
    seedCount > 0 && React.createElement("button", {
      onClick: function() { setSeeds(new Set()); },
      style: {
        background: "transparent",
        border: "1px solid " + T.borderLight,
        color: T.textMid,
        borderRadius: T.radius3,
        padding: "1px 5px",
        fontSize: 9,
        fontFamily: T.fontMono,
        cursor: "pointer",
        marginBottom: T.gap4,
        alignSelf: "flex-start"
      }
    }, "Limpiar (" + seedCount + ")"),

    // ── Word list — rows aligned to Sankey ──
    React.createElement("div", { style: { flex: 1 } },
      words.map(function(item) {
        var w = item.word;
        var isSeed = seeds.has(w);
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
          React.createElement("span", {
            style: { fontSize: 9, color: T.textFaint }
          }, "|"),
          React.createElement("span", {
            style: { fontSize: 9, color: relColor, minWidth: 22, textAlign: "right" }
          }, (item.rel || 1).toFixed(1))
        );
      })
    ),

    // ── Emotion toggles ──
    React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        marginTop: T.gap6,
        paddingTop: T.gap6,
        borderTop: "1px solid " + T.border
      }
    },
      _EMO_PANEL.map(function(item) {
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

    // ── N-gram selector ──
    React.createElement("div", {
      style: { display: "flex", gap: 2, marginTop: T.gap4 }
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
