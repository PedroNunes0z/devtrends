/* =========================================================================
   highlight.js — small real tokenizer + copy affordance for code blocks.
   Not hand-coloured words: a scanner handles strings, comments, numbers,
   keywords, functions, constants and punctuation in order.
   ========================================================================= */
(function () {
  "use strict";

  var KEYWORDS = {
    ts: ["import", "from", "type", "const", "let", "var", "await", "async", "if", "else", "throw", "new", "return", "export", "function", "interface"],
    js: ["import", "from", "const", "let", "var", "await", "async", "if", "else", "throw", "new", "return", "export", "function", "class"],
    bash: ["curl", "jq", "if", "then", "fi", "echo", "for", "do", "done"],
    json: ["true", "false", "null"]
  };
  var CONSTANTS = ["true", "false", "null", "undefined", "GET", "POST", "HTTP"];
  var ICONS = window.DEVTRENDS_ICONS;

  /* Strip pictographic emoji from external data too: the UI uses SVG icons. */
  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
  function esc(text) {
    return String(text).replace(EMOJI, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function wrap(cls, text) { return '<span class="' + cls + '">' + esc(text) + "</span>"; }

  function tokenizeLine(line, lang) {
    var out = "", i = 0;
    var keywords = KEYWORDS[lang] || KEYWORDS.ts;
    while (i < line.length) {
      var ch = line[i];

      /* line comments */
      if ((ch === "/" && line[i + 1] === "/") || (ch === "#" && lang === "bash")) {
        out += wrap("tok-cmt", line.slice(i));
        break;
      }
      /* strings (single, double, template) */
      if (ch === '"' || ch === "'" || ch === "`") {
        var quote = ch, j = i + 1;
        while (j < line.length) {
          if (line[j] === "\\") { j += 2; continue; }
          if (line[j] === quote) { j += 1; break; }
          j += 1;
        }
        out += wrap("tok-str", line.slice(i, j));
        i = j;
        continue;
      }
      /* numbers */
      if (/[0-9]/.test(ch)) {
        var k = i;
        while (k < line.length && /[0-9._]/.test(line[k])) k += 1;
        out += wrap("tok-num", line.slice(i, k));
        i = k;
        continue;
      }
      /* identifiers */
      if (/[A-Za-z_$]/.test(ch)) {
        var m = i;
        while (m < line.length && /[A-Za-z0-9_$]/.test(line[m])) m += 1;
        var word = line.slice(i, m);
        var next = line.slice(m).match(/^\s*\(/);
        if (keywords.indexOf(word) !== -1) out += wrap("tok-kw", word);
        else if (CONSTANTS.indexOf(word) !== -1) out += wrap("tok-const", word);
        else if (next) out += wrap("tok-fn", word);
        else out += esc(word);
        i = m;
        continue;
      }
      /* punctuation / operators */
      if (/[{}()[\].,;:=<>+\-*/|&!?]/.test(ch)) {
        out += wrap("tok-punct", ch);
        i += 1;
        continue;
      }
      out += esc(ch);
      i += 1;
    }
    return out;
  }

  function enhance(block) {
    var pre = block.querySelector("pre");
    var code = pre && pre.querySelector("code");
    if (!code || code.dataset.enhanced) return;
    var raw = code.textContent.replace(/\n+$/, "");
    var lang = block.getAttribute("data-lang") || "ts";
    var lines = raw.split("\n").map(function (line) {
      return '<span class="line">' + (tokenizeLine(line, lang) || " ") + "</span>";
    });
    code.innerHTML = lines.join("");
    code.dataset.enhanced = "1";
    code.dataset.raw = raw;

    var btn = block.querySelector("[data-copy]");
    if (btn) {
      if (ICONS) btn.innerHTML = ICONS.get("copy");
      btn.setAttribute("aria-label", "Copiar código");
      btn.addEventListener("click", function () {
        navigator.clipboard.writeText(raw).then(function () {
          if (ICONS) btn.innerHTML = ICONS.get("check");
          btn.setAttribute("aria-label", "Código copiado");
          setTimeout(function () {
            if (ICONS) btn.innerHTML = ICONS.get("copy");
            btn.setAttribute("aria-label", "Copiar código");
          }, 1600);
        }).catch(function () { /* clipboard unavailable */ });
      });
    }
  }

  function mount(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".code-block"), enhance);
  }

  window.DEVTRENDS_HIGHLIGHT = { mount: mount, esc: esc, tokenizeLine: tokenizeLine };
})();
