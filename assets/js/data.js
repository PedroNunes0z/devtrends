/* =========================================================================
   data.js — client-side data layer. No server, no dependencies.

   Sources:
     · GitHub REST API            (CORS enabled; optional token)
     · tools/scraper.mjs          (optional local scraping API of dev.to, only on localhost)
     · Stack Exchange API v2.3    (CORS enabled; fallback for SO totals/sample)
     · Google Gemini              (structured output; key rotation supported)

   Every layer degrades explicitly: the report always shows where each number
   came from and flags estimates. Nothing is silently invented.

   --- Gemini prompt ---
   The prompt MUST include data from the GitHub API, the scraping/Stack Exchange
   API, AND user-selected actions/options from the web interface (analysis depth,
   focus area, comparison target, experience level).

   --- Key rotation ---
   Multiple Gemini keys are tried round-robin. On failure (quota, rate-limit,
   network), the next key is tried automatically.
   ========================================================================= */
(function () {
  "use strict";

  var CFG = window.DEVTRENDS.config;
  var KEYS = window.DEVTRENDS.keys;

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

  /* --- User options (selected in the UI, sent to Gemini) --- */
  var FOCUS_AREAS = {
    "geral": "Análise geral (todos os critérios)",
    "carreira": "Foco em carreira: demanda de mercado e empregabilidade",
    "adocao": "Foco em adoção em projetos: estabilidade e ecossistema",
    "aprendizado": "Foco em curva de aprendizado e documentação",
    "manutencao": "Foco em manutenção: atividade, issues e suporte"
  };

  var DEPTHS = {
    "rapida": "Análise rápida (resumo e índice)",
    "padrao": "Análise padrão (todos os campos do schema)",
    "profunda": "Análise profunda (justificativa detalhada e recomendação específica)"
  };

  var EXPERIENCE_LEVELS = {
    "iniciante": "Desenvolvedor iniciante",
    "intermediario": "Desenvolvedor intermediário",
    "avancado": "Desenvolvedor avançado / arquiteto"
  };

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
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (errBody) {
          var msg = (errBody && errBody.error && errBody.error.message) ||
                    (errBody && errBody.message) ||
                    ("HTTP " + res.status + " em " + new URL(url).host);
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        });
      }
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

  var lastGithubError = null;

  function getGithub(tech) {
    lastGithubError = null;
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
      lastGithubError = error.message;
      console.warn("[github]", error.message);
      return null;
    });
  }

  /* --- Stack Overflow (totals) + DEV.TO (optional local scraping) --------- */
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
      fromApiQuestions(tech).catch(function (e) { console.warn("[se-questions]", e.message); return []; })
    ]).then(function (results) {
      var totals = results[0];
      var questions = results[1];

      var open = questions.filter(function (q) { return q.unanswered; }).length;
      var sampleRate = questions.length ? open / questions.length : 0;
      if (!totals && !questions.length) return Object.assign(base, demoData(tech));
      var total = totals ? totals.total : 0;
      var unanswered = totals ? totals.unanswered : Math.round(total * sampleRate);
      var notes = [];
      if (questions.length) {
        notes.push("Amostra de perguntas recentes via Stack Exchange API.");
      } else {
        notes.push("Amostra de perguntas recentes indisponível.");
      }
      if (!totals) notes.push("Totais estimados a partir da amostra disponível.");

      return Object.assign(base, {
        source: "stackexchange-api",
        totalQuestions: total,
        totalUnanswered: Math.min(unanswered, total),
        unansweredRate: total > 0 ? Math.min(1, unanswered / total) : sampleRate,
        sampleSize: questions.length,
        sampleUnansweredRate: sampleRate,
        recentQuestions: questions,
        note: notes.join(" ")
      });
    }).catch(function () { return Object.assign(base, demoData(tech)); });
  }

  /* --- DEV.TO: projeto's own scraping + public JSON API -------------------- */
  var DEVTO_TAG_ALIASES = {
    "reactjs": "react", "vue.js": "vue", "angular.js": "angular",
    "node-js": "node", "next-js": "nextjs", "nest-js": "nestjs",
    "tailwind-css": "tailwindcss", "postgres": "postgresql"
  };
  function devToTag(soTag) {
    var t = (soTag || "").toLowerCase();
    if (DEVTO_TAG_ALIASES[t]) return DEVTO_TAG_ALIASES[t];
    var looser = t.replace(/\.[jt]sx?$/, "").replace(/-js$/, "js");
    return DEVTO_TAG_ALIASES[looser] || looser;
  }

  function fromDevtoApi(dtag) {
    /* The public JSON feed of dev.to sends Access-Control-Allow-Origin: *,
       so it works on GitHub Pages, where scraping HTML is impossible. */
    return cachedJson(CFG.devTo + "/api/articles?tag=" + encodeURIComponent(dtag) + "&per_page=" + String(CFG.soSampleSize))
      .then(function (list) {
        return (list || []).map(function (a) {
          return {
            title: a.title || "",
            url: a.url || (CFG.devTo + a.path),
            answers: Number(a.comments_count) || 0,
            votes: Number(a.public_reactions_count) || 0,
            views: null,
            tags: a.tag_list || [],
            askedAt: a.published_at ? new Date(a.published_at).toISOString() : null,
            unanswered: !(a.comments_count > 0)
          };
        });
      });
  }

  function getDevTo(tech) {
    var dtag = devToTag(tech.soTag);
    var base = {
      tag: dtag,
      tagUrl: CFG.devTo + "/t/" + encodeURIComponent(dtag),
      searchUrl: CFG.devTo + "/search?utf8=%E2%9C%93&q=" + encodeURIComponent(dtag),
      homeUrl: CFG.devTo + "/"
    };
    function viaApi() {
      return fromDevtoApi(dtag).catch(function (e) {
        console.warn("[devto-api]", e.message);
        return [];
      }).then(function (list) {
        return Object.assign({}, base, {
          source: list.length ? "devto-api" : "indisponivel",
          sampleSize: list.length,
          recentQuestions: list,
          trending: null,
          note: list.length
            ? "Publicações da tag via API pública JSON do dev.to (CORS liberado; em localhost o tools/scraper.mjs raspa de verdade)."
            : "DEV.TO indisponível no momento."
        });
      });
    }
    if (!window.DEVTRENDS.isLocal()) return viaApi();
    /* Localhost: the scraper the project developed hits the real pages. */
    return request(CFG.scraperLocal + "?tag=" + encodeURIComponent(tech.soTag) + "&limit=" + CFG.soSampleSize, { timeoutMs: 7500 })
      .then(function (scraped) {
        if (scraped && Array.isArray(scraped.recentQuestions) && scraped.recentQuestions.length) {
          return Object.assign({}, base, {
            source: "devto-scrape",
            sampleSize: scraped.recentQuestions.length,
            recentQuestions: scraped.recentQuestions,
            trending: scraped.trending || null,
            note: "Scraping do dev.to (/, /trending, /search?q=tag) executado pelo scraper do projeto (tools/scraper.mjs)."
          });
        }
        return viaApi();
      })
      .catch(function (e) {
        console.warn("[devto-scrape]", e && e.message);
        return viaApi();
      });
  }

  /* --- Hacker News: Algolia Search API (the HN search backend, CORS *) ---- */
  /* Terms that are common English words would inflate title matching.       */
  var HN_COMMON_WORDS = { "go": true, "r": true, "c": true, "ai": true };

  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function hnTerms(tech) {
    var seen = {}, out = [];
    [tech.name].concat(tech.aliases || []).forEach(function (t) {
      var s = String(t).trim().toLowerCase();
      if (!s || s.length < 2 || HN_COMMON_WORDS[s] || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    return out.length ? out : [tech.name.toLowerCase()];
  }

  function hnTitleMatcher(tech) {
    var re = new RegExp("(^|[^a-z0-9])(" + hnTerms(tech).map(escapeRegExp).join("|") + ")([^a-z0-9]|$)", "i");
    return function (title) { return re.test(String(title || "")); };
  }

  function hnSearchStories(tech, numericFilter) {
    var url = CFG.hnAlgolia + "/search_by_date?tags=story&hitsPerPage=1000&query=" +
      encodeURIComponent(tech.name) +
      (numericFilter ? "&numericFilters=" + encodeURIComponent(numericFilter) : "");
    return cachedJson(url, { timeoutMs: CFG.timeoutMs + 3000 });
  }

  function hnFrontPage(tech) {
    return cachedJson(CFG.hnAlgolia + "/search?tags=front_page&hitsPerPage=30", { timeoutMs: CFG.timeoutMs })
      .then(function (data) {
        var matches = hnTitleMatcher(tech);
        var hits = (data && data.hits) || [];
        return { posts: hits.length, matches: hits.filter(function (h) { return matches(h.title); }).length };
      })
      .catch(function (e) {
        console.warn("[hn-front]", e && e.message);
        return null;
      });
  }

  function getHackerNews(tech) {
    var term = tech.name;
    var now = Math.floor(Date.now() / 1000);
    var weekAgo = now - 7 * 86400, twoWeeksAgo = now - 14 * 86400;
    var base = {
      source: "hn-algolia",
      query: term,
      siteUrl: "https://news.ycombinator.com",
      searchUrl: "https://hn.algolia.com/?q=" + encodeURIComponent(term),
      titlesLast7d: 0, titlesPrev7d: 0, deltaPct: null, matchesLast7d: 0,
      frontPage: null, recentPosts: []
    };
    return Promise.all([
      hnSearchStories(tech, "created_at_i>" + weekAgo).catch(function (e) {
        console.warn("[hn-week]", e.message); return null;
      }),
      hnSearchStories(tech, "created_at_i>" + twoWeeksAgo + ",created_at_i<" + weekAgo).catch(function (e) {
        console.warn("[hn-prev]", e.message); return null;
      }),
      hnFrontPage(tech)
    ]).then(function (res) {
      var last = res[0], prev = res[1], fp = res[2];
      if (!last && !prev) {
        return Object.assign({}, base, {
          source: "indisponivel",
          note: "Hacker News indisponível no momento (API Algolia não respondeu)."
        });
      }
      var matches = hnTitleMatcher(tech);
      var lastHits = last && last.hits ? last.hits : [];
      var prevHits = prev && prev.hits ? prev.hits : [];
      var titlesLast = lastHits.filter(function (h) { return matches(h.title); }).length;
      var titlesPrev = prevHits.filter(function (h) { return matches(h.title); }).length;
      var deltaPct = null;
      if (titlesPrev > 0) deltaPct = Math.round((titlesLast - titlesPrev) / titlesPrev * 100);
      else if (titlesLast > 0) deltaPct = 100;
      return Object.assign({}, base, {
        titlesLast7d: titlesLast,
        titlesPrev7d: titlesPrev,
        deltaPct: deltaPct,
        matchesLast7d: (last && last.nbHits) || 0,
        frontPage: fp,
        recentPosts: lastHits.filter(function (h) { return matches(h.title); }).slice(0, 8).map(function (h) {
          return {
            title: h.title || "",
            url: h.url || ("https://news.ycombinator.com/item?id=" + h.objectID),
            points: Number(h.points) || 0,
            answers: Number(h.num_comments) || 0,
            votes: Number(h.points) || 0,
            views: null,
            tags: [],
            askedAt: h.created_at ? new Date(h.created_at).toISOString() : null,
            unanswered: !(h.num_comments > 0)
          };
        }),
        note: "Contagem de menções em TÍTULOS de posts (stories) na API pública de busca do Hacker News (Algolia); compara os últimos 7 dias com os 7 dias anteriores. Menções totais (título + texto + url): " + ((last && last.nbHits) || 0) + "."
      });
    });
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
      tags: { type: "ARRAY", items: { type: "OBJECT", properties: { label: { type: "STRING" }, tone: { type: "STRING", enum: ["positivo", "atencao", "neutro"] } }, required: ["label", "tone"] } },
      /* New structured fields for rich UI rendering */
      scoreBreakdown: {
        type: "OBJECT",
        properties: {
          popularidade: { type: "INTEGER" },
          atividade: { type: "INTEGER" },
          manutencao: { type: "INTEGER" },
          comunidade: { type: "INTEGER" },
          suporte: { type: "INTEGER" },
          adocao: { type: "INTEGER" }
        }
      },
      comparativo: {
        type: "OBJECT",
        properties: {
          pontosFortes: { type: "ARRAY", items: { type: "STRING" } },
          pontosAtencao: { type: "ARRAY", items: { type: "STRING" } },
          alternativas: { type: "ARRAY", items: { type: "STRING" } }
        }
      },
      projecao: {
        type: "OBJECT",
        properties: {
          horizonte: { type: "STRING" },
          risco: { type: "STRING", enum: ["baixo", "medio", "alto"] },
          momentum: { type: "STRING", enum: ["positivo", "neutro", "negativo"] }
        }
      }
    },
    required: ["indiceVitalidade", "tendencia", "previsao", "resumo", "justificativa", "recomendacao", "confianca", "tags", "scoreBreakdown", "comparativo", "projecao"]
  };

  var SYSTEM = "Você é um analista de engenharia de software. Recebe métricas REAIS do GitHub e do Stack Overflow, além de opções selecionadas pelo usuário na interface, e produz um Índice de Vitalidade (0-100) para ajudar a decidir o que estudar ou qual stack adotar. Regras: escreva em português do Brasil, tom técnico e direto, sem marketing; baseie cada afirmação nos números; se um dado faltar, reduza a confiança e diga isso; não invente números ou datas; popularidade não é saúde (atividade, volume de dúvidas e taxa de resolução pesam mais); use escala logarítmica; 'previsao' deve ser um rótulo curto; 'tags' de 4 a 6 itens curtos, sem espaços, misturando pontos fortes e de atenção. Em 'scoreBreakdown', dê notas de 0 a 100 para cada dimensão. Em 'comparativo', liste 2-3 pontos fortes, 2-3 pontos de atenção e 1-2 tecnologias alternativas. Em 'projecao', indique horizonte (ex: '6 meses'), risco e momentum. Responda SOMENTE com o JSON do schema.";

  function heuristic(tech, github, so, options) {
    var stars = github ? github.repo.stars : 0;
    var forks = github ? github.repo.forks : 0;
    var issues = github ? github.repo.openIssues : 0;
    var days = github ? github.daysSincePush : null;
    var totalQ = so ? so.totalQuestions : 0;
    var unanswered = so ? so.unansweredRate : 0.5;
    var sample = summarizeStars(github);
    function log(v, ceiling) { return clamp(Math.log10(Math.max(v, 1)) / Math.log10(ceiling) * 100, 0, 100); }

    var breakdown = {
      popularidade: Math.round(log(stars, 250000)),
      adocao: Math.round(log(forks, 60000)),
      atividade: github ? Math.round(clamp(100 - days / 180 * 100, 0, 100)) : 0,
      manutencao: github ? Math.round(clamp(100 - issues / Math.max(stars, 1) * 600, 0, 100)) : 0,
      comunidade: Math.round(log(totalQ, 2000000)),
      suporte: Math.round(clamp(100 - unanswered * 180, 0, 100))
    };

    var parts = {
      popularidade: breakdown.popularidade * 0.25,
      adocao: breakdown.adocao * 0.1,
      atividade: breakdown.atividade * 0.2,
      manutencao: breakdown.manutencao * 0.1,
      comunidade: breakdown.comunidade * 0.15,
      suporte: breakdown.suporte * 0.2
    };
    var score = Math.round(clamp(Object.keys(parts).reduce(function (a, k) { return a + parts[k]; }, 0), 0, 100));
    var velocity = sample.monthlyVelocity || 0;
    var growing = github && velocity > Math.max(30, stars * 0.004) && days < 60;
    var declining = github && (days > 365 || github.repo.archived);
    var trend = declining ? "em_queda" : growing ? "em_alta" : "estavel";
    var previsao = declining ? "Em retração: manutenção irregular" : growing ? "Tecnologia em ascensão" : score > 72 ? "Madura e estável" : "Adoção moderada";

    /* Build comparativo */
    var pontosFortes = [], pontosAtencao = [];
    if (so && totalQ > 100000) pontosFortes.push("Comunidade ativa com grande volume de perguntas");
    if (github && stars > 40000) pontosFortes.push("Ecossistema maduro e amplamente adotado");
    if (github && days < 30) pontosFortes.push("Manutenção recente e contínua");
    if (so && unanswered < 0.3) pontosFortes.push("Boa taxa de resolução de dúvidas");
    if (so && unanswered > 0.38) pontosAtencao.push("Taxa elevada de perguntas sem resposta");
    if (github && days > 180) pontosAtencao.push("Atividade de manutenção irregular");
    if (github && issues > stars * 0.05) pontosAtencao.push("Backlog de issues proporcionalmente alto");
    if (!github) pontosAtencao.push("Dados do GitHub indisponíveis para análise");
    if (!so) pontosAtencao.push("Dados do Stack Overflow indisponíveis para análise");
    if (!pontosFortes.length) pontosFortes.push("Dados insuficientes para avaliar pontos fortes");

    /* Alternativas based on catalog */
    var alternativas = [];
    var sameCategory = CATALOG.filter(function (t) { return t.slug !== tech.slug; }).slice(0, 2);
    alternativas = sameCategory.map(function (t) { return t.name; }).slice(0, 2);

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

    var facts = [];
    if (so) facts.push(formatNumber(totalQ) + " perguntas no Stack Overflow, " + Math.round(unanswered * 100) + "% sem resposta");
    if (github) facts.push(formatNumber(stars) + " estrelas no GitHub e último push há " + days + " dia(s)");
    var resumo = tech.name + ": " + (facts.length ? facts.join("; ") + "." : "nenhuma fonte respondeu.")
      + (github ? "" : " Os dados do GitHub não foram obtidos (cota ou rede); estrelas, forks e atividade ficaram de fora desta leitura.")
      + (so ? "" : " O volume de perguntas do Stack Overflow não foi obtido.");

    var expLabel = options && options.experience ? EXPERIENCE_LEVELS[options.experience] : "Desenvolvedor intermediário";
    var focusLabel = options && options.focus ? FOCUS_AREAS[options.focus] : FOCUS_AREAS.geral;
    var depthLabel = options && options.depth ? DEPTHS[options.depth] : DEPTHS.padrao;

    return {
      source: "heuristica-local", model: null,
      indiceVitalidade: score, tendencia: trend, previsao: previsao,
      resumo: resumo,
      justificativa: "Nota heurística: popularidade " + parts.popularidade.toFixed(0) + "/25, adoção " + parts.adocao.toFixed(0) + "/10, atividade " + parts.atividade.toFixed(0) + "/20, manutenção " + parts.manutencao.toFixed(0) + "/10, comunidade " + parts.comunidade.toFixed(0) + "/15 e suporte " + parts.suporte.toFixed(0) + "/20."
        + (github ? "" : " Sem resposta do GitHub, quatro dimensões não puderam ser medidas: o índice reflete apenas comunidade e suporte.")
        + " Opções do usuário: " + focusLabel + ", " + depthLabel + ", " + expLabel + ".",
      recomendacao: score >= 70 ? "Boa aposta para estudar ou adotar, desde que o ecossistema resolva o seu caso de uso." : "Compare com alternativas do catálogo antes de decidir; os dados sugerem adoção mais cautelosa.",
      confianca: clamp(0.15 + (github ? 0.4 : 0) + (so && so.source !== "demo" ? 0.35 : 0) + (github && so && so.source !== "demo" ? 0.1 : 0), 0.15, 0.9),
      tags: tags.slice(0, 6),
      scoreBreakdown: breakdown,
      comparativo: {
        pontosFortes: pontosFortes.slice(0, 3),
        pontosAtencao: pontosAtencao.slice(0, 3),
        alternativas: alternativas
      },
      projecao: {
        horizonte: "6 meses",
        risco: declining ? "alto" : growing ? "baixo" : "medio",
        momentum: growing ? "positivo" : declining ? "negativo" : "neutro"
      },
      userOptions: { focus: options && options.focus || "geral", depth: options && options.depth || "padrao", experience: options && options.experience || "intermediario" }
    };
  }

  /* --- Build prompt with GitHub + SO + DEV.TO + HN data + user UI options --- */
  function buildPrompt(tech, github, so, devto, hn, timeline, options) {
    var s = summarizeStars(github);
    var gh = github ? [
      "Repositório: " + github.repo.fullName,
      "Estrelas: " + github.repo.stars,
      "Forks: " + github.repo.forks,
      "Issues abertas (inclui PRs): " + github.repo.openIssues,
      "Watchers: " + github.repo.watchers,
      "Linguagem: " + (github.repo.language || "n/a"),
      "Licença: " + (github.repo.license || "n/a"),
      "Tópicos: " + (github.repo.topics.length ? github.repo.topics.join(", ") : "n/a"),
      "Último push: " + github.repo.pushedAt.slice(0, 10) + " (há " + github.daysSincePush + " dias)",
      "Criado em: " + github.repo.createdAt.slice(0, 10),
      "Arquivado: " + (github.repo.archived ? "sim" : "não"),
      "Amostragem real de stargazers: " + s.size + " estrelas em " + s.days + " dia(s)",
      s.size > 0 ? "Velocidade mensal estimada: " + Math.round(s.monthlyVelocity) + " estrelas/mês" : ""
    ].filter(Boolean).join("\n") : "Dados do GitHub INDISPONÍVEIS (cota excedida ou rede).";

    var soBlock = so ? [
      "Tag analisada: " + so.tag,
      "Origem dos dados: " + so.source,
      "Total de perguntas na tag: " + so.totalQuestions,
      "Total sem resposta: " + so.totalUnanswered,
      "Taxa geral sem resposta: " + (so.unansweredRate * 100).toFixed(1) + "%",
      "Amostra recente: " + so.sampleSize + " perguntas",
      "Taxa sem resposta na amostra: " + (so.sampleUnansweredRate * 100).toFixed(1) + "%",
      so.recentQuestions && so.recentQuestions.length > 0
        ? "Títulos recentes: " + so.recentQuestions.slice(0, 5).map(function (q) { return "\"" + q.title.slice(0, 80) + "\""; }).join("; ")
        : "",
      "Avisos de coleta: " + (so.note || "nenhum")
    ].filter(Boolean).join("\n") : "Dados do Stack Overflow INDISPONÍVEIS.";

    var series = timeline.filter(function (_, i) { return i % 3 === 0 || i === 11; })
      .map(function (p) { return p.month + ": " + p.stars + " estrelas / " + p.questions + " perguntas" + (p.estimated ? " (estimado)" : " (real)"); }).join("\n");

    /* --- DEV.TO: the project's own scraping (tools/scraper.mjs) or public API --- */
    var dt = devto || {};
    var devtoBlock = dt.source === "devto-scrape" || dt.source === "devto-api" ? [
      "== DEV.TO (API desenvolvida pelo projeto) ==",
      dt.source === "devto-scrape"
        ? "Origem: scraping do tools/scraper.mjs raspando dev.to/, /trending e a busca por tag."
        : "Origem: API pública JSON do dev.to (em localhost, o tools/scraper.mjs raspa as páginas de verdade).",
      "Tag mapeada no dev.to: " + dt.tag,
      "Publicações recentes coletadas: " + (dt.sampleSize || 0),
      dt.recentQuestions && dt.recentQuestions.length > 0
        ? "Publicações recentes: " + dt.recentQuestions.slice(0, 5).map(function (q) { return "\"" + q.title.slice(0, 70) + "\" (" + q.votes + " reactions, " + q.answers + " comentários)"; }).join("; ")
        : "",
      dt.trending && dt.trending.tagInTrending
        ? "A tag #" + dt.tag + " está em dev.to/trending com " + dt.trending.postsLast7Days + " posts em 7 dias."
        : dt.source === "devto-scrape" ? "A tag #" + dt.tag + " não está em dev.to/trending agora." : "",
      dt.trending && dt.trending.tagInTrending ? "Publicações na home do dev.to com a tag: " + (dt.trending.tagOnHome ? "sim" : "não") : ""
    ].filter(Boolean).join("\n") : "";

    /* --- HACKER NEWS: buzz via public Algolia Search API --- */
    var hnBlock = "";
    if (hn && hn.source === "hn-algolia") {
      hnBlock = [
        "== HACKER NEWS (API pública de busca, Algolia) ==",
        "Termo buscado: \"" + hn.query + "\" em TÍTULOS de posts (stories)",
        "Posts com a tecnologia no título, últimos 7 dias: " + hn.titlesLast7d,
        "Posts com a tecnologia no título, 7 dias anteriores: " + hn.titlesPrev7d,
        hn.deltaPct !== null ? "Variação semana a semana: " + (hn.deltaPct > 0 ? "+" : "") + hn.deltaPct + "%" : "",
        "Menções totais (título + texto + url) na última semana: " + hn.matchesLast7d,
        hn.frontPage && hn.frontPage.posts > 0
          ? "Front page do news.ycombinator.com agora: " + hn.frontPage.posts + " posts no ar, " + hn.frontPage.matches + " mencionando a tecnologia."
          : "",
        hn.recentPosts && hn.recentPosts.length > 0
          ? "Posts recentes no HN: " + hn.recentPosts.slice(0, 5).map(function (p) { return "\"" + p.title.slice(0, 70) + "\" (" + p.points + " pontos, " + p.answers + " comentários)"; }).join("; ")
          : ""
      ].filter(Boolean).join("\n");
    } else if (hn) {
      hnBlock = "== HACKER NEWS ==\nDados do Hacker News INDISPONÍVEIS (" + (hn.note || "API não respondeu") + ").";
    }

    /* --- User-selected options from the web interface --- */
    var opts = options || {};
    var focusLabel = FOCUS_AREAS[opts.focus] || FOCUS_AREAS.geral;
    var depthLabel = DEPTHS[opts.depth] || DEPTHS.padrao;
    var expLabel = EXPERIENCE_LEVELS[opts.experience] || EXPERIENCE_LEVELS.intermediario;
    var compareTech = opts.compareWith ? resolveTech(opts.compareWith) : null;

    var userBlock = [
      "== OPÇÕES SELECIONADAS PELO USUÁRIO NA INTERFACE ==",
      "Foco da análise: " + focusLabel,
      "Profundidade: " + depthLabel,
      "Perfil do usuário: " + expLabel,
      compareTech ? "Tecnologia para comparação: " + compareTech.name + (compareTech.repo ? " (" + compareTech.repo + ")" : "") : "Sem tecnologia de comparação solicitada",
      opts.considerCareer ? "Considerar perspectiva de carreira/empregabilidade: sim" : "",
      opts.timeHorizon ? "Horizonte temporal de interesse: " + opts.timeHorizon : ""
    ].filter(Boolean).join("\n");

    var compareBlock = compareTech ? "\n\n== TECNOLOGIA DE COMPARAÇÃO SOLICITADA ==\n" + compareTech.name + " (tag: " + compareTech.soTag + ", repo: " + (compareTech.repo || "n/a") + ")\nConsidere esta tecnologia como referência para a recomendação." : "";

    return "Analise a tecnologia \"" + tech.name + "\".\n\n" + userBlock + "\n\n== GITHUB (API pública) ==\n" + gh + "\n\n== STACK OVERFLOW (API pública) ==\n" + soBlock + (devtoBlock ? "\n\n" + devtoBlock : "") + (hnBlock ? "\n\n" + hnBlock : "") + "\n\n== SÉRIE HISTÓRICA (último ponto real) ==\n" + series + compareBlock + "\n\nProduza o JSON completo do schema: indiceVitalidade, tendencia, previsao, resumo, justificativa numérica baseada nos dados, recomendação alinhada ao foco e perfil do usuário, confiança, tags, scoreBreakdown (notas por dimensão), comparativo (pontos fortes, pontos de atenção, alternativas) e projecao (horizonte, risco, momentum).";
  }

  /* --- Gemini call with key rotation --- */
  function getGemini(tech, github, so, devto, hn, timeline, options) {
    if (!KEYS.count()) return Promise.resolve(heuristic(tech, github, so, options));
    return callGeminiWithRotation(tech, github, so, devto, hn, timeline, options, 0);
  }

  function callGeminiWithRotation(tech, github, so, devto, hn, timeline, options, attempt) {
    var maxAttempts = KEYS.count();
    if (attempt >= maxAttempts) {
      var fb = heuristic(tech, github, so, options);
      fb.previsao += " (Gemini indisponível)";
      return Promise.resolve(fb);
    }

    var apiKey = KEYS.active();
    if (!apiKey) {
      var fb0 = heuristic(tech, github, so, options);
      fb0.previsao += " (Gemini indisponível)";
      return Promise.resolve(fb0);
    }

    var url = CFG.geminiApi + "/models/" + encodeURIComponent(CFG.geminiModel) + ":generateContent?key=" + encodeURIComponent(apiKey);
    return request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: 20000,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(tech, github, so, devto, hn, timeline, options) }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 2000, responseMimeType: "application/json", responseSchema: SCHEMA }
      })
    }).then(function (data) {
      if (data.error && data.error.message) throw new Error(data.error.message);
      var text = ((data.candidates || [])[0] || {}).content;
      var raw = text && text.parts ? text.parts.map(function (p) { return p.text || ""; }).join("") : "";
      if (!raw) throw new Error("resposta vazia");
      var p = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));

      KEYS.recordCall(apiKey, true);

      var tags = (p.tags || []).map(function (t) {
        return { label: String(t.label || "").replace(/^#/, "").slice(0, 40), tone: t.tone === "positivo" || t.tone === "atencao" ? t.tone : "neutro" };
      }).filter(function (t) { return t.label; }).slice(0, 6);

      var bd = p.scoreBreakdown || {};
      var comp = p.comparativo || {};
      var proj = p.projecao || {};

      return {
        source: "gemini", model: CFG.geminiModel,
        indiceVitalidade: Math.round(clamp(Number(p.indiceVitalidade) || 0, 0, 100)),
        tendencia: p.tendencia === "em_alta" || p.tendencia === "em_queda" ? p.tendencia : "estavel",
        previsao: String(p.previsao || "Tendência indefinida").slice(0, 90),
        resumo: String(p.resumo || "").slice(0, 600),
        justificativa: String(p.justificativa || "").slice(0, 700),
        recomendacao: String(p.recomendacao || "").slice(0, 400),
        confianca: clamp(Number(p.confianca) || 0.5, 0, 1),
        tags: tags,
        scoreBreakdown: {
          popularidade: Math.round(clamp(Number(bd.popularidade) || 0, 0, 100)),
          adocao: Math.round(clamp(Number(bd.adocao) || 0, 0, 100)),
          atividade: Math.round(clamp(Number(bd.atividade) || 0, 0, 100)),
          manutencao: Math.round(clamp(Number(bd.manutencao) || 0, 0, 100)),
          comunidade: Math.round(clamp(Number(bd.comunidade) || 0, 0, 100)),
          suporte: Math.round(clamp(Number(bd.suporte) || 0, 0, 100))
        },
        comparativo: {
          pontosFortes: (comp.pontosFortes || []).map(function (s) { return String(s).slice(0, 120); }).slice(0, 3),
          pontosAtencao: (comp.pontosAtencao || []).map(function (s) { return String(s).slice(0, 120); }).slice(0, 3),
          alternativas: (comp.alternativas || []).map(function (s) { return String(s).slice(0, 60); }).slice(0, 2)
        },
        projecao: {
          horizonte: String(proj.horizonte || "6 meses").slice(0, 30),
          risco: proj.risco === "baixo" || proj.risco === "alto" ? proj.risco : "medio",
          momentum: proj.momentum === "positivo" || proj.momentum === "negativo" ? proj.momentum : "neutro"
        },
        userOptions: { focus: options && options.focus || "geral", depth: options && options.depth || "padrao", experience: options && options.experience || "intermediario" },
        keyUsed: apiKey.length > 14 ? apiKey.slice(0, 8) + "..." + apiKey.slice(-4) : apiKey
      };
    }).catch(function (error) {
      console.warn("[gemini] key " + (attempt + 1) + "/" + maxAttempts + " failed:", error.message);
      KEYS.recordCall(apiKey, false, error.message);

      /* Rotate to next key and retry */
      if (attempt + 1 < maxAttempts) {
        KEYS.next();
        return callGeminiWithRotation(tech, github, so, devto, hn, timeline, options, attempt + 1);
      }
      /* All keys exhausted — fall back to heuristic */
      var fb = heuristic(tech, github, so, options);
      fb.previsao += " (Gemini indisponível)";
      fb.geminiError = error.message;
      return fb;
    });
  }

  /* --- Orchestrator ------------------------------------------------------- */
  function getInsights(input, options) {
    var tech = resolveTech(input);
    var opts = options || {};
    return Promise.all([getGithub(tech), getStackOverflow(tech), getDevTo(tech), getHackerNews(tech)]).then(function (r) {
      var github = r[0], so = r[1], devto = r[2], hn = r[3];
      var timeline = buildTimeline(github, so);
      return getGemini(tech, github, so, devto, hn, timeline, opts).then(function (ai) {
        var warnings = [];
        if (!github) {
          var isRateLimit = lastGithubError && (lastGithubError.indexOf("403") !== -1 || lastGithubError.indexOf("rate limit") !== -1 || lastGithubError.indexOf("cota") !== -1);
          if (isRateLimit) {
            warnings.push("Limite de taxa da API do GitHub atingido (cota de 60 req/h excedida). Configure um GitHub Token no painel Config para ter 5.000 req/h.");
          } else {
            warnings.push("GitHub REST API não respondeu" + (lastGithubError ? " (" + lastGithubError + ")" : "") + ". Configure um token no painel Config.");
          }
        }
        if (github && github.note) warnings.push(github.note);
        if (so && so.note) warnings.push(so.note);
        if (hn && hn.note && hn.source === "indisponivel") warnings.push(hn.note);
        if (so && so.source === "demo") warnings.push("Exibindo dados de demonstração para o Stack Overflow.");
        if (ai.source === "heuristica-local") {
          if (KEYS.count() > 0) {
            warnings.push("Gemini indisponível (" + (ai.geminiError || "erro na chamada") + "): análise gerada pela heurística local.");
          } else {
            warnings.push("Sem chave Gemini configurada: análise gerada pela heurística local.");
          }
        }
        warnings.push("A série histórica é estimada; apenas o ponto atual e a amostragem de stargazers são reais.");
        if (KEYS.count() > 1) warnings.push("Rodízio de chaves Gemini ativo: " + KEYS.count() + " chaves configuradas.");
        return {
          tech: tech, github: github, stackoverflow: so, devto: devto, hn: hn, ai: ai, timeline: timeline,
          generatedAt: new Date().toISOString(), warnings: warnings,
          githubError: lastGithubError,
          userOptions: opts,
          sources: {
            github: github ? github.source : "indisponivel",
            stackoverflow: so ? so.source : "indisponivel",
            devto: devto ? devto.source : "indisponivel",
            hn: hn ? hn.source : "indisponivel",
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
    heuristic: heuristic,
    FOCUS_AREAS: FOCUS_AREAS, DEPTHS: DEPTHS, EXPERIENCE_LEVELS: EXPERIENCE_LEVELS
  };
})();
