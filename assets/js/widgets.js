/* =========================================================================
   widgets.js — report rendering. Every displayed number goes through the
   vanilla Magic UI Number Ticker. Icons instead of emojis.
   ========================================================================= */
(function () {
  "use strict";

  var D = window.DEVTRENDS_DATA;
  var ICONS = window.DEVTRENDS_ICONS;
  var esc = window.DEVTRENDS_HIGHLIGHT.esc;

  function ticker(value, extra) {
    if (value === null || value === undefined || !isFinite(value)) return "&mdash;";
    var attrs = extra || "";
    return '<span class="mono ticker" data-ticker="' + Number(value) + '" ' + attrs + ">" + D.formatNumber(value) + "</span>";
  }

  function icon(name, cls) { return ICONS.get(name, cls); }

  var SOURCE_LABEL = {
    "github-api": "GitHub REST API",
    "github-html": "GitHub página pública",
    "stackoverflow-scrape": "scraping Stack Overflow",
    "stackexchange-api": "Stack Exchange API",
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
          '<div class="trend-meta"><span>relatório / ' + esc(r.tech.slug) + '</span><span>·</span><span>' +
            (ai.source === "gemini" ? "gemini: " + esc(ai.model || "") : "heurística local") + '</span></div>' +
          '<h2 class="trend-name">' + esc(r.tech.name) + '</h2>' +
          '<div style="margin-top:20px">' +
            '<span class="trend-badge ' + t.cls + '">' + icon(t.icon, "icon-sm") + t.label + '</span>' +
            '<span class="trend-prediction">' + esc(ai.previsao) + '</span>' +
          '</div>' +
          '<p class="trend-resume">' + esc(ai.resumo) + '</p>' +
          '<dl class="trend-stats">' +
            '<div><dt>GitHub ' + icon("star", "icon-sm") + '</dt><dd>' + ticker(g ? g.repo.stars : null) + '</dd></div>' +
            '<div><dt>Perguntas SO</dt><dd>' + ticker(so ? so.totalQuestions : null) + '</dd></div>' +
            '<div><dt>Sem resposta</dt><dd>' + ticker(so ? so.unansweredRate * 100 : null, 'data-decimals="1" data-suffix="%"') + '</dd></div>' +
          '</dl>' +
          '<div class="confidence"><span>confiança ' + ticker(conf, 'data-suffix="%"') + '</span>' +
            '<span class="hairline-bar"><i style="width:' + conf + '%"></i></span></div>' +
        '</div>' +
        gauge(ai.indiceVitalidade) +
      '</div></div>';
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
          '<div class="kv-row"><dt>Modelo</dt><dd>' + esc(r.ai.source === "gemini" ? r.ai.model : "heurística local") + '</dd></div>' +
          '<div class="kv-row"><dt>Tendência</dt><dd>' + esc(r.ai.tendencia) + '</dd></div>' +
          '<div class="kv-row"><dt>Confiança</dt><dd>' + ticker(Math.round(r.ai.confianca * 100), 'data-suffix="%"') + '</dd></div>' +
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
            '<span class="legend-item"><i class="rule" style="background:#C3E88D"></i> SO ' + ticker(last.questions) + '</span>' +
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
      '<div class="section-head"><h2 class="h2 headline two-tone" id="questions-h">Amostra raspada. <span>As perguntas mais recentes da tag.</span></h2>' +
      '<div class="detail"><p>' + list.length + ' perguntas coletadas para medir a frequência de dúvidas sem resposta.</p><p class="index">6.0 Amostra →</p></div></div>' +
      '<ul class="panel questions" style="margin-top:28px">' + items + '</ul></section>';
  }

  function sources(r) {
    var badges = Object.keys(r.sources).map(function (k) {
      return '<span class="source-badge">' + esc(k) + ' → ' + esc(SOURCE_LABEL[r.sources[k]] || r.sources[k]) + '</span>';
    }).join("");
    var warnings = r.warnings.map(function (w) {
      return '<li><span class="mark">!</span><span>' + esc(w) + '</span></li>';
    }).join("");
    var generated = new Date(r.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    return '<section class="section"><aside class="nested source-notice" aria-label="Proveniência dos dados">' +
      '<div class="source-badges"><span class="mono" style="font-size:12px;color:var(--tertiary)">proveniência:</span>' + badges +
      '<span class="source-time">gerado ' + esc(generated) + '</span></div>' +
      '<ul class="warnings">' + warnings + '</ul>' +
      '<div class="source-links">' +
        '<a class="btn-link" href="' + window.DEVTRENDS.config.githubApi + '/repos/' + esc(r.github ? r.github.repo.fullName : r.tech.repo) + '" target="_blank" rel="noopener noreferrer">GitHub cru ' + icon("arrowUpRight", "icon-sm") + '</a>' +
        '<a class="btn-link" href="' + esc(r.stackoverflow ? r.stackoverflow.tagUrl : "#") + '" target="_blank" rel="noopener noreferrer">Stack Overflow ' + icon("arrowUpRight", "icon-sm") + '</a>' +
      '</div></aside></section>';
  }

  function render(container, report) {
    container.innerHTML =
      trendCard(report) +
      analysis(report) +
      timeline(report) +
      metrics(report) +
      questions(report) +
      sources(report);
    window.DEVTRENDS_TICKER.mount(container);
    window.DEVTRENDS_HIGHLIGHT.mount(container);
  }

  function trendOnly(report) {
    var tags = report.ai.tags.slice(0, 4).map(function (tag) {
      var tone = tag.tone === "positivo" ? "pos" : tag.tone === "atencao" ? "warn" : "neu";
      return '<li class="health-tag ' + tone + '"><span aria-hidden="true">+</span><span>#' + esc(tag.label) + '</span></li>';
    }).join("");
    return trendCard(report) +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:16px">' +
        '<span class="mono" style="font-size:12px;color:var(--tertiary)">tags:</span>' +
        '<ul class="health-tags">' + tags + '</ul>' +
      '</div>';
  }

  window.DEVTRENDS_WIDGETS = { render: render, trendOnly: trendOnly, ticker: ticker, gauge: gauge };
})();
