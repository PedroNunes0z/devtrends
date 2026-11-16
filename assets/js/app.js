/* =========================================================================
   app.js — bootstrap: navigation, icons, config panel, key rotation panel,
   user option controls, live sample, report.

   User-selected options (focus, depth, experience, comparison target) are
   captured in the UI and passed into getInsights(), which includes them in
   the Gemini prompt alongside GitHub and Stack Overflow data.

   Gemini API keys are managed in a dedicated rotation panel with add/remove,
   active-key indicator, and call/error statistics.
   ========================================================================= */
(function () {
  "use strict";

  var D = window.DEVTRENDS_DATA;
  var W = window.DEVTRENDS_WIDGETS;
  var ICONS = window.DEVTRENDS_ICONS;
  var H = window.DEVTRENDS_HIGHLIGHT;
  var home = document.body.getAttribute("data-home") || ".";

  function reportUrl(slug) { return home + "/reports/" + slug + ".html"; }

  /* --- Icons -------------------------------------------------------------- */
  function injectIcons(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-icon]"), function (el) {
      el.innerHTML = ICONS.get(el.getAttribute("data-icon"), el.getAttribute("data-icon-class") || "");
      el.removeAttribute("data-icon");
    });
  }

  /* --- Copy buttons outside code blocks ----------------------------------- */
  function wireCommandCopy() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-copy-command]"), function (btn) {
      var text = btn.getAttribute("data-copy-command");
      btn.innerHTML = ICONS.get("copy");
      btn.classList.add("copy-btn");
      btn.setAttribute("aria-label", "Copiar comando");
      btn.addEventListener("click", function () {
        navigator.clipboard.writeText(text).then(function () {
          btn.innerHTML = ICONS.get("check");
          setTimeout(function () { btn.innerHTML = ICONS.get("copy"); }, 1600);
        }).catch(function () { /* no clipboard */ });
      });
    });
  }

  /* --- Search ------------------------------------------------------------- */
  function wireSearch(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-search-form]"), function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = form.querySelector("input[name=tech]");
        var slug = D.slugify(input ? input.value : "");
        if (!slug) { if (input) input.focus(); return; }
        location.href = reportUrl(slug);
      });
    });
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-tech]"), function (chip) {
      chip.addEventListener("click", function () {
        var name = chip.getAttribute("data-tech");
        var form = chip.closest("[data-search-scope]") || document;
        var input = form.querySelector("input[name=tech]");
        if (input) input.value = name;
        location.href = reportUrl(D.slugify(name));
      });
    });
  }

  /* --- Collect user options from the UI controls --- */
  function collectOptions() {
    var opts = {};
    var focusEl = document.querySelector('[name="analysis-focus"]');
    if (focusEl) opts.focus = focusEl.value;
    var depthEl = document.querySelector('[name="analysis-depth"]');
    if (depthEl) opts.depth = depthEl.value;
    var expEl = document.querySelector('[name="experience-level"]');
    if (expEl) opts.experience = expEl.value;
    var compareEl = document.querySelector('[name="compare-with"]');
    if (compareEl && compareEl.value.trim()) opts.compareWith = compareEl.value.trim();
    var careerEl = document.querySelector('[name="consider-career"]');
    if (careerEl) opts.considerCareer = careerEl.checked;
    var horizonEl = document.querySelector('[name="time-horizon"]');
    if (horizonEl && horizonEl.value) opts.timeHorizon = horizonEl.value;
    return opts;
  }

  /* --- Config panel with key rotation UI --- */
  function wireConfig(onSaved) {
    var toggle = document.getElementById("config-toggle");
    var panel = document.getElementById("config-panel");
    if (!toggle || !panel) return;
    toggle.innerHTML = ICONS.get("settings", "icon-sm") + '<span>Config</span>';
    toggle.style.display = "inline-flex";
    toggle.style.alignItems = "center";
    toggle.style.gap = "6px";

    /* Standard keys */
    ["githubToken", "stackexchangeKey"].forEach(function (key) {
      var input = panel.querySelector('[name="' + key + '"]');
      if (input) input.value = window.DEVTRENDS.stored[key] || "";
    });

    toggle.addEventListener("click", function () { panel.classList.toggle("open"); renderKeysList(); });

    var save = panel.querySelector("[data-config-save]");
    if (save) save.addEventListener("click", function () {
      var values = {};
      ["githubToken", "stackexchangeKey"].forEach(function (key) {
        var input = panel.querySelector('[name="' + key + '"]');
        if (input) values[key] = input.value.trim();
      });
      window.DEVTRENDS.save(values);
      panel.classList.remove("open");
      if (onSaved) onSaved();
    });

    /* --- Gemini key rotation UI --- */
    var addKeyBtn = panel.querySelector("[data-add-key]");
    var newKeyInput = panel.querySelector('[name="new-gemini-key"]');
    var newKeyLabel = panel.querySelector('[name="new-gemini-label"]');

    if (addKeyBtn && newKeyInput) {
      addKeyBtn.addEventListener("click", function () {
        var val = newKeyInput.value.trim();
        if (!val) return;
        var label = newKeyLabel ? newKeyLabel.value.trim() : "";
        var ok = window.DEVTRENDS.keys.add(val, label);
        if (ok) {
          newKeyInput.value = "";
          if (newKeyLabel) newKeyLabel.value = "";
          renderKeysList();
        }
      });
      /* Allow Enter to submit */
      newKeyInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); if (addKeyBtn) addKeyBtn.click(); }
      });
    }
  }

  function renderKeysList() {
    var container = document.getElementById("gemini-keys-list");
    if (!container) return;
    var keys = window.DEVTRENDS.keys.get();
    var stats = window.DEVTRENDS.keys.stats();

    if (!keys.length) {
      container.innerHTML = '<p class="key-empty">Nenhuma chave Gemini configurada. Adicione acima para usar o Gemini em vez da heurística local.</p>';
      return;
    }

    container.innerHTML = keys.map(function (k) {
      var s = stats[k.value] || {};
      var active = s.active;
      var masked = s.masked || k.value.slice(0, 8) + "...";
      var statusCls = s.errors > 0 && s.calls > 0 && s.errors / s.calls > 0.5 ? "key-error" : "key-ok";
      return '<div class="key-row ' + (active ? "key-active" : "") + '">' +
        '<span class="key-status ' + statusCls + '" title="' + (active ? "Ativa" : "Inativa") + '"></span>' +
        '<span class="key-masked mono">' + masked + '</span>' +
        '<span class="key-label">' + esc(k.label || "") + '</span>' +
        '<span class="key-stats mono">' +
          (s.calls || 0) + ' chamadas' +
          (s.errors ? ', ' + s.errors + ' erros' : '') +
        '</span>' +
        (active ? '<span class="key-active-tag">ATIVA</span>' : "") +
        '<button type="button" class="key-remove-btn" data-remove-key="' + esc(k.value) + '" aria-label="Remover chave">' + ICONS.get("refresh", "icon-sm") + '</button>' +
      '</div>';
    }).join("");

    /* Wire remove buttons */
    Array.prototype.forEach.call(container.querySelectorAll("[data-remove-key]"), function (btn) {
      btn.addEventListener("click", function () {
        var val = btn.getAttribute("data-remove-key");
        window.DEVTRENDS.keys.remove(val);
        renderKeysList();
      });
    });

    injectIcons(container);
  }

  function esc(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* --- Status ------------------------------------------------------------- */
  function status(text, spinning) {
    return '<div class="status-line">' + (spinning ? '<span class="spinner"></span>' : ICONS.get("info", "icon-sm")) + '<span>' + H.esc(text) + '</span></div>';
  }

  /* --- Home: real live sample -------------------------------------------- */
  function hydrateHome() {
    var target = document.getElementById("live-sample");
    if (!target) return;
    target.innerHTML = status("Consultando GitHub, Stack Overflow e Gemini…", true);
    D.getInsights("React", collectOptions()).then(function (report) {
      target.innerHTML = W.trendOnly(report);
      window.DEVTRENDS_TICKER.mount(target);
      H.mount(target);
      injectIcons(target);
    }).catch(function (error) {
      target.innerHTML = status("Não foi possível carregar a amostra: " + error.message, false);
    });
  }

  /* --- Report page -------------------------------------------------------- */
  function hydrateReport() {
    var target = document.getElementById("report");
    var slug = document.body.getAttribute("data-tech") || "";
    if (!target || !slug) return;
    target.innerHTML = status("GET GitHub + Stack Overflow + Gemini…", true);

    function load() {
      var opts = collectOptions();
      D.getInsights(slug, opts).then(function (report) {
        document.title = report.tech.name + ": tendência, popularidade e saúde da comunidade (" + report.ai.indiceVitalidade + "/100) | DevTrends Insights";
        W.render(target, report);
        injectIcons(target);
      }).catch(function (error) {
        target.innerHTML = status("Falha na consulta: " + error.message, false);
      });
    }
    wireConfig(load);

    /* Wire option change listeners for re-analysis */
    wireOptionControls(load);

    load();
  }

  /* --- Wire option controls to trigger reload on change --- */
  function wireOptionControls(onChange) {
    var controls = document.querySelectorAll('[data-option-control]');
    Array.prototype.forEach.call(controls, function (el) {
      el.addEventListener("change", function () {
        if (onChange) onChange();
      });
    });
  }

  function init() {
    injectIcons(document);
    wireCommandCopy();
    wireSearch(document);
    H.mount(document);
    window.DEVTRENDS_TICKER.mount(document);

    var page = document.body.getAttribute("data-page");
    if (page === "home") { wireConfig(hydrateHome); hydrateHome(); }
    else if (page === "report") hydrateReport();
    else wireConfig();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
