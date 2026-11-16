/* =========================================================================
   api-docs.js — controla as abas da documentação da API própria.

   Sem frameworks: alterna painéis escondidos, mantém aria-selected/tabindex
   e permite navegação por teclado (setas, Home e End), como um tablist ARIA.
   ========================================================================= */
(function () {
  "use strict";

  function init() {
    var scope = document.querySelector("[data-api-docs]");
    if (!scope || scope.__apiDocsWired) return;
    scope.__apiDocsWired = true;

    var tabs = Array.prototype.slice.call(scope.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    function panelFor(tab) {
      return document.getElementById(tab.getAttribute("aria-controls"));
    }

    function activate(tab, moveFocus) {
      tabs.forEach(function (item) {
        var active = item === tab;
        item.setAttribute("aria-selected", active ? "true" : "false");
        item.tabIndex = active ? 0 : -1;
        var panel = panelFor(item);
        if (panel) panel.hidden = !active;
      });
      if (moveFocus) tab.focus();
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        activate(tab, false);
      });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
        else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (event.key === "Home") next = tabs[0];
        else if (event.key === "End") next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        activate(next, true);
      });
    });

    var initial = tabs.filter(function (tab) {
      return tab.getAttribute("aria-selected") === "true";
    })[0] || tabs[0];
    activate(initial, false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
