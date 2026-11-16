/* =========================================================================
   widgets.js — report rendering. Every displayed number goes through the
   vanilla Magic UI Number Ticker. Icons instead of emojis.

   Gemini output is rendered as rich interface elements — never plain text:
   · Índice de Vitalidade  → animated gauge
   · Tendência              → colored badge with arrow icon
   · Score breakdown        → horizontal bar chart with proportional bars
   · Tags de saúde          → colored pill badges with tone indicators
   · Comparativo            → structured two-column table (fortes vs atenção)
   · Projeção               → risk/momentum indicator with horizon
   · Confiança              → progress bar with percentage
   · Recomendação           → highlighted callout with left border accent
   ========================================================================= */
(function () {
  "use strict";

  var D = window.DEVTRENDS_DATA;
  var ICONS = window.DEVTRENDS_ICONS;
  var esc = window.DEVTRENDS_HIGHLIGHT.esc;

  function getHome() {
    return document.body.getAttribute("data-home") || ".";
  }

  function geminiLogo(size, extraStyle) {
    var s = size || 16;
    var st = extraStyle ? ' style="' + extraStyle + '"' : '';
    return '<img class="gemini-icon-img" src="' + getHome() + '/assets/img/Google_Gemini_icon.svg" alt="Google Gemini" width="' + s + '" height="' + s + '"' + st + '>';
  }

  function soLogo(height, extraStyle) {
    var h = height || 13;
    var st = extraStyle ? ' style="' + extraStyle + '"' : '';
    return '<img class="so-logo-img" src="' + getHome() + '/assets/img/Stack_Overflow_logo.svg" alt="Stack Overflow" height="' + h + '"' + st + '>';
  }

  function devLogo(height, extraStyle) {
    var h = height || 13;
    var st = extraStyle ? ' style="' + extraStyle + '"' : '';
    return '<img class="so-logo-img" src="' + getHome() + '/assets/img/Dev_Logo.webp" alt="DEV Community" height="' + h + '"' + st + '>';
  }

  function hnLogo(size) {
    var s = size || 14;
    return '<svg class="hn-logo" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" role="img" aria-label="Hacker News" style="border-radius:3px;flex:none;vertical-align:-2px"><rect width="24" height="24" fill="#FF6600"/><path d="M10.6 13.9 6.4 6.5h2.3l2.6 4.9c.05.1.1.2.15.3h.02c.04-.1.09-.2.14-.3l2.7-4.9H17l-4.3 7.4v4.2h-2.1v-4.2z" fill="#fff"/></svg>';
  }

  function ticker(value, extra) {
    if (value === null || value === undefined || !isFinite(value)) return "&mdash;";
    var attrs = extra || "";
    return '<span class="mono ticker" data-ticker="' + Number(value) + '" ' + attrs + ">" + D.formatNumber(value) + "</span>";
  }

  function icon(name, cls) { return ICONS.get(name, cls); }

  var SOURCE_LABEL = {
    "github-api": "GitHub REST API",
    "github-html": "GitHub página pública",
    "stackexchange-api": "Stack Exchange API",
    "devto-scrape": "scraping DEV.TO (tools/scraper.mjs)",
    "devto-api": "DEV.TO API pública",
    "hn-algolia": "Hacker News API pública (Algolia)",
    demo: "dados de demonstração",
    "heuristica-local": "heurística local",
    gemini: "Gemini",
    indisponivel: "indisponível"
  };

  var TREND = {
    em_alta: { icon: "arrowUp", cls: "up", label: "Em ascensão" },
    estavel: { icon: "arrowRight", cls: "flat", label: "Estável" },
    em_queda: { icon: "arrowDown", cls: "down", label: "Em retração" }
  };

  var RISK = {
    baixo: { cls: "risk-low", label: "Baixo", color: "#C3E88D" },
    medio: { cls: "risk-medium", label: "Médio", color: "#FFCB6B" },
    alto: { cls: "risk-high", label: "Alto", color: "#F07178" }
  };

  var MOMENTUM = {
    positivo: { icon: "arrowUp", cls: "mom-pos", label: "Positivo", color: "#C3E88D" },
    neutro: { icon: "arrowRight", cls: "mom-neu", label: "Neutro", color: "#82AAFF" },
    negativo: { icon: "arrowDown", cls: "mom-neg", label: "Negativo", color: "#F07178" }
  };

  /* --- Gauge -------------------------------------------------------------- */
  function gauge(score) {
    var value = Math.max(0, Math.min(100, Math.round(score)));
    var color = value >= 70 ? "#C3E88D" : value >= 40 ? "#FFCB6B" : "#F07178";
    var arc = Math.PI * 100;
    var ticks = [0, 25, 50, 75, 100].map(function (t) {
      var a = Math.PI - t / 100 * Math.PI;
      return '<line x1="' + (120 + Math.cos(a) * 86) + '" y1="' + (112 - Math.sin(a) * 86) +
        '" x2="' + (120 + Math.cos(a) * 92) + '" y2="' + (112 - Math.sin(a) * 92) +
        '" stroke="#454B54" stroke-width="1"/>';
    }).join("");
    return '<div class="gauge-box">' +
      '<div class="gauge-wrap">' +
        '<svg viewBox="0 0 240 138" role="img" aria-label="Índice de Vitalidade ' + value + ' de 100">' +
          '<path d="M 20 112 A 100 100 0 0 1 220 112" fill="none" stroke="#2A2E37" stroke-width="10" stroke-linecap="round"/>' +
          '<path d="M 20 112 A 100 100 0 0 1 220 112" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (value / 100 * arc) + ' ' + arc + '"/>' +
          ticks +
          '<text x="16" y="134" fill="#7B818B" font-size="11" font-family="monospace">0</text>' +
          '<text x="224" y="134" text-anchor="end" fill="#7B818B" font-size="11" font-family="monospace">100</text>' +
        '</svg>' +
        '<div class="gauge-value">' + ticker(value) + '<span class="gauge-unit">/ 100</span></div>' +
      '</div>' +
      '<p class="gauge-caption">Índice de Vitalidade</p>' +
    '</div>';
  }

  /* --- Trend card --------------------------------------------------------- */
  function trendCard(r) {
    var ai = r.ai, g = r.github, so = r.stackoverflow;
    var t = TREND[ai.tendencia] || TREND.estavel;
    var conf = Math.round(ai.confianca * 100);
    return '<div class="frame trend-card">' +
      '<div class="panel trend-inner">' +
        '<div>' +
          '<div class="trend-meta"><span>relatório / ' + esc(r.tech.slug) + '</span><span>·</span><span style="display:inline-flex;align-items:center;gap:6px">' +
            (ai.source === "gemini" ? geminiLogo(14) + '<span>gemini: ' + esc(ai.model || "") + '</span>' : '<span>heurística local</span>') + '</span></div>' +
          '<h2 class="trend-name">' + esc(r.tech.name) + '</h2>' +
          '<div style="margin-top:20px">' +
            '<span class="trend-badge ' + t.cls + '">' + icon(t.icon, "icon-sm") + t.label + '</span>' +
            '<span class="trend-prediction">' + esc(ai.previsao) + '</span>' +
          '</div>' +
          '<p class="trend-resume">' + esc(ai.resumo) + '</p>' +
          '<dl class="trend-stats">' +
            '<div><dt>GitHub ' + icon("star", "icon-sm") + '</dt><dd>' + ticker(g ? g.repo.stars : null) + '</dd></div>' +
            '<div><dt style="display:inline-flex;align-items:center;gap:6px"><span>Perguntas</span> ' + soLogo(11) + '</dt><dd>' + ticker(so ? so.totalQuestions : null) + '</dd></div>' +
            '<div><dt>Sem resposta</dt><dd>' + ticker(so ? so.unansweredRate * 100 : null, 'data-decimals="1" data-suffix="%"') + '</dd></div>' +
          '</dl>' +
          '<div class="confidence"><span>confiança ' + ticker(conf, 'data-suffix="%"') + '</span>' +
            '<span class="hairline-bar"><i style="width:' + conf + '%"></i></span></div>' +
        '</div>' +
        gauge(ai.indiceVitalidade) +
      '</div></div>';
  }

  /* --- Score breakdown bar chart (NEW — rich UI for Gemini structured output) --- */
  function scoreBreakdown(r) {
    var bd = r.ai.scoreBreakdown;
    if (!bd) return "";
    var dims = [
      { key: "popularidade", label: "Popularidade", icon: "star", weight: "25%" },
      { key: "atividade", label: "Atividade", icon: "refresh", weight: "20%" },
      { key: "suporte", label: "Suporte", icon: "question", weight: "20%" },
      { key: "comunidade", label: "Comunidade", icon: "fork", weight: "15%" },
      { key: "adocao", label: "Adoção", icon: "fork", weight: "10%" },
      { key: "manutencao", label: "Manutenção", icon: "issue", weight: "10%" }
    ];
    var bars = dims.map(function (d) {
      var val = bd[d.key] !== undefined ? bd[d.key] : 0;
      var color = val >= 70 ? "#C3E88D" : val >= 40 ? "#FFCB6B" : "#F07178";
      return '<div class="breakdown-row">' +
        '<div class="breakdown-label"><span class="breakdown-icon">' + icon(d.icon, "icon-sm") + '</span>' +
          '<span>' + d.label + '</span><span class="breakdown-weight">' + d.weight + '</span></div>' +
        '<div class="breakdown-bar-wrap">' +
          '<div class="breakdown-bar" style="width:' + val + '%;background:' + color + '"></div>' +
        '</div>' +
        '<div class="breakdown-value">' + ticker(val) + '<span class="breakdown-unit">/100</span></div>' +
      '</div>';
    }).join("");
    return '<section class="section" aria-labelledby="breakdown-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="breakdown-h">Decomposição do índice. <span>Cada dimensão com peso e cor.</span></h2>' +
      '<div class="detail"><p>O Índice de Vitalidade é uma média ponderada de seis dimensões. As barras mostram a nota de cada uma, com cor indicando faixa: verde (70+), amarelo (40-69), vermelho (<40).</p><p class="index">2.1 Decomposição →</p></div></div>' +
      '<div class="breakdown-chart panel" style="margin-top:28px;padding:24px">' + bars + '</div>' +
    '</section>';
  }

  /* --- Projection indicator (NEW — risk, momentum, horizon) --- */
  function projection(r) {
    var proj = r.ai.projecao;
    if (!proj) return "";
    var risk = RISK[proj.risco] || RISK.medio;
    var mom = MOMENTUM[proj.momentum] || MOMENTUM.neutro;
    return '<section class="section" aria-labelledby="proj-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="proj-h">Projeção. <span>Risco, momentum e horizonte.</span></h2>' +
      '<div class="detail"><p>Avaliação direcional baseada nos dados de atividade e crescimento.</p><p class="index">2.2 Projeção →</p></div></div>' +
      '<div class="proj-grid" style="margin-top:28px">' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Horizonte</div>' +
          '<div class="proj-card-value">' + esc(proj.horizonte) + '</div>' +
        '</div>' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Risco</div>' +
          '<div class="proj-card-value ' + risk.cls + '">' +
            '<span class="risk-dot" style="background:' + risk.color + '"></span>' + risk.label +
          '</div>' +
        '</div>' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Momentum</div>' +
          '<div class="proj-card-value ' + mom.cls + '">' +
            icon(mom.icon, "icon-sm") + mom.label +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* --- Comparativo table (NEW — structured two-column layout) --- */
  function comparativo(r) {
    var comp = r.ai.comparativo;
    if (!comp) return "";
    var fortEl = (comp.pontosFortes || []).map(function (s) {
      return '<li class="comp-item pos">' + icon("arrowUp", "icon-sm") + '<span>' + esc(s) + '</span></li>';
    }).join("");
    var atenEl = (comp.pontosAtencao || []).map(function (s) {
      return '<li class="comp-item warn">' + icon("arrowDown", "icon-sm") + '<span>' + esc(s) + '</span></li>';
    }).join("");
    var altEl = (comp.alternativas || []).map(function (s) {
      var altTech = D.resolveTech(s);
      if (!altTech || !altTech.slug) return "";
      return '<a class="alt-chip" href="#analise" data-analyze-dispatch="' + esc(s) + '">' + icon("arrowRight", "icon-sm") + esc(s) + '</a>';
    }).join("");

    return '<section class="section" aria-labelledby="comp-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="comp-h">Comparativo. <span>Pontos fortes, pontos de atenção e alternativas.</span></h2>' +
      '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>Análise estruturada gerada pelo</span> ' + geminiLogo(14) + ' <span>Gemini a partir das métricas coletadas.</span></p><p class="index">2.3 Comparativo →</p></div></div>' +
      '<div class="comp-grid" style="margin-top:28px">' +
        '<div class="panel comp-col">' +
          '<h3 class="comp-title pos">' + icon("arrowUp", "icon-sm") + ' Pontos fortes</h3>' +
          '<ul class="comp-list">' + (fortEl || '<li class="comp-item empty">—</li>') + '</ul>' +
        '</div>' +
        '<div class="panel comp-col">' +
          '<h3 class="comp-title warn">' + icon("arrowDown", "icon-sm") + ' Pontos de atenção</h3>' +
          '<ul class="comp-list">' + (atenEl || '<li class="comp-item empty">—</li>') + '</ul>' +
        '</div>' +
      '</div>' +
      (altEl ? '<div class="alt-section" style="margin-top:16px"><span class="mono" style="font-size:12px;color:var(--tertiary)">alternativas sugeridas:</span><div class="alt-chips" style="margin-top:8px">' + altEl + '</div></div>' : '') +
    '</section>';
  }

  /* --- Health tags + analysis -------------------------------------------- */
  function analysis(r) {
    var tags = r.ai.tags.map(function (tag) {
      var tone = tag.tone === "positivo" ? "pos" : tag.tone === "atencao" ? "warn" : "neu";
      var mark = tone === "pos" ? "+" : tone === "warn" ? "!" : "·";
      return '<li class="health-tag ' + tone + '"><span aria-hidden="true">' + mark + '</span><span>#' + esc(tag.label) + '</span><span class="sr-only">(' + esc(tag.tone) + ')</span></li>';
    }).join("");
    return '<section class="split">' +
      '<div class="split-cell">' +
        '<h3 class="split-label">Tags de saúde</h3>' +
        '<ul class="health-tags">' + tags + '</ul>' +
        '<dl class="kv">' +
          '<div class="kv-row"><dt>Modelo</dt><dd style="display:inline-flex;align-items:center;gap:6px">' + (r.ai.source === "gemini" ? geminiLogo(14) : "") + '<span>' + esc(r.ai.source === "gemini" ? r.ai.model : "heurística local") + '</span></dd></div>' +
          '<div class="kv-row"><dt>Tendência</dt><dd>' + esc(r.ai.tendencia) + '</dd></div>' +
          '<div class="kv-row"><dt>Confiança</dt><dd>' + ticker(Math.round(r.ai.confianca * 100), 'data-suffix="%"') + '</dd></div>' +
          (r.ai.keyUsed ? '<div class="kv-row"><dt>Chave Gemini</dt><dd style="display:inline-flex;align-items:center;gap:6px">' + geminiLogo(14) + '<span>' + esc(r.ai.keyUsed) + '</span></dd></div>' : "") +
        '</dl>' +
      '</div>' +
      '<div class="split-cell">' +
        '<h3 class="split-label">Leitura dos números</h3>' +
        '<div class="analysis"><p>' + esc(r.ai.justificativa) + '</p>' +
        '<p class="highlight">' + esc(r.ai.recomendacao) + '</p>' +
        (r.github && r.github.repo.description ? '<p class="repo-desc"><span class="mono">' + esc(r.github.repo.fullName) + ':</span> ' + esc(r.github.repo.description) + '</p>' : "") +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* --- Timeline chart ----------------------------------------------------- */
  function timeline(r) {
    var W = 760, H = 260, LEFT = 54, RIGHT = 58, TOP = 18, BOTTOM = 38;
    var PW = W - LEFT - RIGHT, PH = H - TOP - BOTTOM;
    var pts = r.timeline, last = pts[pts.length - 1], hasGh = Boolean(r.github);
    function scale(values) {
      var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
      var span = Math.max(hi - lo, hi * 0.02, 1), pad = span * 0.18;
      return { min: Math.max(0, lo - pad), max: hi + pad };
    }
    var sa = scale(pts.map(function (p) { return p.stars; }));
    var qa = scale(pts.map(function (p) { return p.questions; }));
    var x = function (i) { return LEFT + i / Math.max(pts.length - 1, 1) * PW; };
    var y = function (v, a) { return TOP + (1 - (v - a.min) / (a.max - a.min)) * PH; };
    var sp = pts.map(function (p, i) { return x(i) + "," + y(p.stars, sa); }).join(" ");
    var qp = pts.map(function (p, i) { return x(i) + "," + y(p.questions, qa); }).join(" ");
    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (ratio) {
      var gy = TOP + (1 - ratio) * PH;
      return '<line x1="' + LEFT + '" y1="' + gy + '" x2="' + (W - RIGHT) + '" y2="' + gy + '" stroke="#1E2127" stroke-width="1"/>' +
        '<text x="' + (LEFT - 8) + '" y="' + (gy + 4) + '" text-anchor="end" fill="#7B818B" font-size="10" font-family="monospace">' + (hasGh ? D.formatCompact(sa.min + (sa.max - sa.min) * ratio) : "—") + '</text>' +
        '<text x="' + (W - RIGHT + 8) + '" y="' + (gy + 4) + '" fill="#7B818B" font-size="10" font-family="monospace">' + D.formatCompact(qa.min + (qa.max - qa.min) * ratio) + '</text>';
    }).join("");
    var labels = pts.map(function (p, i) {
      return '<text x="' + x(i) + '" y="' + (H - 14) + '" text-anchor="middle" fill="' + (p.estimated ? "#7B818B" : "#E6E8EB") + '" font-size="10" font-family="monospace">' + (p.label || "·") + '</text>';
    }).join("");
    var sample = D.summarizeStars(r.github);
    var note = !hasGh
      ? "O GitHub não respondeu: nenhuma série de estrelas foi estimada (não há total real de onde partir)."
      : sample.size > 0
        ? "A inclinação usa " + D.formatNumber(sample.size) + " eventos reais de stargazers em " + sample.days + " dia(s)."
        : "Sem amostragem de stargazers: a inclinação vem da idade do repositório.";
    var starLine = hasGh
      ? '<polyline points="' + sp + '" fill="none" stroke="#82AAFF" stroke-width="2" stroke-dasharray="4 4" stroke-opacity="0.7"/>' +
        '<polyline points="' + [x(pts.length - 2) + "," + y(pts[pts.length - 2].stars, sa), x(pts.length - 1) + "," + y(last.stars, sa)].join(" ") + '" fill="none" stroke="#82AAFF" stroke-width="2"/>' +
        '<circle cx="' + x(pts.length - 1) + '" cy="' + y(last.stars, sa) + '" r="4" fill="#82AAFF"/>'
      : "";

    return '<section class="section" aria-labelledby="timeline-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="timeline-h">Linha do tempo. <span>Onde os números vieram parar.</span></h2>' +
      '<div class="detail"><p>Estrelas do GitHub e perguntas no Stack Overflow em escalas independentes. A curva é calculada, não desenhada.</p><p class="index">4.0 Série histórica →</p></div></div>' +
      '<figure class="code-block timeline-figure" style="margin-top:28px">' +
        '<figcaption class="code-chrome"><span>timeline.js</span>' +
          '<span class="legend">' +
            '<span class="legend-item"><i class="rule" style="background:#82AAFF"></i> GitHub ' + (hasGh ? ticker(last.stars) : "indisponível") + '</span>' +
            '<span class="legend-item"><i class="rule" style="background:#C3E88D"></i> ' + soLogo(11) + ' ' + ticker(last.questions) + '</span>' +
          '</span><span class="lang">12 meses · pt-BR</span></figcaption>' +
        '<div class="code-body" style="padding:12px"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolução estimada de estrelas e perguntas em 12 meses">' +
          grid +
          starLine +
          '<polyline points="' + qp + '" fill="none" stroke="#C3E88D" stroke-width="2" stroke-dasharray="4 4" stroke-opacity="0.7"/>' +
          '<polyline points="' + [x(pts.length - 2) + "," + y(pts[pts.length - 2].questions, qa), x(pts.length - 1) + "," + y(last.questions, qa)].join(" ") + '" fill="none" stroke="#C3E88D" stroke-width="2"/>' +
          '<circle cx="' + x(pts.length - 1) + '" cy="' + y(last.questions, qa) + '" r="4" fill="#C3E88D"/>' +
          labels +
          '<text x="' + LEFT + '" y="' + (H - 2) + '" fill="#454B54" font-size="9" font-family="monospace">escala esquerda: estrelas</text>' +
          '<text x="' + (W - RIGHT) + '" y="' + (H - 2) + '" text-anchor="end" fill="#454B54" font-size="9" font-family="monospace">escala direita: perguntas</text>' +
        '</svg></div>' +
        '<div class="timeline-note"><span class="mono">fonte:</span> 11 pontos estimados a partir dos totais reais de hoje; o ponto final é real. ' + esc(note) + ' Tracejado = estimativa, contínuo = trecho real.</div>' +
        (hasGh ? "" : '<div class="timeline-note"><span class="mono">aviso:</span> série de estrelas omitida por falta de resposta do GitHub; nenhum valor foi substituído por zero.</div>') +
      '</figure></section>';
  }

  /* --- Metric table ------------------------------------------------------- */
  function metrics(r) {
    var g = r.github && r.github.repo, so = r.stackoverflow;
    var counts = [g ? g.stars : 0, g ? g.forks : 0, g ? g.openIssues : 0, g ? g.watchers : 0,
      so ? so.totalQuestions : 0, so ? so.totalUnanswered : 0, r.github ? r.github.sampleSize : 0, so ? so.sampleSize : 0];
    var max = Math.max.apply(null, counts.concat([1]));
    function ratio(v) { return Math.max(2, Math.round(v / max * 100)); }
    function row(label, value, valueAttrs, origin, bar) {
      return '<tr><th scope="row">' + label + '</th><td class="num">' + (value === null ? "&mdash;" : ticker(value, valueAttrs)) + '</td>' +
        '<td>' + (bar === null ? '<span class="mono" style="font-size:12px;color:var(--disabled)">n/a</span>' : '<span class="hairline-bar"><i style="width:' + bar + '%"></i></span>') + '</td>' +
        '<td class="origin">' + origin + '</td></tr>';
    }
    var rows = [
      row("Estrelas no GitHub", g ? g.stars : null, "", "GitHub REST", ratio(g ? g.stars : 0)),
      row("Forks", g ? g.forks : null, "", "GitHub REST", ratio(g ? g.forks : 0)),
      row("Issues abertas (inclui PRs)", g ? g.openIssues : null, "", "GitHub REST", ratio(g ? g.openIssues : 0)),
      row("Watchers", g ? g.watchers : null, "", "GitHub REST", ratio(g ? g.watchers : 0)),
      row("Dias desde o último push", r.github ? r.github.daysSincePush : null, "", "GitHub REST", null),
      row("Amostragem real de stargazers", r.github ? r.github.sampleSize : null, "", "GitHub REST", ratio(r.github ? r.github.sampleSize : 0)),
      row("Total de perguntas na tag", so ? so.totalQuestions : null, "", so && so.source === "demo" ? "demo" : "Stack Exchange", ratio(so ? so.totalQuestions : 0)),
      row("Perguntas sem resposta", so ? so.totalUnanswered : null, "", so && so.source === "demo" ? "demo" : "Stack Exchange", ratio(so ? so.totalUnanswered : 0)),
      row("Taxa geral sem resposta", so ? so.unansweredRate * 100 : null, 'data-decimals="1" data-suffix="%"', so && so.source === "demo" ? "demo" : "Stack Exchange", so ? Math.round(so.unansweredRate * 100) : null),
      row("Sem resposta na amostra recente", so && so.sampleSize ? so.sampleUnansweredRate * 100 : null, 'data-decimals="1" data-suffix="%"', "scraping / API", so && so.sampleSize ? Math.round(so.sampleUnansweredRate * 100) : null),
      row("Perguntas recentes analisadas", so ? so.sampleSize : null, "", "scraping / API", ratio(so ? so.sampleSize : 0))
    ].join("");
    return '<section class="section" aria-labelledby="metrics-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="metrics-h">Os números, sem interpretação. <span>Cada linha com a sua origem.</span></h2>' +
      '<div class="detail"><p>As barras de 1px são proporcionais ao maior valor do grupo, calculadas no cliente.</p><p class="index">5.0 Métricas →</p></div></div>' +
      '<div class="table-wrap" style="margin-top:28px"><table><thead><tr><th>Métrica</th><th class="num">Valor</th><th>Proporção</th><th>Origem</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</section>';
  }

  /* --- Recent questions + provenance -------------------------------------- */
  function questions(r) {
    var list = r.stackoverflow ? r.stackoverflow.recentQuestions : [];
    if (!list.length) return "";
    var items = list.slice(0, 8).map(function (q) {
      return '<li class="question-row">' +
        '<span class="state ' + (q.unanswered ? "open" : "answered") + '">' + (q.unanswered ? "sem resposta" : q.answers + " resp.") + '</span>' +
        '<a href="' + esc(q.url) + '" target="_blank" rel="noopener noreferrer">' + esc(q.title) + '</a>' +
        '<span class="votes">' + q.votes + ' votos</span>' +
        (q.askedAt ? '<span class="date">' + new Date(q.askedAt).toLocaleDateString("pt-BR") + '</span>' : "") +
        '</li>';
    }).join("");
    return '<section class="section" aria-labelledby="questions-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="questions-h">Amostra ' + soLogo(16) + '. <span>As perguntas mais recentes da tag.</span></h2>' +
      '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>' + list.length + ' perguntas coletadas no</span> ' + soLogo(12) + ' <span>via Stack Exchange API, para medir a frequência de dúvidas sem resposta.</span></p><p class="index">6.0 Amostra →</p></div></div>' +
      '<ul class="panel questions" style="margin-top:28px">' + items + '</ul></section>';
  }

  /* --- DEV.TO: project's own scraping + sample ------------------------------ */
  function devtoSection(r) {
    var dt = r.devto ? r.devto : null;
    if (!dt) return "";
    var process = 'Processo: <code class="inline-code">' + esc(dt.homeUrl || "https://dev.to/") + '</code> (publicações recentes) · ' +
      '<code class="inline-code">/trending</code> (tags em alta, posts em 7 dias) · ' +
      '<code class="inline-code">/search?q=' + esc(dt.tag) + '</code> (busca; cai para <code class="inline-code">/t/' + esc(dt.tag) + '</code>) — via <a href="' + esc(dt.tagUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(dt.tagUrl) + '</a>';
    var trendingTag = dt.trending && dt.trending.tagInTrending
      ? '<li class="health-tag pos"><span aria-hidden="true">+</span><span>#' + esc(dt.tag) + ' em alta no trending · ' + (dt.trending.postsLast7Days || "?") + ' posts/7d</span></li>'
      : "";
    var list = (dt.recentQuestions || []).slice(0, 8);
    var body = list.length
      ? '<ul class="panel questions" style="margin-top:28px">' + list.map(function (p) {
          return '<li class="question-row">' +
            '<span class="state ' + (p.unanswered ? "open" : "answered") + '">' + (p.unanswered ? "sem comentários" : p.answers + " coment.") + '</span>' +
            '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.title) + '</a>' +
            '<span class="votes">' + p.votes + ' reactions</span>' +
            (p.askedAt ? '<span class="date">' + new Date(p.askedAt).toLocaleDateString("pt-BR") + '</span>' : "") +
            '</li>';
        }).join("") + '</ul>'
      : '<div class="status-line" style="margin-top:28px">' + icon("info", "icon-sm") + '<span>' + esc(dt.note || "Nenhuma publicação recuperada do DEV.TO.") + '</span></div>';
    return '<section class="section" aria-labelledby="devto-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="devto-h">DEV.TO ' + devLogo(16) + '. <span>' + (dt.source === "devto-scrape" ? "Raspado na hora pelo scraper do projeto." : "Publicações da tag, via API pública do dev.to.") + '</span></h2>' +
      '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>' + process + '</span></p><p class="index">7.0 DEV.TO →</p></div></div>' +
      (trendingTag ? '<ul class="health-tags" style="margin-top:16px">' + trendingTag + '</ul>' : "") +
      body +
      '</section>';
  }

  /* --- Hacker News: buzz via Algolia Search API ----------------------------- */
  function hnSection(r) {
    var hn = r.hn ? r.hn : null;
    if (!hn) return "";
    var process = 'Processo: <code class="inline-code">' + esc(hn.siteUrl) + '</code> (front page em HTML estático) · ' +
      '<code class="inline-code">hn.algolia.com/api/v1/search_by_date</code> (busca por data, menções em títulos) — via <a href="' + esc(hn.searchUrl) + '" target="_blank" rel="noopener noreferrer">busca do HN por "' + esc(hn.query) + '"</a>';
    var delta = hn.deltaPct === null ? null : hn.deltaPct;
    var deltaEl = delta === null
      ? '<span class="mono" style="font-size:12px;color:var(--disabled)">sem base de comparação</span>'
      : delta > 0
        ? '<span class="trend-badge up">' + icon("arrowUp", "icon-sm") + '+' + delta + '% vs. semana anterior</span>'
        : delta < 0
          ? '<span class="trend-badge down">' + icon("arrowDown", "icon-sm") + delta + '% vs. semana anterior</span>'
          : '<span class="trend-badge flat">' + icon("arrowRight", "icon-sm") + '0% vs. semana anterior</span>';
    var fp = hn.frontPage;
    var fpTag = !fp || !fp.posts
      ? ""
      : fp.matches > 0
        ? '<li class="health-tag pos"><span aria-hidden="true">+</span><span>#na front page do HN agora (' + fp.matches + ' de ' + fp.posts + ' posts)</span></li>'
        : '<li class="health-tag neu"><span aria-hidden="true">·</span><span>#fora da front page do HN agora (' + fp.posts + ' posts no ar)</span></li>';
    if (hn.source !== "hn-algolia") {
      return '<section class="section" aria-labelledby="hn-h">' +
        '<div class="section-head"><h2 class="h2 headline two-tone" id="hn-h">HACKER NEWS ' + hnLogo(16) + '. <span>Buzz da comunidade.</span></h2>' +
        '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>' + process + '</span></p><p class="index">8.0 HACKER NEWS →</p></div></div>' +
        '<div class="status-line" style="margin-top:28px">' + icon("info", "icon-sm") + '<span>' + esc(hn.note || "Dados do Hacker News indisponíveis.") + '</span></div>' +
        '</section>';
    }
    var list = (hn.recentPosts || []).slice(0, 8);
    var body = list.length
      ? '<ul class="panel questions" style="margin-top:28px">' + list.map(function (p) {
          return '<li class="question-row">' +
            '<span class="state ' + (p.unanswered ? "open" : "answered") + '">' + (p.unanswered ? "sem comentários" : p.answers + " coment.") + '</span>' +
            '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.title) + '</a>' +
            '<span class="votes">' + p.points + ' pontos</span>' +
            (p.askedAt ? '<span class="date">' + new Date(p.askedAt).toLocaleDateString("pt-BR") + '</span>' : "") +
            '</li>';
        }).join("") + '</ul>'
      : '<div class="status-line" style="margin-top:28px">' + icon("info", "icon-sm") + '<span>Nenhum título mencionou "' + esc(hn.query) + '" nos últimos 7 dias.</span></div>';
    return '<section class="section" aria-labelledby="hn-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="hn-h">HACKER NEWS ' + hnLogo(16) + '. <span>Buzz da comunidade, medido em menções a títulos.</span></h2>' +
      '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>' + process + '</span></p><p class="index">8.0 HACKER NEWS →</p></div></div>' +
      '<div class="proj-grid" style="margin-top:28px">' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Títulos na última semana ' + hnLogo(12) + '</div>' +
          '<div class="proj-card-value">' + ticker(hn.titlesLast7d) + '</div>' +
        '</div>' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Semana anterior</div>' +
          '<div class="proj-card-value">' + ticker(hn.titlesPrev7d) + '</div>' +
        '</div>' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Variação (buzz)</div>' +
          '<div class="proj-card-value">' + deltaEl + '</div>' +
        '</div>' +
      '</div>' +
      (fpTag ? '<ul class="health-tags" style="margin-top:16px">' + fpTag + '</ul>' : "") +
      body +
      '<div class="timeline-note" style="margin-top:12px"><span class="mono">métrica:</span> posts (stories) cujo título menciona "' + esc(hn.query) + '", contados na API pública de busca do Hacker News; comparação semana a semana indica aceleração do interesse. Cada janela cobre até 1.000 posts.</div>' +
      '</section>';
  }

  function githubNotice(r) {
    if (r.github) return "";
    var isRateLimit = r.githubError && (r.githubError.indexOf("403") !== -1 || r.githubError.indexOf("rate limit") !== -1 || r.githubError.indexOf("cota") !== -1);
    var title = isRateLimit ? "Limite de requisições do GitHub atingido (HTTP 403)" : "Dados do GitHub indisponíveis";
    var desc = isRateLimit
      ? "A cota não autenticada da API pública do GitHub (60 req/h por IP) foi esgotada. Para continuar analisando sem restrições (5.000 req/h), adicione um GitHub Token pessoal (gratuito) no painel Config."
      : "A API do GitHub não respondeu no momento. A análise abaixo foi calculada com os dados do Stack Overflow e heurística/Gemini.";

    return '<div class="github-limit-notice panel" style="margin-top:20px;padding:16px 20px;border-left:3px solid var(--const);background:var(--surface)">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">' +
        '<div>' +
          '<div style="font-weight:600;color:var(--const);font-size:13px;display:flex;align-items:center;gap:6px">' +
            icon("alert", "icon-sm") + ' <span>' + esc(title) + '</span>' +
          '</div>' +
          '<p style="margin-top:6px;font-size:12px;color:var(--secondary);line-height:1.5">' + esc(desc) + '</p>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary" data-open-config style="height:32px;padding:0 14px;font-size:12px;cursor:pointer">Abrir Config</button>' +
      '</div></div>';
  }

  function sources(r) {
    var badges = Object.keys(r.sources || {}).map(function (k) {
      return '<span class="source-badge">' + esc(k) + ' → ' + esc(SOURCE_LABEL[r.sources[k]] || r.sources[k]) + '</span>';
    }).join("");
    var warnings = (r.warnings || []).map(function (w) {
      return '<li><span class="mark">!</span><span>' + esc(w) + '</span></li>';
    }).join("");
    var generated = new Date(r.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    var ghRepoName = r.github && r.github.repo ? r.github.repo.fullName : r.tech.repo;
    var ghApiLink = ghRepoName ? window.DEVTRENDS.config.githubApi + '/repos/' + esc(ghRepoName) : '';
    var ghWebLink = ghRepoName ? 'https://github.com/' + esc(ghRepoName) : '';
    var soLink = r.stackoverflow && r.stackoverflow.tagUrl ? esc(r.stackoverflow.tagUrl) : '#';
    var dtLink = r.devto && r.devto.tagUrl ? esc(r.devto.tagUrl) : '';
    var hnLink = r.hn && r.hn.searchUrl && r.hn.source === "hn-algolia" ? esc(r.hn.searchUrl) : '';

    return '<section class="section"><aside class="nested source-notice" aria-label="Proveniência dos dados">' +
      '<div class="source-badges"><span class="mono" style="font-size:12px;color:var(--tertiary)">proveniência:</span>' + badges +
      '<span class="source-time">gerado ' + esc(generated) + '</span></div>' +
      '<ul class="warnings">' + warnings + '</ul>' +
      '<div class="source-links">' +
        (ghWebLink ? '<a class="btn-link" href="' + ghWebLink + '" target="_blank" rel="noopener noreferrer">GitHub repo ' + icon("arrowUpRight", "icon-sm") + '</a>' : '') +
        (ghApiLink ? '<a class="btn-link" href="' + ghApiLink + '" target="_blank" rel="noopener noreferrer">GitHub REST ' + icon("arrowUpRight", "icon-sm") + '</a>' : '') +
        '<a class="btn-link" href="' + soLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px">' + soLogo(13) + ' ' + icon("arrowUpRight", "icon-sm") + '</a>' +
        (dtLink ? '<a class="btn-link" href="' + dtLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px">' + devLogo(13) + ' ' + icon("arrowUpRight", "icon-sm") + '</a>' : '') +
        (hnLink ? '<a class="btn-link" href="' + hnLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px">' + hnLogo(13) + ' ' + icon("arrowUpRight", "icon-sm") + '</a>' : '') +
      '</div></aside></section>';
  }

  function render(container, report) {
    container.innerHTML =
      githubNotice(report) +
      trendCard(report) +
      scoreBreakdown(report) +
      projection(report) +
      comparativo(report) +
      analysis(report) +
      timeline(report) +
      metrics(report) +
      questions(report) +
      devtoSection(report) +
      hnSection(report) +
      sources(report);
    window.DEVTRENDS_TICKER.mount(container);
    window.DEVTRENDS_HIGHLIGHT.mount(container);
  }

  window.DEVTRENDS_WIDGETS = { render: render, ticker: ticker, gauge: gauge };
})();
