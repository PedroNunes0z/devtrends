/* =========================================================================
   app.js — bootstrap: navigation, icons, config panel, key rotation panel,
   user option controls, on-demand report.

   There are no static report pages: every report is generated when the user
   clicks "Analisar". The hero form, suggestion chips, catalog links and the
   "Ver Vue.js" CTA all call analyze() below, which renders the full report
   into the #analise section of index.html. Deep links (?tech=react) run the
   same flow on load.

   User-selected options (focus, depth, experience) are captured in the UI
   and passed into getInsights(), which includes them in the Gemini prompt
   alongside GitHub, Stack Overflow and Hacker News data.

   Gemini API keys are managed in a dedicated rotation panel with add/remove,
   active-key indicator, and call/error statistics.
   ========================================================================= */
(function () {
  "use strict";

  var D = window.DEVTRENDS_DATA;
  var W = window.DEVTRENDS_WIDGETS;
  var ICONS = window.DEVTRENDS_ICONS;
  var H = window.DEVTRENDS_HIGHLIGHT;

  var currentAnalysis = null;

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

  /* --- Search and dynamic analysis triggers ------------------------------- */
  function wireSearch(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-search-form]"), function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = form.querySelector("input[name=tech]");
        var name = input ? input.value : "";
        if (!D.slugify(name)) { if (input) input.focus(); return; }
        analyze(name);
      });
    });
    /* ONLY wire actual chips/buttons — NEVER document.body */
    Array.prototype.forEach.call((root || document).querySelectorAll(".chip[data-tech], [data-search-scope] [data-tech]"), function (chip) {
      if (chip === document.body || chip.tagName === "BODY") return;
      chip.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var name = chip.getAttribute("data-tech");
        var form = chip.closest("[data-search-scope]") || document;
        var input = form.querySelector("input[name=tech]");
        if (input) input.value = name;
        analyze(name);
      });
    });
    /* Catalog rows, propsal CTA and footer quick links */
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-analyze]"), function (link) {
      if (link.__wiredAnalyze) return;
      link.__wiredAnalyze = true;
      link.addEventListener("click", function (event) {
        event.preventDefault();
        var name = link.getAttribute("data-analyze");
        var input = document.querySelector("#tech-query");
        if (input) input.value = name;
        analyze(name);
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

    /* Ensure geminiModel input exists in the config panel */
    var modelInput = panel.querySelector('[name="geminiModel"]');
    if (!modelInput) {
      var section = panel.querySelector(".config-section");
      if (section) {
        var label = document.createElement("label");
        label.innerHTML = 'Modelo Gemini<input type="text" name="geminiModel" placeholder="gemini-3.5-flash-lite" autocomplete="off"><span class="hint">Padrão: gemini-3.5-flash-lite.</span>';
        var saveBtn = section.querySelector("[data-config-save]");
        if (saveBtn) section.insertBefore(label, saveBtn);
        else section.appendChild(label);
      }
    }

    /* Standard keys & model */
    ["githubToken", "stackexchangeKey", "geminiModel"].forEach(function (key) {
      var input = panel.querySelector('[name="' + key + '"]');
      if (input) input.value = window.DEVTRENDS.config[key] || "";
    });

    if (panel.__wired) {
      panel.__onSaved = onSaved;
      return;
    }
    panel.__wired = true;
    panel.__onSaved = onSaved;

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      panel.classList.toggle("open");
      renderKeysList();
    });

    var save = panel.querySelector("[data-config-save]");
    if (save) save.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var values = {};
      ["githubToken", "stackexchangeKey", "geminiModel"].forEach(function (key) {
        var input = panel.querySelector('[name="' + key + '"]');
        if (input) values[key] = input.value.trim();
      });
      if (!values.geminiModel) values.geminiModel = "gemini-3.5-flash-lite";
      window.DEVTRENDS.save(values);
      panel.classList.remove("open");
      if (panel.__onSaved) panel.__onSaved();
    });

    /* --- Gemini key rotation UI --- */
    var addKeyBtn = panel.querySelector("[data-add-key]");
    var newKeyInput = panel.querySelector('[name="new-gemini-key"]');
    var newKeyLabel = panel.querySelector('[name="new-gemini-label"]');

    if (addKeyBtn && newKeyInput) {
      addKeyBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var val = newKeyInput.value.trim();
        if (!val) return;
        var label = newKeyLabel ? newKeyLabel.value.trim() : "";
        var ok = window.DEVTRENDS.keys.add(val, label);
        if (ok) {
          newKeyInput.value = "";
          if (newKeyLabel) newKeyLabel.value = "";
          renderKeysList();
          if (panel.__onSaved) panel.__onSaved();
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
      var errTip = s.lastError ? 'title="Último erro: ' + esc(s.lastError) + '"' : '';
      return '<div class="key-row ' + (active ? "key-active" : "") + '">' +
        '<span class="key-status ' + statusCls + '" title="' + (active ? "Ativa" : "Inativa") + '"></span>' +
        '<span class="key-masked mono">' + masked + '</span>' +
        '<span class="key-label">' + esc(k.label || "") + '</span>' +
        '<span class="key-stats mono" ' + errTip + '>' +
          (s.calls || 0) + ' chamadas' +
          (s.errors ? ', ' + s.errors + ' erros' : '') +
        '</span>' +
        (active ? '<span class="key-active-tag">ATIVA</span>' : "") +
        '<button type="button" class="key-remove-btn" data-remove-key="' + esc(k.value) + '" aria-label="Remover chave">' + ICONS.get("refresh", "icon-sm") + '</button>' +
      '</div>';
    }).join("");

    /* Wire remove buttons */
    Array.prototype.forEach.call(container.querySelectorAll("[data-remove-key]"), function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var val = btn.getAttribute("data-remove-key");
        window.DEVTRENDS.keys.remove(val);
        renderKeysList();
        var panel = document.getElementById("config-panel");
        if (panel && panel.__onSaved) panel.__onSaved();
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

  /* --- On-demand report (index.html#analise) ------------------------------- */
  function techFromUrl() {
    var fromQuery = new URLSearchParams(location.search).get("tech");
    if (fromQuery) return fromQuery;
    if (location.hash.indexOf("#tech=") === 0) return decodeURIComponent(location.hash.slice(6));
    return null;
  }

  function placeholderReport() {
    var target = document.getElementById("report");
    if (!target) return;
    if (target.innerHTML.trim()) return;
    target.innerHTML = status("Escolha uma tecnologia no topo e clique em “Analisar”. O relatório é construído na hora das chamadas reais das APIs.", false);
  }

  function analyze(inputName) {
    var slug = D.slugify(inputName);
    if (!slug) return;
    var target = document.getElementById("report");
    if (!target) return;

    currentAnalysis = slug;
    try {
      history.replaceState(null, "", location.pathname + "?tech=" + encodeURIComponent(slug) + location.hash);
    } catch (e) { /* file:// or restricted */ }

    var currentRequestId = 0;

    function load() {
      var reqId = ++currentRequestId;
      target.innerHTML = status("GET GitHub + Stack Overflow + Gemini…", true);
      var opts = collectOptions();
      D.getInsights(slug, opts).then(function (report) {
        if (reqId !== currentRequestId) return;
        document.title = report.tech.name + ": tendência, popularidade e saúde da comunidade (" + report.ai.indiceVitalidade + "/100) | DevTrends Insights";
        W.render(target, report);
        injectIcons(target);
        wireReportActions(target);
      }).catch(function (error) {
        if (reqId !== currentRequestId) return;
        target.innerHTML = '<div class="status-line status-error">' +
          ICONS.get("alert", "icon-sm") +
          '<span>Falha na consulta: ' + H.esc(error.message) + '</span>' +
          '<button type="button" class="btn btn-secondary retry-btn" data-retry-report style="margin-left:12px;height:30px;padding:0 12px;font-size:12px">Tentar novamente</button>' +
        '</div>';
        injectIcons(target);
        var retryBtn = target.querySelector("[data-retry-report]");
        if (retryBtn) retryBtn.addEventListener("click", function (e) {
          e.preventDefault();
          load();
        });
      });
    }

    function wireReportActions(root) {
      Array.prototype.forEach.call((root || document).querySelectorAll("[data-open-config]"), function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var panel = document.getElementById("config-panel");
          if (panel) {
            panel.classList.add("open");
            panel.scrollIntoView({ behavior: "smooth", block: "start" });
            renderKeysList();
          }
        });
      });
    }

    wireConfig(load);
    wireOptionControls(load);
    wireCustomSelects(document);
    load();

    var section = document.getElementById("analise");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* --- Custom Dropdowns ---------------------------------------------------- */
  function wireCustomSelects(root) {
    var scope = root || document;

    /* Auto-wrap any unenhanced native selects with data-option-control */
    var nativeSelects = scope.querySelectorAll("select[data-option-control]");
    Array.prototype.forEach.call(nativeSelects, function (sel) {
      if (sel.closest(".custom-select") || sel.__enhancedSelect) return;
      sel.__enhancedSelect = true;

      var parent = sel.parentNode;
      var wrapper = document.createElement("div");
      wrapper.className = "custom-select";
      wrapper.setAttribute("data-custom-select", "");
      parent.insertBefore(wrapper, sel);
      wrapper.appendChild(sel);
      sel.classList.add("custom-select-native");
      sel.setAttribute("tabindex", "-1");
      sel.setAttribute("aria-hidden", "true");

      var currentOpt = sel.options[sel.selectedIndex] || sel.options[0];
      var currentLabel = currentOpt ? currentOpt.textContent : "";

      var trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "custom-select-trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.innerHTML = '<span class="custom-select-value">' + esc(currentLabel) + '</span>' +
        '<span class="custom-select-arrow" aria-hidden="true">' + ICONS.get("chevronDown", "icon-sm") + '</span>';

      var dropdown = document.createElement("div");
      dropdown.className = "custom-select-dropdown";
      dropdown.setAttribute("role", "listbox");
      dropdown.setAttribute("tabindex", "-1");

      var optionsWrap = document.createElement("div");
      optionsWrap.className = "custom-select-options";

      Array.prototype.forEach.call(sel.options, function (opt) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "custom-select-option" + (opt.selected ? " selected" : "");
        btn.setAttribute("role", "option");
        btn.setAttribute("data-value", opt.value);
        btn.setAttribute("aria-selected", opt.selected ? "true" : "false");
        btn.innerHTML = '<span class="custom-select-option-label">' + esc(opt.textContent) + '</span>' +
          '<span class="custom-select-option-check" aria-hidden="true">' + ICONS.get("check", "icon-sm") + '</span>';
        optionsWrap.appendChild(btn);
      });

      dropdown.appendChild(optionsWrap);
      wrapper.appendChild(trigger);
      wrapper.appendChild(dropdown);
    });

    /* Wire all .custom-select elements in scope */
    var customSelects = scope.querySelectorAll(".custom-select[data-custom-select]");
    Array.prototype.forEach.call(customSelects, function (container) {
      if (container.__wiredSelect) return;
      container.__wiredSelect = true;

      var trigger = container.querySelector(".custom-select-trigger");
      var valueSpan = container.querySelector(".custom-select-value");
      var nativeSelect = container.querySelector("select");
      var options = container.querySelectorAll(".custom-select-option");

      function open() {
        closeAllCustomSelects();
        container.classList.add("open");
        if (trigger) trigger.setAttribute("aria-expanded", "true");
        var selectedOpt = container.querySelector(".custom-select-option.selected");
        if (selectedOpt) {
          try { selectedOpt.scrollIntoView({ block: "nearest" }); } catch (e) {}
        }
      }

      function close() {
        container.classList.remove("open");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }

      function selectValue(val) {
        if (nativeSelect) {
          nativeSelect.value = val;
          nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
        syncFromNative();
        close();
        if (trigger) trigger.focus();
      }

      function syncFromNative() {
        if (!nativeSelect) return;
        var currentVal = nativeSelect.value;
        Array.prototype.forEach.call(options, function (opt) {
          var isMatch = opt.getAttribute("data-value") === currentVal;
          opt.classList.toggle("selected", isMatch);
          opt.setAttribute("aria-selected", isMatch ? "true" : "false");
          if (isMatch && valueSpan) {
            var labelEl = opt.querySelector(".custom-select-option-label");
            valueSpan.textContent = labelEl ? labelEl.textContent : opt.textContent;
          }
        });
      }

      if (trigger) {
        trigger.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (container.classList.contains("open")) {
            close();
          } else {
            open();
          }
        });

        trigger.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!container.classList.contains("open")) {
              open();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              var optsArr = Array.prototype.slice.call(options);
              var activeIdx = optsArr.findIndex(function (o) { return o.classList.contains("selected"); });
              var nextIdx = e.key === "ArrowDown" ? (activeIdx + 1) % optsArr.length : (activeIdx - 1 + optsArr.length) % optsArr.length;
              selectValue(optsArr[nextIdx].getAttribute("data-value"));
            }
          } else if (e.key === "Escape") {
            close();
          }
        });
      }

      Array.prototype.forEach.call(options, function (opt) {
        opt.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var val = opt.getAttribute("data-value");
          selectValue(val);
        });
      });

      if (nativeSelect) {
        nativeSelect.addEventListener("change", syncFromNative);
      }
    });
  }

  function closeAllCustomSelects() {
    var openSelects = document.querySelectorAll(".custom-select.open");
    Array.prototype.forEach.call(openSelects, function (cs) {
      cs.classList.remove("open");
      var tr = cs.querySelector(".custom-select-trigger");
      if (tr) tr.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".custom-select")) {
      closeAllCustomSelects();
    }
    var dispatch = e.target.closest("[data-analyze-dispatch]");
    if (dispatch) {
      e.preventDefault();
      var name = dispatch.getAttribute("data-analyze-dispatch");
      var input = document.querySelector("#tech-query");
      if (input) input.value = name;
      analyze(name);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeAllCustomSelects();
    }
  });

  /* --- Wire option controls to trigger reload on change --- */
  function wireOptionControls(onChange) {
    var controls = document.querySelectorAll('[data-option-control]');
    Array.prototype.forEach.call(controls, function (el) {
      if (el.__wiredOption) return;
      el.__wiredOption = true;
      el.addEventListener("change", function () {
        if (onChange) onChange();
      });
    });
  }

  function init() {
    injectIcons(document);
    wireCommandCopy();
    wireSearch(document);
    wireCustomSelects(document);
    H.mount(document);
    window.DEVTRENDS_TICKER.mount(document);
    wireConfig(function () {
      if (currentAnalysis) analyze(currentAnalysis);
    });

    var initial = techFromUrl();
    if (initial) {
      var input = document.querySelector("#tech-query");
      if (input) input.value = initial;
      analyze(initial);
    } else {
      placeholderReport();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
