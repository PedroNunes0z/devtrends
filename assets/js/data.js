/* =========================================================================
   data.js — client-side data layer. No server, no dependencies.

   Sources:
     · GitHub REST API            (CORS enabled; optional token)
     · tools/scraper.mjs          (optional local scraping API, only on localhost)
     · Stack Exchange API v2.3    (CORS enabled; fallback for SO totals/sample)
     · Google Gemini              (structured output; key entered in the UI)

   Every layer degrades explicitly: the report always shows where each number
   came from and flags estimates. Nothing is silently invented.
   ========================================================================= */
(function () {
  "use strict";

  var CFG = window.DEVTRENDS.config;

  /* --- Catalogue --------------------------------------------------------- */
  var CATALOG = [
    { slug: "react", name: "React", soTag: "reactjs", repo: "facebook/react", aliases: ["reactjs", "react.js"], blurb: "Biblioteca de interfaces declarativas" },
    { slug: "vue-js", name: "Vue.js", soTag: "vue.js", repo: "vuejs/core", aliases: ["vue", "vuejs", "vue 3"], blurb: "Framework progressivo de interfaces" },
    { slug: "next-js", name: "Next.js", soTag: "next.js", repo: "vercel/next.js", aliases: ["next", "nextjs"], blurb: "Framework React com rendering híbrido" },
    { slug: "typescript", name: "TypeScript", soTag: "typescript", repo: "microsoft/TypeScript", aliases: ["ts"], blurb: "Tipagem estática sobre JavaScript" },
    { slug: "python", name: "Python", soTag: "python", repo: "python/cpython", aliases: ["py", "python3"], blurb: "Linguagem de propósito geral" },
    { slug: "rust", name: "Rust", soTag: "rust", repo: "rust-lang/rust", aliases: ["rustlang"], blurb: "Sistemas com segurança de memória" },
    { slug: "go", name: "Go", soTag: "go", repo: "golang/go", aliases: ["golang"], blurb: "Linguagem compilada e concorrente" },
    { slug: "svelte", name: "Svelte", soTag: "svelte", repo: "sveltejs/svelte", aliases: ["sveltekit", "svelte.js"], blurb: "Compilador de interfaces reativas" },
    { slug: "angular", name: "Angular", soTag: "angular", repo: "angular/angular", aliases: ["angularjs"], blurb: "Framework corporativo de aplicações" },
    { slug: "node-js", name: "Node.js", soTag: "node.js", repo: "nodejs/node", aliases: ["node", "nodejs"], blurb: "Runtime JavaScript no servidor" },
    { slug: "tailwind-css", name: "Tailwind CSS", soTag: "tailwind-css", repo: "tailwindlabs/tailwindcss", aliases: ["tailwind", "tailwindcss"], blurb: "Framework CSS utilitário" },
    { slug: "astro", name: "Astro", soTag: "astro", repo: "withastro/astro", aliases: ["astrojs"], blurb: "Gerador de sites orientado a conteúdo" },
    { slug: "bun", name: "Bun", soTag: "bun", repo: "oven-sh/bun", aliases: ["bunjs"], blurb: "Runtime e toolkit JavaScript" },
    { slug: "deno", name: "Deno", soTag: "deno", repo: "denoland/deno", aliases: ["denojs"], blurb: "Runtime TypeScript seguro por padrão" },
    { slug: "nest-js", name: "NestJS", soTag: "nestjs", repo: "nestjs/nest", aliases: ["nest", "nestjs"], blurb: "Framework Node.js opinativo" },
    { slug: "django", name: "Django", soTag: "django", repo: "django/django", aliases: ["django-rest"], blurb: "Framework web Python" },
    { slug: "flutter", name: "Flutter", soTag: "flutter", repo: "flutter/flutter", aliases: ["dart"], blurb: "Toolkit multiplataforma de UI" },
    { slug: "kotlin", name: "Kotlin", soTag: "kotlin", repo: "JetBrains/kotlin", aliases: ["kt"], blurb: "Linguagem JVM e multiplataforma" },
    { slug: "swift", name: "Swift", soTag: "swift", repo: "swiftlang/swift", aliases: ["swiftui"], blurb: "Linguagem do ecossistema Apple" },
    { slug: "spring-boot", name: "Spring Boot", soTag: "spring-boot", repo: "spring-projects/spring-boot", aliases: ["spring", "springboot"], blurb: "Framework Java para serviços" },
    { slug: "laravel", name: "Laravel", soTag: "laravel", repo: "laravel/framework", aliases: ["laravelphp"], blurb: "Framework PHP para aplicações web" },
    { slug: "kubernetes", name: "Kubernetes", soTag: "kubernetes", repo: "kubernetes/kubernetes", aliases: ["k8s"], blurb: "Orquestração de contêineres" },
    { slug: "docker", name: "Docker", soTag: "docker", repo: "docker/cli", aliases: ["containerd"], blurb: "Contêineres e empacotamento" },
    { slug: "postgresql", name: "PostgreSQL", soTag: "postgresql", repo: "postgres/postgres", aliases: ["postgres", "pg"], blurb: "Banco de dados relacional" },
    { slug: "graphql", name: "GraphQL", soTag: "graphql", repo: "graphql/graphql-js", aliases: ["gql"], blurb: "Linguagem de consulta para APIs" },
    { slug: "pytorch", name: "PyTorch", soTag: "pytorch", repo: "pytorch/pytorch", aliases: ["torch"], blurb: "Framework de aprendizado profundo" },
    { slug: "tensorflow", name: "TensorFlow", soTag: "tensorflow", repo: "tensorflow/tensorflow", aliases: ["tf"], blurb: "Plataforma de machine learning" }
  ];

  var POPULAR = ["react", "vue-js", "next-js", "typescript", "python", "rust", "go", "svelte", "angular", "node-js", "tailwind-css", "astro", "bun", "kubernetes", "pytorch"];

  function slugify(input) {
    return String(input || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim().replace(/[._]/g, "-").replace(/[^a-z0-9+#-]+/g, "-")
      .replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 60);
  }
  function compact(input) { return slugify(input).replace(/-/g, ""); }

  function resolveTech(input) {
    var raw = String(input || "").trim().slice(0, 80);
    if (!raw) return CATALOG[0];
    var slug = slugify(raw);
    var bySlug = CATALOG.filter(function (t) { return t.slug === slug; })[0];
    if (bySlug) return bySlug;
    var needle = compact(raw);
    var byAlias = CATALOG.filter(function (t) {
      return compact(t.name) === needle || compact(t.slug) === needle ||
        t.aliases.some(function (a) { return compact(a) === needle; });
    })[0];
    if (byAlias) return byAlias;
    return {
      slug: slug, name: raw.slice(0, 40),
      soTag: raw.toLowerCase().replace(/\s+/g, "-").replace(/[^\w.+#-]/g, "").slice(0, 40) || slug,
      repo: "", aliases: [], blurb: "Tecnologia consultada sob demanda"
    };
  }

  function formatNumber(value, locale) {
    return new Intl.NumberFormat(locale || "pt-BR").format(Math.round(Number(value) || 0));
  }
  function formatCompact(value) {
    return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi === undefined ? 100 : hi, Math.max(lo === undefined ? 0 : lo, v)); }

  /* --- HTTP with timeout + localStorage cache ---------------------------- */
  function request(url, options) {
    options = options || {};
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, options.timeoutMs || CFG.timeoutMs);
    return fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body || undefined,
      signal: controller.signal,
      mode: "cors",
      credentials: "omit"
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status + " em " + new URL(url).host);
      return res.json();
    }).catch(function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  function cacheKey(url) { return "devtrends.cache." + url; }
  function readCache(url) {
    try {
      var raw = localStorage.getItem(cacheKey(url));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (Date.now() - entry.t > CFG.cacheTtlMinutes * 60000) return null;
      return entry.data;
    } catch (e) { return null; }
  }
  function writeCache(url, data) {
    try { localStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), data: data })); } catch (e) { /* quota */ }
  }
  function cachedJson(url, options) {
    var hit = readCache(url);
    if (hit) return Promise.resolve(hit);
    return request(url, options).then(function (data) { writeCache(url, data); return data; });
  }

  function seUrl(path, params) {
    var query = new URLSearchParams(Object.assign({ site: "stackoverflow" }, params || {}));
    if (CFG.stackexchangeKey) query.set("key", CFG.stackexchangeKey);
    return CFG.stackexchangeApi + path + "?" + query.toString();
  }

  /* --- GitHub ------------------------------------------------------------ */
  function ghHeaders(accept) {
    var h = { Accept: accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    /* Browser fetch forbids User-Agent; the token is the only auth header. */
    if (CFG.githubToken) h.Authorization = "Bearer " + CFG.githubToken;
    return h;
  }

  function findRepo(tech) {
    if (tech.repo) return Promise.resolve(tech.repo);
    var q = encodeURIComponent(tech.name + " in:name");
    return cachedJson(CFG.githubApi + "/search/repositories?q=" + q + "&sort=stars&order=desc&per_page=5", { headers: ghHeaders() })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) throw new Error("nenhum repositório encontrado");
        var exact = items.filter(function (i) { return compact(i.name) === compact(tech.name); })[0];
        return (exact || items[0]).full_name;
      });
  }

  function sampleStars(fullName, stars) {
    var lastPage = Math.max(1, Math.min(Math.ceil(stars / 100), 400));
    var pages = [];
    for (var p = Math.max(1, lastPage - CFG.stargazerSamplePages + 1); p <= lastPage; p++) pages.push(p);
    return Promise.all(pages.map(function (page) {
      return cachedJson(CFG.githubApi + "/repos/" + fullName + "/stargazers?per_page=100&page=" + page,
        { headers: ghHeaders("application/vnd.github.star+json") }).catch(function () { return []; });
    })).then(function (results) {
      var byDay = {}, size = 0;
      results.forEach(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (entry) {
          if (!entry.starred_at) return;
          var day = entry.starred_at.slice(0, 10);
          byDay[day] = (byDay[day] || 0) + 1;
          size += 1;
        });
      });
      return {
        size: size,
        sample: Object.keys(byDay).sort().map(function (d) { return { date: d, count: byDay[d] }; })
      };
    });
  }

  function getGithub(tech) {
    return findRepo(tech).then(function (fullName) {
      return cachedJson(CFG.githubApi + "/repos/" + fullName, { headers: ghHeaders() }).then(function (r) {
        return {
          source: "github-api",
          repo: {
            fullName: r.full_name, url: r.html_url, description: r.description,
            language: r.language, stars: r.stargazers_count, forks: r.forks_count,
            openIssues: r.open_issues_count, watchers: r.subscribers_count,
            createdAt: r.created_at, pushedAt: r.pushed_at,
            license: r.license && r.license.spdx_id, topics: r.topics || [],
            archived: r.archived, ownerAvatar: r.owner && r.owner.avatar_url
          },
          sampleSize: 0, starSample: [],
          daysSincePush: Math.max(0, Math.floor((Date.now() - new Date(r.pushed_at).getTime()) / 86400000)),
          note: ""
        };
      }).then(function (data) {
        return sampleStars(data.repo.fullName, data.repo.stars).then(function (s) {
          data.sampleSize = s.size;
          data.starSample = s.sample;
          return data;
        });
      });
    }).catch(function (error) {
      console.warn("[github]", error.message);
      return null;
    });
  }

  /* --- Stack Overflow: optional local scraper + Stack Exchange API ------- */
  function fromApiQuestions(tech) {
    return cachedJson(seUrl("/questions", {
      tagged: tech.soTag, sort: "creation", order: "desc", pagesize: String(CFG.soSampleSize)
    })).then(function (data) {
      return (data.items || []).map(function (q) {
        return {
          title: q.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
          url: q.link, answers: q.answer_count, votes: q.score,
          views: q.view_count || null,
          askedAt: new Date(q.creation_date * 1000).toISOString(),
          unanswered: q.answer_count === 0
        };
      });
    });
  }

  function fromLocalScraper(tech) {
    if (!window.DEVTRENDS.isLocal()) return Promise.resolve(null);
    var url = CFG.scraperLocal + "?tag=" + encodeURIComponent(tech.soTag) + "&limit=" + CFG.soSampleSize;
    return request(url, { timeoutMs: 2500 }).catch(function () { return null; });
  }

  function apiTotals(tech) {
    return cachedJson(seUrl("/tags/" + encodeURIComponent(tech.soTag) + "/info", {}))
      .then(function (info) {
        var total = info.items && info.items[0] && info.items[0].count ? info.items[0].count : 0;
        return cachedJson(seUrl("/questions/unanswered", { tagged: tech.soTag, filter: "total" }))
          .catch(function () { return cachedJson(seUrl("/search/advanced", { tagged: tech.soTag, answers: "0", filter: "total" })); })
          .then(function (u) { return { total: total, unanswered: u.total || 0 }; });
      });
  }

  function demoData(tech) {
    var seed = tech.soTag.split("").reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
    var total = 12000 + (seed * 7919) % 480000;
    var unanswered = Math.round(total * (0.18 + (seed % 17) / 100));
    return {
      source: "demo", tag: tech.soTag,
      tagUrl: CFG.stackOverflow + "/questions/tagged/" + encodeURIComponent(tech.soTag),
      totalQuestions: total, totalUnanswered: unanswered,
      unansweredRate: unanswered / total, sampleSize: 0,
      sampleUnansweredRate: 0, recentQuestions: [],
      note: "Dados de demonstração: as APIs públicas não responderam."
    };
  }

  function getStackOverflow(tech) {
    var base = { tag: tech.soTag, tagUrl: CFG.stackOverflow + "/questions/tagged/" + encodeURIComponent(tech.soTag) };
    return Promise.all([
      apiTotals(tech).catch(function (e) { console.warn("[se-totals]", e.message); return null; }),
      fromLocalScraper(tech).catch(function () { return null; })
    ]).then(function (results) {
      var totals = results[0];
      var scraped = results[1];
      var questions = scraped && Array.isArray(scraped.recentQuestions) ? scraped.recentQuestions : [];
      var usedScraper = questions.length > 0;
      var usedApiSample = false;

      if (!usedScraper) {
        return fromApiQuestions(tech).catch(function (e) {
          console.warn("[se-questions]", e.message);
          return [];
        }).then(function (list) {
          questions = list;
          usedApiSample = list.length > 0;
          return finish();
        });
      }
      return finish();

      function finish() {
        var open = questions.filter(function (q) { return q.unanswered; }).length;
        var sampleRate = questions.length ? open / questions.length : 0;
        if (!totals && !questions.length) return Object.assign(base, demoData(tech));
        var total = totals ? totals.total : (scraped && scraped.totalQuestions) || 0;
        var unanswered = totals ? totals.unanswered : Math.round(total * sampleRate);
        var notes = [];
        if (usedScraper) notes.push("Amostra obtida pelo scraper local (tools/scraper.mjs).");
        else if (usedApiSample) notes.push("Scraping indisponível no navegador (CORS/Cloudflare): amostra via Stack Exchange API.");
        else notes.push("Amostra de perguntas recentes indisponível.");
        if (!totals) notes.push("Totais estimados a partir da amostra disponível.");

        return Object.assign(base, {
          source: usedScraper ? "stackoverflow-scrape" : "stackexchange-api",
          totalQuestions: total,
          totalUnanswered: Math.min(unanswered, total),
          unansweredRate: total > 0 ? Math.min(1, unanswered / total) : sampleRate,
          sampleSize: questions.length,
          sampleUnansweredRate: sampleRate,
          recentQuestions: questions,
          note: notes.join(" ")
        });
      }
    }).catch(function () { return Object.assign(base, demoData(tech)); });
  }

  /* --- Timeline (computed from real totals, not drawn) ------------------- */
  function summarizeStars(github) {
    if (!github || !github.sampleSize || !github.starSample.length) {
      return { size: 0, days: 0, from: null, to: null, monthlyVelocity: null };
    }
    var from = github.starSample[0].date, to = github.starSample[github.starSample.length - 1].date;
    var days = Math.max(1, Math.ceil((new Date(to) - new Date(from)) / 86400000) + 1);
    return { size: github.sampleSize, days: days, from: from, to: to, monthlyVelocity: github.sampleSize / days * 30 };
  }

  function monthKeys(now) {
    var out = [], fmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
    for (var off = 11; off >= 0; off--) {
      var d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - off, 1));
      out.push({
        key: d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"),
        label: fmt.format(d).replace(".", ""), date: d
      });
    }
    return out;
  }
  function growth(total, monthlyVelocity, ageYears) {
    if (total <= 0) return 0.2;
    if (monthlyVelocity > 0) return clamp(monthlyVelocity * 12 / total, 0.08, 0.85);
    if (ageYears > 0) return clamp(0.9 / (1 + ageYears), 0.08, 0.7);
    return 0.2;
  }
  function questionVelocity(so, now) {
    if (!so) return null;
    var dates = so.recentQuestions.map(function (q) { return q.askedAt ? new Date(q.askedAt).getTime() : NaN; })
      .filter(function (t) { return isFinite(t); });
    if (dates.length < 2) return null;
    var span = Math.max(1, (now.getTime() - Math.min.apply(null, dates)) / 86400000);
    return dates.length / span * 30;
  }

  function buildTimeline(github, so) {
    var now = new Date(), keys = monthKeys(now), sample = summarizeStars(github);
    var age = github ? (now - new Date(github.repo.createdAt)) / (365.25 * 86400000) : null;
    var starsTotal = github ? github.repo.stars : 0;
    var questionsTotal = so ? so.totalQuestions : 0;
    var gs = growth(starsTotal, sample.monthlyVelocity, age);
    var gq = growth(questionsTotal, questionVelocity(so, now), null);
    return keys.map(function (k, i) {
      var shape = Math.pow(i / 11, 1.4);
      return {
        month: k.key, label: (i % 2 === 0 || i === 11) ? k.label : "",
        stars: Math.round(starsTotal * (1 - gs + gs * shape)),
        questions: Math.round(questionsTotal * (1 - gq + gq * shape)),
        estimated: i < 11
      };
    });
  }

  /* --- Gemini / heuristic ------------------------------------------------- */
  var SCHEMA = {
    type: "OBJECT",
    properties: {
      indiceVitalidade: { type: "INTEGER" },
      tendencia: { type: "STRING", enum: ["em_alta", "estavel", "em_queda"] },
      previsao: { type: "STRING" },
      resumo: { type: "STRING" },
      justificativa: { type: "STRING" },
      recomendacao: { type: "STRING" },
      confianca: { type: "NUMBER" },
      tags: { type: "ARRAY", items: { type: "OBJECT", properties: { label: { type: "STRING" }, tone: { type: "STRING", enum: ["positivo", "atencao", "neutro"] } }, required: ["label", "tone"] } }
    },
    required: ["indiceVitalidade", "tendencia", "previsao", "resumo", "justificativa", "recomendacao", "confianca", "tags"]
  };

  var SYSTEM = "Você é um analista de engenharia de software. Recebe métricas REAIS do GitHub e do Stack Overflow e produz um Índice de Vitalidade (0-100) para ajudar a decidir o que estudar ou qual stack adotar. Regras: escreva em português do Brasil, tom técnico e direto, sem marketing; baseie cada afirmação nos números; se um dado faltar, reduza a confiança e diga isso; não invente números ou datas; popularidade não é saúde (atividade, volume de dúvidas e taxa de resolução pesam mais); use escala logarítmica; 'previsao' deve ser um rótulo curto; 'tags' de 4 a 6 itens curtos, sem espaços, misturando pontos fortes e de atenção. Responda SOMENTE com o JSON do schema.";

  function heuristic(tech, github, so) {
    var stars = github ? github.repo.stars : 0;
    var forks = github ? github.repo.forks : 0;
    var issues = github ? github.repo.openIssues : 0;
    /* No GitHub response means "unknown", never "0 stars / 365 days". */
    var days = github ? github.daysSincePush : null;
    var totalQ = so ? so.totalQuestions : 0;
    var unanswered = so ? so.unansweredRate : 0.5;
    var sample = summarizeStars(github);
    function log(v, ceiling) { return clamp(Math.log10(Math.max(v, 1)) / Math.log10(ceiling) * 100, 0, 100); }
    var parts = {
      popularidade: log(stars, 250000) * 0.25,
      adocao: log(forks, 60000) * 0.1,
      atividade: github ? clamp(100 - days / 180 * 100, 0, 100) * 0.2 : 0,
      manutencao: github ? clamp(100 - issues / Math.max(stars, 1) * 600, 0, 100) * 0.1 : 0,
      comunidade: log(totalQ, 2000000) * 0.15,
      suporte: clamp(100 - unanswered * 180, 0, 100) * 0.2
    };
    var score = Math.round(clamp(Object.keys(parts).reduce(function (a, k) { return a + parts[k]; }, 0), 0, 100));
    var velocity = sample.monthlyVelocity || 0;
    var growing = github && velocity > Math.max(30, stars * 0.004) && days < 60;
    var declining = github && (days > 365 || github.repo.archived);
    var trend = declining ? "em_queda" : growing ? "em_alta" : "estavel";
    var previsao = declining ? "Em retração: manutenção irregular" : growing ? "Tecnologia em ascensão" : score > 72 ? "Madura e estável" : "Adoção moderada";
    var tags = [];
    if (so && totalQ > 100000) tags.push({ label: "ComunidadeAtiva", tone: "positivo" });
    if (github && stars > 40000) tags.push({ label: "EcossistemaMaduro", tone: "positivo" });
    if (github && days < 30) tags.push({ label: "ManutencaoRecente", tone: "positivo" });
    if (so && unanswered < 0.3) tags.push({ label: "BoaResolucaoDeDuvidas", tone: "positivo" });
    if (so && unanswered > 0.38) tags.push({ label: "CurvaDeAprendizadoAlta", tone: "atencao" });
    if (github && days > 180) tags.push({ label: "AtividadeIrregular", tone: "atencao" });
    if (github && issues > stars * 0.05) tags.push({ label: "BacklogDeIssues", tone: "atencao" });
    if (!github) tags.push({ label: "DadosDoGitHubAusentes", tone: "atencao" });
    if (!so) tags.push({ label: "DadosDoStackOverflowAusentes", tone: "atencao" });
    if (!tags.length) tags.push({ label: "DadosParciais", tone: "neutro" });

    /* The summary states only measurements that actually came back. */
    var facts = [];
    if (so) facts.push(formatNumber(totalQ) + " perguntas no Stack Overflow, " + Math.round(unanswered * 100) + "% sem resposta");
    if (github) facts.push(formatNumber(stars) + " estrelas no GitHub e último push há " + days + " dia(s)");
    var resumo = tech.name + ": " + (facts.length ? facts.join("; ") + "." : "nenhuma fonte respondeu.")
      + (github ? "" : " Os dados do GitHub não foram obtidos (cota ou rede); estrelas, forks e atividade ficaram de fora desta leitura.")
      + (so ? "" : " O volume de perguntas do Stack Overflow não foi obtido.");

    return {
      source: "heuristica-local", model: null,
      indiceVitalidade: score, tendencia: trend, previsao: previsao,
      resumo: resumo,
      justificativa: "Nota heurística: popularidade " + parts.popularidade.toFixed(0) + "/25, adoção " + parts.adocao.toFixed(0) + "/10, atividade " + parts.atividade.toFixed(0) + "/20, manutenção " + parts.manutencao.toFixed(0) + "/10, comunidade " + parts.comunidade.toFixed(0) + "/15 e suporte " + parts.suporte.toFixed(0) + "/20."
        + (github ? "" : " Sem resposta do GitHub, quatro dimensões não puderam ser medidas: o índice reflete apenas comunidade e suporte."),
      recomendacao: score >= 70 ? "Boa aposta para estudar ou adotar, desde que o ecossistema resolva o seu caso de uso." : "Compare com alternativas do catálogo antes de decidir; os dados sugerem adoção mais cautelosa.",
      confianca: clamp(0.15 + (github ? 0.4 : 0) + (so && so.source !== "demo" ? 0.35 : 0) + (github && so && so.source !== "demo" ? 0.1 : 0), 0.15, 0.9),
      tags: tags.slice(0, 6)
    };
  }

  function buildPrompt(tech, github, so, timeline) {
    var s = summarizeStars(github);
    var gh = github ? [
      "Repositório: " + github.repo.fullName,
      "Estrelas: " + github.repo.stars,
      "Forks: " + github.repo.forks,
      "Issues abertas (inclui PRs): " + github.repo.openIssues,
      "Último push: " + github.repo.pushedAt.slice(0, 10) + " (há " + github.daysSincePush + " dias)",
      "Criado em: " + github.repo.createdAt.slice(0, 10),
      "Arquivado: " + (github.repo.archived ? "sim" : "não"),
      "Amostragem real de stargazers: " + s.size + " estrelas em " + s.days + " dia(s)"
    ].join("\n") : "Dados do GitHub INDISPONÍVEIS.";
    var soBlock = so ? [
      "Tag: " + so.tag,
      "Total de perguntas: " + so.totalQuestions + " (origem: " + so.source + ")",
      "Total sem resposta: " + so.totalUnanswered,
      "Taxa geral sem resposta: " + (so.unansweredRate * 100).toFixed(1) + "%",
      "Amostra recente: " + so.sampleSize + " perguntas; sem resposta: " + (so.sampleUnansweredRate * 100).toFixed(1) + "%",
      "Avisos: " + (so.note || "nenhum")
    ].join("\n") : "Dados do Stack Overflow INDISPONÍVEIS.";
    var series = timeline.filter(function (_, i) { return i % 3 === 0 || i === 11; })
      .map(function (p) { return p.month + ": " + p.stars + " estrelas / " + p.questions + " perguntas" + (p.estimated ? " (estimado)" : " (real)"); }).join("\n");
    return "Analise a tecnologia \"" + tech.name + "\".\n\n== GITHUB ==\n" + gh + "\n\n== STACK OVERFLOW ==\n" + soBlock + "\n\n== SÉRIE (último ponto real) ==\n" + series + "\n\nProduza índice, tendência, previsão, resumo, justificativa numérica, recomendação, confiança e tags.";
  }

  function getGemini(tech, github, so, timeline) {
    if (!CFG.geminiApiKey) return Promise.resolve(heuristic(tech, github, so));
    var url = CFG.geminiApi + "/models/" + encodeURIComponent(CFG.geminiModel) + ":generateContent?key=" + encodeURIComponent(CFG.geminiApiKey);
    return request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: 20000,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(tech, github, so, timeline) }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 1400, responseMimeType: "application/json", responseSchema: SCHEMA }
      })
    }).then(function (data) {
      if (data.error && data.error.message) throw new Error(data.error.message);
      var text = ((data.candidates || [])[0] || {}).content;
      var raw = text && text.parts ? text.parts.map(function (p) { return p.text || ""; }).join("") : "";
      if (!raw) throw new Error("resposta vazia");
      var p = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
      var tags = (p.tags || []).map(function (t) {
        return { label: String(t.label || "").replace(/^#/, "").slice(0, 40), tone: t.tone === "positivo" || t.tone === "atencao" ? t.tone : "neutro" };
      }).filter(function (t) { return t.label; }).slice(0, 6);
      return {
        source: "gemini", model: CFG.geminiModel,
        indiceVitalidade: Math.round(clamp(Number(p.indiceVitalidade) || 0, 0, 100)),
        tendencia: p.tendencia === "em_alta" || p.tendencia === "em_queda" ? p.tendencia : "estavel",
        previsao: String(p.previsao || "Tendência indefinida").slice(0, 90),
        resumo: String(p.resumo || "").slice(0, 600),
        justificativa: String(p.justificativa || "").slice(0, 700),
        recomendacao: String(p.recomendacao || "").slice(0, 400),
        confianca: clamp(Number(p.confianca) || 0.5, 0, 1),
        tags: tags
      };
    }).catch(function (error) {
      console.warn("[gemini]", error.message);
      var fb = heuristic(tech, github, so);
      fb.previsao += " (Gemini indisponível)";
      return fb;
    });
  }

  /* --- Orchestrator ------------------------------------------------------- */
  function getInsights(input) {
    var tech = resolveTech(input);
    return Promise.all([getGithub(tech), getStackOverflow(tech)]).then(function (r) {
      var github = r[0], so = r[1];
      var timeline = buildTimeline(github, so);
      return getGemini(tech, github, so, timeline).then(function (ai) {
        var warnings = [];
        if (!github) warnings.push("GitHub REST API não respondeu (cota ou rede). Configure um token no painel Config.");
        if (github && github.note) warnings.push(github.note);
        if (so && so.note) warnings.push(so.note);
        if (so && so.source === "demo") warnings.push("Exibindo dados de demonstração para o Stack Overflow.");
        if (ai.source === "heuristica-local") warnings.push("Sem chave Gemini: análise gerada pela heurística local.");
        warnings.push("A série histórica é estimada; apenas o ponto atual e a amostragem de stargazers são reais.");
        return {
          tech: tech, github: github, stackoverflow: so, ai: ai, timeline: timeline,
          generatedAt: new Date().toISOString(), warnings: warnings,
          sources: {
            github: github ? github.source : "indisponivel",
            stackoverflow: so ? so.source : "indisponivel",
            ai: ai.source
          }
        };
      });
    });
  }

  window.DEVTRENDS_DATA = {
    catalog: CATALOG, popular: POPULAR,
    slugify: slugify, resolveTech: resolveTech,
    formatNumber: formatNumber, formatCompact: formatCompact,
    summarizeStars: summarizeStars, getInsights: getInsights,
    heuristic: heuristic
  };
})();
