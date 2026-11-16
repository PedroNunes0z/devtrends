/* =========================================================================
   generate-pages.mjs — build-time only, zero dependencies.
   Generates index.html, reports/<slug>.html, sitemap.xml and robots.txt.
   The shipped site itself is pure HTML + CSS + Vanilla JS (no build needed).

   Run: node tools/generate-pages.mjs
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = "https://pedronunes0z.github.io/devtrends";
const REPO = "https://github.com/PedroNunes0z/devtrends";

const CATALOG = [
  { slug: "react", name: "React", soTag: "reactjs", repo: "facebook/react", blurb: "Biblioteca de interfaces declarativas" },
  { slug: "vue-js", name: "Vue.js", soTag: "vue.js", repo: "vuejs/core", blurb: "Framework progressivo de interfaces" },
  { slug: "next-js", name: "Next.js", soTag: "next.js", repo: "vercel/next.js", blurb: "Framework React com rendering híbrido" },
  { slug: "typescript", name: "TypeScript", soTag: "typescript", repo: "microsoft/TypeScript", blurb: "Tipagem estática sobre JavaScript" },
  { slug: "python", name: "Python", soTag: "python", repo: "python/cpython", blurb: "Linguagem de propósito geral" },
  { slug: "rust", name: "Rust", soTag: "rust", repo: "rust-lang/rust", blurb: "Sistemas com segurança de memória" },
  { slug: "go", name: "Go", soTag: "go", repo: "golang/go", blurb: "Linguagem compilada e concorrente" },
  { slug: "svelte", name: "Svelte", soTag: "svelte", repo: "sveltejs/svelte", blurb: "Compilador de interfaces reativas" },
  { slug: "angular", name: "Angular", soTag: "angular", repo: "angular/angular", blurb: "Framework corporativo de aplicações" },
  { slug: "node-js", name: "Node.js", soTag: "node.js", repo: "nodejs/node", blurb: "Runtime JavaScript no servidor" },
  { slug: "tailwind-css", name: "Tailwind CSS", soTag: "tailwind-css", repo: "tailwindlabs/tailwindcss", blurb: "Framework CSS utilitário" },
  { slug: "astro", name: "Astro", soTag: "astro", repo: "withastro/astro", blurb: "Gerador de sites orientado a conteúdo" },
  { slug: "bun", name: "Bun", soTag: "bun", repo: "oven-sh/bun", blurb: "Runtime e toolkit JavaScript" },
  { slug: "deno", name: "Deno", soTag: "deno", repo: "denoland/deno", blurb: "Runtime TypeScript seguro por padrão" },
  { slug: "nest-js", name: "NestJS", soTag: "nestjs", repo: "nestjs/nest", blurb: "Framework Node.js opinativo" },
  { slug: "django", name: "Django", soTag: "django", repo: "django/django", blurb: "Framework web Python" },
  { slug: "flutter", name: "Flutter", soTag: "flutter", repo: "flutter/flutter", blurb: "Toolkit multiplataforma de UI" },
  { slug: "kotlin", name: "Kotlin", soTag: "kotlin", repo: "JetBrains/kotlin", blurb: "Linguagem JVM e multiplataforma" },
  { slug: "swift", name: "Swift", soTag: "swift", repo: "swiftlang/swift", blurb: "Linguagem do ecossistema Apple" },
  { slug: "spring-boot", name: "Spring Boot", soTag: "spring-boot", repo: "spring-projects/spring-boot", blurb: "Framework Java para serviços" },
  { slug: "laravel", name: "Laravel", soTag: "laravel", repo: "laravel/framework", blurb: "Framework PHP para aplicações web" },
  { slug: "kubernetes", name: "Kubernetes", soTag: "kubernetes", repo: "kubernetes/kubernetes", blurb: "Orquestração de contêineres" },
  { slug: "docker", name: "Docker", soTag: "docker", repo: "docker/cli", blurb: "Contêineres e empacotamento" },
  { slug: "postgresql", name: "PostgreSQL", soTag: "postgresql", repo: "postgres/postgres", blurb: "Banco de dados relacional" },
  { slug: "graphql", name: "GraphQL", soTag: "graphql", repo: "graphql/graphql-js", blurb: "Linguagem de consulta para APIs" },
  { slug: "pytorch", name: "PyTorch", soTag: "pytorch", repo: "pytorch/pytorch", blurb: "Framework de aprendizado profundo" },
  { slug: "tensorflow", name: "TensorFlow", soTag: "tensorflow", repo: "tensorflow/tensorflow", blurb: "Plataforma de machine learning" }
];
const POPULAR = ["react", "vue-js", "next-js", "typescript", "python", "rust", "go", "svelte", "angular", "node-js", "tailwind-css", "astro", "bun", "kubernetes", "pytorch"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* --- Real code samples --------------------------------------------------- */
const HERO_CODE = `const repo = await fetch(
  "https://api.github.com/repos/vuejs/core"
).then((r) => r.json());

const tag = await fetch(
  "https://api.stackexchange.com/2.3/tags/vue.js/info?site=stackoverflow"
).then((r) => r.json());

// structured output: nota, tendência e tags de saúde
const report = await DEVTRENDS_DATA.getInsights("Vue.js");
console.log(report.ai.indiceVitalidade, report.ai.tags);
console.log(repo.stargazers_count, tag.items[0].count);`;

