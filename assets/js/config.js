/* =========================================================================
   config.js — the "environment variables" of a static app.

   GitHub Pages has no server, so there are no real env vars. Fill the public,
   non-secret values below. Secrets (Gemini key, GitHub token) are entered at
   runtime in the "Config" panel and kept only in this browser's localStorage.
   Never commit a real key: everything here is shipped to the client.
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
  var fileConfig = window.DEVTRENDS_CONFIG || {};
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (e) { stored = {}; }

  var config = Object.assign({}, DEFAULTS, fileConfig, stored);

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

  window.DEVTRENDS = {
    config: config,
    defaults: DEFAULTS,
    save: save,
    stored: stored,
    isLocal: isLocal,
    hasGemini: function () { return Boolean(config.geminiApiKey); },
    hasGithubToken: function () { return Boolean(config.githubToken); }
  };
})();
