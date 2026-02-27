// ─────────────────────────────────────────────
// cache.js — Texturas (ES) v1.0
// IndexedDB caching and asset loading
// Reads: T.assetBaseUrl from config.js
// Exports: openDB, cGet, cSet, loadAsset
// ─────────────────────────────────────────────

var DB_NAME = "texturas-es-cache";
var DB_VER = 1;
var STORE = "assets";

function openDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = function() {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = function() {
      resolve(req.result);
    };
    req.onerror = function() {
      reject(req.error);
    };
  });
}

function cGet(key) {
  return openDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).get(key);
      req.onsuccess = function() {
        resolve(req.result || null);
      };
      req.onerror = function() {
        resolve(null);
      };
    });
  }).catch(function(e) {
    return null;
  });
}

function cSet(key, val) {
  return openDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }).catch(function(e) {
    return false;
  });
}

function loadAsset(key, path, isBinary, statusCb) {
  return cGet(key).then(function(cached) {
    if (cached) return cached;
    if (!T.assetBaseUrl) return null;

    var base = T.assetBaseUrl;
    if (base.charAt(base.length - 1) !== "/") base = base + "/";

    if (statusCb) statusCb("Fetching " + path + "...");

    return fetch(base + path).then(function(resp) {
      if (!resp.ok) return null;
      return isBinary ? resp.arrayBuffer() : resp.json();
    }).then(function(data) {
      if (!data) return null;
      return cSet(key, data).then(function() {
        return data;
      });
    }).catch(function(e) {
      return null;
    });
  });
}