const GH_CODE = `curl -s "https://api.github.com/repos/vuejs/core" \\
  | jq '{stars: .stargazers_count,
         forks: .forks_count,
         issues: .open_issues_count,
         pushed: .pushed_at}'`;

const SO_CODE = `const tag = "vue.js";
const totals = await fetch(
  \`https://api.stackexchange.com/2.3/tags/\${tag}/info?site=stackoverflow\`
).then((r) => r.json());
// tools/scraper.mjs raspa a página quando roda em localhost
console.log(totals.items[0].count);`;

const AI_CODE = `{
  "responseMimeType": "application/json",
  "responseSchema": {
    "type": "OBJECT",
    "properties": {
      "indiceVitalidade": { "type": "INTEGER" },
      "tendencia": { "type": "STRING",
        "enum": ["em_alta", "estavel", "em_queda"] },
      "tags": { "type": "ARRAY",
        "items": { "type": "OBJECT" } }
    }
  }
}`;

const FEATURES = [
  { title: "Três fontes, um número", body: "GitHub REST, Stack Overflow e interpretação do Gemini em uma única resposta, montada no navegador.", code: "DEVTRENDS_DATA.getInsights(\"rust\")" },
  { title: "Origem em cada valor", body: "Cada widget declara a origem e sinaliza quando a cota pública esgotou ou o scraping foi bloqueado.", code: "sources.github = \"github-api\"" },
  { title: "Páginas indexáveis", body: "Cada tecnologia tem HTML estático com metadata, canonical, JSON-LD de Dataset e Open Graph.", code: "reports/vue-js.html" },
  { title: "Sem chave, ainda útil", body: "Sem chave Gemini a nota vem de uma heurística determinística, explicitamente rotulada na interface.", code: "ai.source = \"heuristica-local\"" },
  { title: "Números animados", body: "Port vanilla do Number Ticker do Magic UI: spring, uma vez por viewport, respeitando reduced-motion.", code: "<span data-ticker=\"55039\">" },
  { title: "Fundo ditherizado", body: "Port vanilla do Dither Field em WebGL2 ocupando a página inteira, com frame estático e fallback CSS.", code: "assets/js/dither-field.js" }
];

