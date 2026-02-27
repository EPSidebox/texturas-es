// ─────────────────────────────────────────────
// config.js — Texturas (ES) v2.0
// React hook aliases, design tokens, constants, shared configuration
// ─────────────────────────────────────────────

// ── React Hook Aliases (global scope for Babel standalone) ──
var useState = React.useState, useRef = React.useRef,
    useEffect = React.useEffect, useCallback = React.useCallback,
    useMemo = React.useMemo;

// ── Design Tokens ──
var T = {
  // Asset loading
  assetBaseUrl: "https://epsidebox.github.io/texturas-es/assets/",

  // Colors — backgrounds
  bg: "#111", bgCard: "#1a1a1a", bgDeep: "#0d0d0d", bgHover: "#151515",

  // Colors — borders
  border: "#2a2a2a", borderLight: "#333", borderMed: "#444",

  // Colors — text
  text: "#ddd", textMid: "#999", textDim: "#666", textFaint: "#444",

  // Colors — accent
  accent: "#4ecdc4", accentDim: "#4ecdc444",

  // Colors — semantic
  positive: "#82e0aa", negative: "#ff6b6b", neutral: "#888",
  arousal: "#f7dc6f", flow: "#45b7d1", grid: "#bb8fce", emotion: "#f0b27a",

  // Typography
  fontMono: "'Roboto Mono', monospace",
  fs10: 10, fs11: 11, fs12: 12, fs13: 13, fs15: 15, fs18: 18,

  // Spacing
  gap4: 4, gap6: 6, gap8: 8, gap10: 10, gap12: 12, gap16: 16, gap20: 20,
  pad4: "4px", pad5: "5px", pad8: "8px", pad10: "10px", pad12: "12px", pad16: "16px",

  // Layout
  maxWidth: 1100, maxWidthNarrow: 800,
  wordPanelW: 160, minimapW: 80, contentH: 540,

  // Borders
  radius3: 3, radius4: 4, radius6: 6
};

// ── Emotion Constants ──
var EMOTIONS = ["anger", "anticipation", "disgust", "fear", "joy", "sadness", "surprise", "trust"];

var EC = {
  anger: "#ff6b6b",
  anticipation: "#f7dc6f",
  disgust: "#bb8fce",
  fear: "#85c1e9",
  joy: "#82e0aa",
  sadness: "#45b7d1",
  surprise: "#f0b27a",
  trust: "#4ecdc4"
};

// Community colors (Louvain)
var CC = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f7dc6f", "#bb8fce", "#82e0aa", "#f0b27a", "#85c1e9", "#f1948a", "#73c6b6"];

// Plutchik 3×3 layout for emotion grid
var EMO_LAYOUT = [
  { r: 0, c: 0, emo: "anticipation" },
  { r: 0, c: 1, emo: "joy" },
  { r: 0, c: 2, emo: "trust" },
  { r: 1, c: 0, emo: "anger" },
  { r: 1, c: 1, emo: null },
  { r: 1, c: 2, emo: "fear" },
  { r: 2, c: 0, emo: "disgust" },
  { r: 2, c: 1, emo: "sadness" },
  { r: 2, c: 2, emo: "surprise" }
];

// Weave layer configuration
var LAYER_CFG = {
  polarity:  { label: "Polaridad",   color: "#82e0aa" },
  emotion:   { label: "Emoci\u00F3n",    color: "#f0b27a" },
  arousal:   { label: "Activaci\u00F3n",    color: "#f7dc6f" },
  frequency: { label: "Frecuencia",  color: "#4ecdc4" },
  community: { label: "Comunidad",  color: "#bb8fce" }
};

// ── Spanish POS Suffix Rules (fallback only) ──
var SFX_ES = [
  // Nouns
  ["ción", "n"], ["sión", "n"], ["miento", "n"], ["idad", "n"], ["dad", "n"],
  ["eza", "n"], ["anza", "n"], ["encia", "n"], ["ancia", "n"], ["ismo", "n"],
  ["ista", "n"], ["aje", "n"], ["ura", "n"],
  // Verbs — gerund, participle, infinitive, imperfect
  ["ando", "v"], ["iendo", "v"], ["ado", "v"], ["ido", "v"],
  ["ar", "v"], ["er", "v"], ["ir", "v"],
  ["aba", "v"], ["ían", "v"], ["aron", "v"], ["ieron", "v"],
  // Adverbs
  ["mente", "r"],
  // Adjectives
  ["oso", "a"], ["osa", "a"], ["ivo", "a"], ["iva", "a"],
  ["ble", "a"], ["ante", "a"], ["ente", "a"], ["ual", "a"],
  ["ico", "a"], ["ica", "a"], ["al", "a"]
];

