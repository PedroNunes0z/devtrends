/* =========================================================================
   app.js — bootstrap: navigation, icons, config panel, live sample, report.
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

  /* --- Config panel ------------------------------------------------------- */
  function wireConfig(onSaved) {
    var toggle = document.getElementById("config-toggle");
    var panel = document.getElementById("config-panel");
    if (!toggle || !panel) return;
    toggle.innerHTML = ICONS.get("settings", "icon-sm") + '<span>Config</span>';
    toggle.style.display = "inline-flex";
    toggle.style.alignItems = "center";
    toggle.style.gap = "6px";

    ["geminiApiKey", "githubToken", "stackexchangeKey"].forEach(function (key) {
      var input = panel.querySelector('[name="' + key + '"]');
      if (input) input.value = window.DEVTRENDS.stored[key] || "";
    });

    toggle.addEventListener("click", function () { panel.classList.toggle("open"); });
    var save = panel.querySelector("[data-config-save]");
    if (save) save.addEventListener("click", function () {
      var values = {};
      ["geminiApiKey", "githubToken", "stackexchangeKey"].forEach(function (key) {
        var input = panel.querySelector('[name="' + key + '"]');
        if (input) values[key] = input.value.trim();
      });
      window.DEVTRENDS.save(values);
      panel.classList.remove("open");
      if (onSaved) onSaved();
    });
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
    D.getInsights("React").then(function (report) {
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
      D.getInsights(slug).then(function (report) {
        document.title = report.tech.name + ": tendência, popularidade e saúde da comunidade (" + report.ai.indiceVitalidade + "/100) | DevTrends Insights";
        W.render(target, report);
        injectIcons(target);
      }).catch(function (error) {
        target.innerHTML = status("Falha na consulta: " + error.message, false);
      });
    }
    wireConfig(load);
    load();
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