const SPECS = [
  { endpoint: "GitHub REST", method: "GET", source: "api.github.com", auth: "token opcional", cache: "60 min" },
  { endpoint: "Stack Exchange", method: "GET", source: "api.stackexchange.com/2.3", auth: "key opcional", cache: "60 min" },
  { endpoint: "Scraper local", method: "GET", source: "127.0.0.1:8787 (opcional)", auth: "nenhuma", cache: "—" },
  { endpoint: "Gemini", method: "POST", source: "generativelanguage.googleapis.com", auth: "chave no painel", cache: "—" }
];

const FAQ = [
  { q: "O que é o Índice de Vitalidade?", a: "Uma nota de 0 a 100 que combina popularidade no GitHub (estrelas, forks, atividade recente) com suporte da comunidade no Stack Overflow (volume de dúvidas e taxa de perguntas sem resposta). O Gemini interpreta os dados e devolve a nota, a tendência e as tags de saúde." },
  { q: "De onde vêm os dados?", a: "Da GitHub REST API, da Stack Exchange API e, quando você roda tools/scraper.mjs localmente, de scraping da página de perguntas do Stack Overflow. Cada widget exibe a origem e avisa quando um dado é estimado." },
  { q: "O histórico do gráfico é real?", a: "O ponto final de cada série é o valor real atual. A curva histórica é modelada a partir desse total, da idade do repositório e da velocidade real dos últimos stargazers. O gráfico identifica o que é estimativa." },
  { q: "Preciso de chaves de API?", a: "Não. GitHub e Stack Overflow funcionam nas cotas públicas. Sem chave Gemini o relatório usa uma heurística local determinística, sinalizada na interface. As chaves ficam apenas no localStorage do seu navegador." }
];

/* --- Shared markup ------------------------------------------------------- */
const SCRIPTS = (asset) => `
<script src="${asset}/assets/js/config.js"></script>
<script src="${asset}/assets/js/icons.js"></script>
<script src="${asset}/assets/js/dither-field.js"></script>
<script src="${asset}/assets/js/number-ticker.js"></script>
<script src="${asset}/assets/js/highlight.js"></script>
<script src="${asset}/assets/js/data.js"></script>
<script src="${asset}/assets/js/widgets.js"></script>
<script src="${asset}/assets/js/app.js"></script>`;

