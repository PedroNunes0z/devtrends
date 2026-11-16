/* =========================================================================
   config.js — the "environment variables" of a static app.

   GitHub Pages has no server, so there are no real env vars. Fill the public,
   non-secret values below. Secrets (Gemini keys, GitHub token) are entered at
   runtime in the "Config" panel and kept only in this browser's localStorage.
   Never commit a real key: everything here is shipped to the client.

   --- Key rotation ---
   Supports multiple Gemini API keys with automatic round-robin rotation.
   When a key fails (quota, rate-limit, or network), the next key is tried.
   Keys are managed via the graphical Config panel.
   ========================================================================= */
(function () {
  "use strict";

  var DEFAULTS = {
    siteUrl: "https://pedronunes0z.github.io/devtrends",
    githubApi: "https://api.github.com",
    stackexchangeApi: "https://api.stackexchange.com/2.3",
    stackOverflow: "https://stackoverflow.com",
    geminiApi: "https://generativelanguage.googleapis.com/v1beta",
    geminiModel: "gemini-2.5-flash",
    /* Optional dependency-free scraper you run locally (tools/scraper.mjs). */
    scraperLocal: "http://127.0.0.1:8787/api/stackoverflow",
    cacheTtlMinutes: 60,
    timeoutMs: 9000,
    stargazerSamplePages: 2,
    soSampleSize: 30
  };

  var STORAGE_KEY = "devtrends.settings.v1";
  var KEYS_STORAGE = "devtrends.gemini-keys.v1";
  var fileConfig = window.DEVTRENDS_CONFIG || {};
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (e) { stored = {}; }

  /* --- Gemini key rotation state --- */
  var geminiKeys = [];
  var keyIndex = 0;
  var keyStats = {}; /* key -> { calls, errors, lastError, lastUsed } */

  function loadKeys() {
    try {
      var raw = localStorage.getItem(KEYS_STORAGE);
      geminiKeys = raw ? JSON.parse(raw) || [] : [];
    } catch (e) { geminiKeys = []; }
    /* Migrate old single-key config if present */
    if (!geminiKeys.length && stored.geminiApiKey) {
      geminiKeys = [{ value: stored.geminiApiKey, label: "Chave 1" }];
      saveKeys();
      delete stored.geminiApiKey;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch (e) {}
    }
    /* Initialize stats for loaded keys */
    geminiKeys.forEach(function (k) {
      if (!keyStats[k.value]) keyStats[k.value] = { calls: 0, errors: 0, lastError: null, lastUsed: null };
    });
  }

  function saveKeys() {
    try { localStorage.setItem(KEYS_STORAGE, JSON.stringify(geminiKeys)); } catch (e) { /* private mode */ }
  }

  loadKeys();

  var config = Object.assign({}, DEFAULTS, fileConfig, stored);
  /* Keep geminiApiKey in sync for backward compatibility in hasGemini() */
  config.geminiApiKey = geminiKeys.length ? geminiKeys[keyIndex].value : "";

  function save(partial) {
    Object.assign(stored, partial);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch (e) { /* private mode */ }
    Object.assign(config, partial);
    return config;
  }

  function isLocal() {
    var h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "";
  }

  /* --- Key rotation API --- */
  function getKeys() { return geminiKeys.slice(); }

  function addKey(value, label) {
    if (!value) return false;
    var exists = geminiKeys.some(function (k) { return k.value === value; });
    if (exists) return false;
    geminiKeys.push({ value: value, label: label || ("Chave " + (geminiKeys.length + 1)) });
    keyStats[value] = { calls: 0, errors: 0, lastError: null, lastUsed: null };
    saveKeys();
    syncActiveKey();
    return true;
  }

  function removeKey(value) {
    var idx = geminiKeys.findIndex(function (k) { return k.value === value; });
    if (idx < 0) return false;
    geminiKeys.splice(idx, 1);
    delete keyStats[value];
    if (keyIndex >= geminiKeys.length) keyIndex = 0;
    saveKeys();
    syncActiveKey();
    return true;
  }

  function reorderKeys(newOrder) {
    /* newOrder is array of key values in desired order */
    var reordered = [];
    newOrder.forEach(function (v) {
      var found = geminiKeys.find(function (k) { return k.value === v; });
      if (found) reordered.push(found);
    });
    if (reordered.length === geminiKeys.length) {
      geminiKeys = reordered;
      keyIndex = 0;
      saveKeys();
      syncActiveKey();
      return true;
    }
    return false;
  }

  function nextKey() {
    if (!geminiKeys.length) return null;
    keyIndex = (keyIndex + 1) % geminiKeys.length;
    syncActiveKey();
    return geminiKeys[keyIndex].value;
  }

  function getActiveKey() {
    if (!geminiKeys.length) return null;
    return geminiKeys[keyIndex].value;
  }

  function recordKeyCall(value, success, errorMsg) {
    var s = keyStats[value];
    if (!s) { s = keyStats[value] = { calls: 0, errors: 0, lastError: null, lastUsed: null }; }
    s.calls++;
    s.lastUsed = new Date().toISOString();
    if (!success) {
      s.errors++;
      s.lastError = errorMsg || "unknown";
    }
  }

  function getKeyStats() {
    var out = {};
    Object.keys(keyStats).forEach(function (k) {
      var s = keyStats[k];
      /* Mask key for display: show first 8 and last 4 chars */
      var masked = k.length > 14 ? k.slice(0, 8) + "..." + k.slice(-4) : k.slice(0, 4) + "...";
      out[k] = {
        calls: s.calls, errors: s.errors, lastError: s.lastError, lastUsed: s.lastUsed,
        masked: masked,
        active: geminiKeys.length && geminiKeys[keyIndex] && geminiKeys[keyIndex].value === k
      };
    });
    return out;
  }

  function syncActiveKey() {
    config.geminiApiKey = geminiKeys.length ? geminiKeys[keyIndex].value : "";
  }

  function hasGemini() { return geminiKeys.length > 0; }
  function hasGithubToken() { return Boolean(config.githubToken); }

  window.DEVTRENDS = {
    config: config,
    defaults: DEFAULTS,
    save: save,
    stored: stored,
    isLocal: isLocal,
    hasGemini: hasGemini,
    hasGithubToken: hasGithubToken,
    /* Key rotation */
    keys: {
      get: getKeys,
      add: addKey,
      remove: removeKey,
      reorder: reorderKeys,
      active: getActiveKey,
      next: nextKey,
      recordCall: recordKeyCall,
      stats: getKeyStats,
      count: function () { return geminiKeys.length; },
      index: function () { return keyIndex; }
    }
  };
})();