// ── Spanish Stop Words (LEMMA forms) ──
// Matched against lemmatized tokens, not surface forms.
// ~280 lemmas — catches all conjugated forms automatically.
var STOP_WORDS_ES = new Set([
  // Articles (including "uno" — lemmatizer maps un/una/unos/unas → uno)
  "el", "la", "los", "las", "un", "una", "uno", "unos", "unas", "lo",
  // Prepositions
  "a", "ante", "bajo", "con", "contra", "de", "desde", "en", "entre",
  "hacia", "hasta", "para", "por", "según", "sin", "sobre", "tras",
  "durante", "mediante",
  // Conjunctions
  "y", "e", "o", "u", "ni", "que", "pero", "sino", "aunque", "porque",
  "pues", "como", "si", "cuando", "donde", "mientras",
  // Personal pronouns
  "yo", "tú", "él", "ella", "usted", "nosotros", "nosotras",
  "vosotros", "vosotras", "ellos", "ellas", "ustedes",
  "me", "te", "se", "nos", "os", "le", "les",
  "mí", "ti", "sí", "conmigo", "contigo", "consigo",
  // Demonstratives
  "este", "esta", "esto", "estos", "estas",
  "ese", "esa", "eso", "esos", "esas",
  "aquel", "aquella", "aquello", "aquellos", "aquellas",
  // Possessives
  "mi", "mis", "tu", "tus", "su", "sus",
  "nuestro", "nuestra", "nuestros", "nuestras",
  "vuestro", "vuestra", "vuestros", "vuestras",
  "suyo", "suya", "suyos", "suyas",
  "mío", "mía", "míos", "mías",
  "tuyo", "tuya", "tuyos", "tuyas",
  // Relatives / interrogatives
  "quien", "quienes", "cual", "cuales",
  "cuyo", "cuya", "cuyos", "cuyas",
  // Auxiliary / common verbs (LEMMA forms — conjugations caught by lemmatizer)
  "ser", "estar", "haber", "tener", "hacer", "poder", "ir",
  "decir", "dar", "saber", "querer", "deber", "poner", "parecer",
  "quedar", "creer", "llevar", "pasar", "seguir", "encontrar",
  "venir", "pensar", "salir", "volver", "tomar", "conocer",
  "vivir", "sentir", "tratar", "mirar", "contar", "empezar",
  "esperar", "buscar", "llamar", "hablar", "dejar", "recibir", "acabar",
  // Adverbs
  "no", "sí", "muy", "más", "menos", "ya", "también", "tampoco",
  "bien", "mal", "mucho", "poco", "bastante", "demasiado",
  "tan", "tanto", "así", "aquí", "ahí", "allí", "acá", "allá",
  "siempre", "nunca", "jamás", "todavía", "aún", "además",
  "entonces", "después", "antes", "luego", "ahora",
  "hoy", "ayer", "mañana", "pronto", "tarde",
  "cerca", "lejos", "dentro", "fuera", "arriba", "abajo",
  "encima", "debajo", "delante", "detrás",
  // Discourse markers
  "bueno", "claro", "vale", "verdad", "realmente",
  "básicamente", "literalmente", "simplemente",
  // Other high-frequency function words
  "otro", "otra", "otros", "otras", "todo", "toda", "todos", "todas",
  "mismo", "misma", "mismos", "mismas",
  "cada", "algo", "alguien", "alguno", "alguna", "algunos", "algunas",
  "nada", "nadie", "ninguno", "ninguna",
  "del", "al"
]);

// ── Spanish Negation (surface forms) ──
// Matched against surface tokens to flip following word's polarity.
var NEGATION_ES = new Set([
  "no", "nunca", "jamás", "tampoco", "ni",
  "ninguno", "ninguna", "ningunos", "ningunas", "ningún",
  "nada", "nadie", "sin", "apenas", "ni siquiera"
]);