function head({ title, description, canonical, jsonld, asset, ogTitle }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="popularidade de tecnologias, tendências de frameworks, índice de vitalidade, GitHub stars, Stack Overflow, escolher stack, tech trends">
<meta name="theme-color" content="#0A0B0D">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="DevTrends Insights">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/assets/img/og-default.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle || title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="icon" href="${asset}/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${asset}/assets/css/styles.css">
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
</head>`;
}

function chrome(base, isReport) {
  const root = isReport ? "../index.html" : "index.html";
  const anchor = (id) => (isReport ? root + "#" + id : "#" + id);
  const report = (slug) => (isReport ? slug + ".html" : "reports/" + slug + ".html");
  return {
    nav: `<header class="nav"><div class="wrap nav-inner">
  <a class="wordmark" href="${root}"><span class="dot"></span>devtrends<span class="slash">/</span>insights</a>
  <nav class="nav-links" aria-label="Navegação principal">
    <a href="${anchor("analisar")}">Analisar</a>
    <a href="${anchor("como-funciona")}">Como funciona</a>
    <a href="${anchor("fontes")}">Fontes</a>
    <a href="${anchor("tecnologias")}">Tecnologias</a>
    <a class="nav-api" href="${REPO}" target="_blank" rel="noopener noreferrer">código-fonte <span data-icon="arrowUpRight" data-icon-class="icon-sm"></span></a>
  </nav>
  <button id="config-toggle" class="config-btn" type="button" aria-label="Configurar chaves de API"></button>
  <a class="nav-cta" href="${anchor("analisar")}">Consultar</a>
</div></header>
<div class="wrap"><div id="config-panel" class="nested config-panel">
  <label>Chave Gemini (Google AI Studio)<input type="password" name="geminiApiKey" placeholder="AIza…" autocomplete="off"><span class="hint">Opcional. Sem ela, a análise usa a heurística local.</span></label>
  <label>GitHub token (aumenta a cota de 60 para 5.000 req/h)<input type="password" name="githubToken" placeholder="ghp_…" autocomplete="off"><span class="hint">Opcional, somente leitura de dados públicos.</span></label>
  <label>Stack Exchange key<input type="password" name="stackexchangeKey" placeholder="opcional" autocomplete="off"><span class="hint">Opcional. Fica apenas neste navegador (localStorage), nunca no repositório.</span></label>
  <button type="button" class="btn btn-primary" data-config-save style="height:38px">Salvar e recarregar</button>
</div></div>`,
    footer: `<footer class="footer"><div class="wrap footer-grid">
  <div><p class="footer-title">devtrends/insights</p><p class="prose" style="margin-top:12px">Índice de Vitalidade para decidir o que estudar ou qual stack adotar, com dados que você pode verificar.</p><p class="footer-meta">v2.0.0 · vanilla JS · MIT · pt-BR</p></div>
  <div><p class="footer-label">Páginas</p><ul>
    <li><a href="${root}">Início</a></li>
    <li><a href="${report("react")}">React</a></li>
    <li><a href="${report("vue-js")}">Vue.js</a></li>
    <li><a href="${report("rust")}">Rust</a></li>
    <li><a href="${anchor("fontes")}">Fontes de dados</a></li>
  </ul></div>
  <div><p class="footer-label">Projeto</p><ul>
    <li><a href="${REPO}" target="_blank" rel="noopener noreferrer">Repositório no GitHub</a></li>
    <li><a href="${REPO}#readme" target="_blank" rel="noopener noreferrer">README / instalação</a></li>
    <li><a href="${anchor("como-funciona")}">Como funciona</a></li>
    <li><a href="${SITE}/sitemap.xml">sitemap.xml</a></li>
  </ul></div>
</div>
<div class="footer-bottom"><div class="wrap" style="max-width:var(--wrap)"><div class="footer-bottom-inner">
  <span>api.github.com</span><span>api.stackexchange.com</span><span>Google Gemini</span>
  <span class="push">HTML + CSS + Vanilla JS · GitHub Pages</span>
</div></div></div></footer>`
  };
}

function codeBlock(code, filename, lang, label, extraClass) {
  return `<figure class="code-block ${extraClass || ""}" data-lang="${lang}">
  <figcaption class="code-chrome"><span>${esc(filename)}</span><span class="lang">${esc(label)}</span><button class="copy-btn" data-copy type="button"></button></figcaption>
  <div class="code-body scroll-fade"><pre><code>${esc(code)}</code></pre></div>
</figure>`;
}

function searchForm(defaultValue) {
  return `<div class="search" data-search-scope>
  <form class="search-row" data-search-form role="search">
    <label class="sr-only" for="tech-query">Nome da tecnologia</label>
    <div class="input-shell"><span class="prompt" aria-hidden="true">$</span><input id="tech-query" name="tech" type="text" placeholder="vue.js, rust, next.js…" maxlength="80" autocomplete="off" value="${esc(defaultValue || "")}"></div>
    <button class="btn btn-primary" type="submit">Analisar <span data-icon="arrowRight" data-icon-class="icon-sm"></span></button>
  </form>
  <div class="suggestions"><span class="label">sugestões:</span>
    ${["React", "Vue.js", "Rust", "TypeScript", "Bun", "Kubernetes"].map((n) => `<button type="button" class="chip" data-tech="${esc(n)}">${esc(n)}</button>`).join("")}
  </div>
</div>`;
}

function shell(body, opts) {
  const c = chrome(opts.base, opts.isReport);
  return `${head(opts)}
<body data-page="${opts.page}" data-home="${opts.home}"${opts.tech ? ` data-tech="${esc(opts.tech)}"` : ""}>
<canvas id="dither-bg" class="dither-bg" aria-hidden="true"></canvas>
<div id="dither-fallback" class="dither-fallback" aria-hidden="true" style="display:none"></div>
<div class="page">
${c.nav}
<main id="conteudo">${body}</main>
${c.footer}
</div>
${SCRIPTS(opts.asset)}
</body>
</html>
`;
}

/* --- Landing page -------------------------------------------------------- */
function landingBody() {
  const pipeline = [
    { step: "01", file: "github.js", color: "var(--kw)", desc: "Repositório principal, estrelas, forks, issues e amostragem real dos últimos stargazers.", code: GH_CODE, lang: "bash", label: "shell" },
    { step: "02", file: "stackoverflow.js", color: "var(--str)", desc: "Totais e amostra de perguntas recentes da tag. Em localhost, um scraper próprio raspa a página; no Pages, a Stack Exchange API assume.", code: SO_CODE, lang: "js", label: "JavaScript" },
    { step: "03", file: "gemini.js", color: "var(--fn)", desc: "Structured output: nota, tendência, justificativa e tags com tipos garantidos por responseSchema.", code: AI_CODE, lang: "json", label: "JSON" }
  ].map((p) => `<div class="pipeline-row">
  <div><p class="step" style="color:${p.color}">${p.step} · ${esc(p.file)}</p><p class="step-desc" style="margin-top:10px">${esc(p.desc)}</p></div>
  <div class="step-code">${codeBlock(p.code, p.file, p.lang, p.label)}</div>
</div>`).join("");

  return `
<section class="hero wrap" id="analisar">
  <p class="eyebrow">github × stack overflow × gemini</p>
  <h1 class="h1 two-tone">Escolha a próxima tecnologia com dados. <span>Meça popularidade, atividade e suporte da comunidade.</span></h1>
  <div class="hero-sub">
    <p class="prose">Digite um nome como <code class="inline-code">Vue.js</code> e receba um Índice de Vitalidade, uma previsão de tendência e as tags de saúde da comunidade.</p>
    <div style="margin-top:24px">${searchForm("")}</div>
    <p class="footer-meta" style="margin-top:20px"><span data-ticker="${CATALOG.length}">${CATALOG.length}</span> tecnologias no catálogo · qualquer outra via GitHub Search</p>
  </div>
  <div class="hero-code">
    <div class="frame">
      ${codeBlock(HERO_CODE, "devtrends.js", "js", "JavaScript")}
      <div class="code-status"><span class="method">GET</span><span>api.github.com / api.stackexchange.com</span><span class="status">200 · application/json</span></div>
    </div>
    <p class="code-caption"><span data-icon="arrowUp" data-icon-class="icon-sm"></span> a chamada real da API, com as funções usadas pela interface</p>
  </div>
</section>

<section class="quickstart"><div class="wrap quickstart-inner">
  <span class="label">quickstart</span>
  <div class="command"><span class="prompt">$</span><code>git clone ${REPO}.git &amp;&amp; cd devtrends &amp;&amp; python -m http.server 8080</code><button type="button" data-copy-command="git clone ${REPO}.git &amp;&amp; cd devtrends &amp;&amp; python -m http.server 8080" aria-label="Copiar comando"></button></div>
  <a class="btn-link" href="${REPO}#readme" target="_blank" rel="noopener noreferrer">README <span data-icon="arrowUpRight" data-icon-class="icon-sm"></span></a>
</div></section>

<section class="section wrap">
  <div class="sample-head"><h2 class="h2 two-tone">Um relatório de verdade. <span>React, consultado agora.</span></h2>
    <a class="btn-link" href="reports/react.html">abrir relatório completo <span data-icon="arrowRight" data-icon-class="icon-sm"></span></a></div>
  <div id="live-sample"></div>
</section>

<section class="section wrap" id="como-funciona">
  <div class="section-head">
    <h2 class="h2 headline two-tone">Em Três chamadas. <span>Nenhum número inventado no caminho.</span></h2>
    <div class="detail"><p>Cada etapa expõe o comando que a executa. Os contêineres ficam empilhados, um abaixo do outro, na ordem do pipeline.</p><p class="index">1.0 Pipeline →</p></div>
  </div>
  <div class="pipeline">${pipeline}</div>
</section>

<section class="section wrap" id="fontes">
  <div class="section-head">
    <h2 class="h2 headline two-tone">Rotas e cotas. <span>O que cada consulta custa.</span></h2>
    <div class="detail"><p>O GitHub permite 60 requisições por hora sem token e 5.000 com token. A Stack Exchange API aceita 300 por dia sem chave. Nada roda em servidor: tudo é chamado pelo seu navegador.</p><p class="index"><a href="sitemap.xml">baixar sitemap →</a></p></div>
  </div>
  <div class="table-wrap" style="margin-top:28px"><table><thead><tr><th>Fonte</th><th>Método</th><th>Endpoint</th><th>Autenticação</th><th>Cache</th></tr></thead><tbody>
    ${SPECS.map((s) => `<tr><th scope="row" class="mono" style="font-size:13px">${esc(s.endpoint)}</th><td class="mono" style="color:var(--fn);font-size:12px">${s.method}</td><td>${esc(s.source)}</td><td class="origin">${esc(s.auth)}</td><td class="origin">${esc(s.cache)}</td></tr>`).join("")}
  </tbody></table></div>
</section>

<section class="section wrap">
  <div class="sample-head"><h2 class="h2 two-tone">O que está implementado. <span>Sem slide de marketing.</span></h2><span class="eyebrow">3.0 Capacidades →</span></div>
  <div class="feature-grid">${FEATURES.map((f) => `<div class="feature-cell"><h3 class="h3">${esc(f.title)}</h3><p>${esc(f.body)}</p><code>${esc(f.code)}</code></div>`).join("")}</div>
</section>

<section class="section wrap" id="tecnologias">
  <div class="section-head"><h2 class="h2 headline two-tone">Relatórios prontos. <span>Cada tecnologia, uma URL indexável.</span></h2>
    <div class="detail"><p>Páginas HTML estáticas com metadata, canonical, JSON-LD de Dataset e Open Graph. Crawlers leem o conteúdo sem executar JavaScript.</p><p class="index">4.0 Índice →</p></div></div>
  <div class="tech-grid" style="margin-top:28px">${POPULAR.map((slug) => {
    const t = CATALOG.find((x) => x.slug === slug);
    return `<div class="tech-row"><a href="reports/${slug}.html">${esc(t.name)}</a><span class="repo">${esc(t.repo)}</span></div>`;
  }).join("")}</div>
</section>

<section class="section wrap">
  <div class="faq-grid"><div><h2 class="h2 two-tone">Perguntas frequentes. <span>Inclusive sobre o que não é real.</span></h2></div>
  <dl class="faq-list">${FAQ.map((f) => `<div class="faq-item"><dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd></div>`).join("")}</dl></div>
</section>

<section class="section wrap"><div class="nested cta">
  <div><p style="font-size:22px;font-weight:500;margin:0">Consulte uma tecnologia.</p><p class="prose" style="margin:4px 0 0">A resposta é a mesma que as APIs entregam, com a origem de cada número.</p></div>
  <div class="actions"><a class="btn btn-primary" href="reports/vue-js.html">Ver Vue.js <span data-icon="arrowRight" data-icon-class="icon-sm"></span></a><a class="btn btn-ghost" href="${REPO}" target="_blank" rel="noopener noreferrer">Código-fonte <span data-icon="github" data-icon-class="icon-sm"></span></a></div>
</div></section>`;
}

/* --- Report page --------------------------------------------------------- */
function reportBody(tech) {
  return `<div class="wrap">
<nav class="breadcrumb" aria-label="Breadcrumb"><a href="../index.html">início</a><span>/</span><span>insights</span><span>/</span><span style="color:var(--fg)">${esc(tech.slug)}</span></nav>
<div class="report-head">
  <div><h1 class="h1 two-tone">${esc(tech.name)}: vitalidade e tendência. <span>Dados do GitHub, do Stack Overflow e uma leitura do Gemini.</span></h1></div>
  <div><p class="prose">Relatório verificável: cada número abaixo vem de uma API pública ou de scraping, e a origem é exibida ao lado do valor.</p>
    <div style="margin-top:20px">${searchForm(tech.name)}</div></div>
</div>
<div id="report"></div>
</div>`;
}

/* --- Write --------------------------------------------------------------- */
mkdirSync(join(ROOT, "reports"), { recursive: true });

const homeJsonld = [
  { "@context": "https://schema.org", "@type": "WebSite", name: "DevTrends Insights", url: SITE + "/", inLanguage: "pt-BR",
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: SITE + "/reports/{search_term_string}.html" }, "query-input": "required name=search_term_string" } },
  { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "DevTrends Insights", applicationCategory: "DeveloperApplication", operatingSystem: "Web", url: SITE + "/", description: "Índice de Vitalidade de tecnologias a partir de dados reais do GitHub e do Stack Overflow", offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" } },
  { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
];

writeFileSync(join(ROOT, "index.html"), shell(landingBody(), {
  page: "home", home: ".", asset: ".", isReport: false,
  title: "DevTrends Insights — Analisador de Popularidade de Tecnologias",
  description: "Descubra se uma tecnologia está em ascensão antes de investir nela. Índice de Vitalidade calculado com estrelas, forks e issues do GitHub, volume de perguntas e taxa de resolução do Stack Overflow, interpretados pelo Gemini.",
  canonical: SITE + "/", jsonld: homeJsonld
}));

for (const t of CATALOG) {
  const description = `${t.name} em números: estrelas e forks no GitHub, volume de perguntas e taxa sem resposta no Stack Overflow, Índice de Vitalidade e previsão de tendência gerada por IA. ${t.blurb}.`;
  const jsonld = [
    { "@context": "https://schema.org", "@type": "Dataset", name: `Análise de popularidade: ${t.name}`, description,
      url: `${SITE}/reports/${t.slug}.html`, inLanguage: "pt-BR", license: "https://creativecommons.org/licenses/by/4.0/",
      creator: { "@type": "Organization", name: "DevTrends Insights" },
      variableMeasured: ["GitHub stars", "GitHub forks", "GitHub open issues", "Stack Overflow total de perguntas", "Stack Overflow taxa sem resposta", "Índice de Vitalidade"] },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: t.name, item: `${SITE}/reports/${t.slug}.html` }
    ] }
  ];
  writeFileSync(join(ROOT, "reports", t.slug + ".html"), shell(reportBody(t), {
    page: "report", home: "..", asset: "..", isReport: true, tech: t.slug,
    title: `${t.name}: tendência, popularidade e saúde da comunidade | DevTrends Insights`,
    description, canonical: `${SITE}/reports/${t.slug}.html`, jsonld
  }));
}

const today = new Date().toISOString().slice(0, 10);
const urls = [{ loc: SITE + "/", priority: "1.0", freq: "daily" }]
  .concat(CATALOG.map((t) => ({ loc: `${SITE}/reports/${t.slug}.html`, priority: POPULAR.includes(t.slug) ? "0.8" : "0.6", freq: "weekly" })));
writeFileSync(join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>
`);

writeFileSync(join(ROOT, "robots.txt"), `User-agent: *
Allow: /
Sitemap: ${SITE}/sitemap.xml
`);
writeFileSync(join(ROOT, ".nojekyll"), "");

console.log(`Generated: index.html, ${CATALOG.length} report pages, sitemap.xml, robots.txt, .nojekyll`);
