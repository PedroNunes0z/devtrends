/* =========================================================================
   config.example.js — OPTIONAL local overrides.

   Copy to config.local.js and add <script src="config.local.js"></script>
   BEFORE assets/js/config.js in the HTML files. config.local.js is ignored
   by git, so secrets never reach the repository.

   Simpler alternative for most users: open the site and use the "Config"
   button in the top bar. Keys are saved in localStorage only.

   --- Multiple Gemini keys ---
   The Config panel supports multiple Gemini API keys with automatic rotation.
   When a key fails, the next one is tried. Keys are stored in
   localStorage under devtrends.gemini-keys.v1.
   ========================================================================= */
window.DEVTRENDS_CONFIG = {
  /* Public, non-secret endpoints */
  // siteUrl: "https://pedronunes0z.github.io/devtrends",
  // githubApi: "https://api.github.com",
  // stackexchangeApi: "https://api.stackexchange.com/2.3",
  // hnSite: "https://news.ycombinator.com",
  // hnApiBase: "/api", // API REST própria; use a URL pública se hospedar o servidor à parte
  // hnScrapeProxies: ["https://api.allorigins.win/raw?url="], // fallback só para estático
  // geminiModel: "gemini-3.5-flash-lite",
  // cacheTtlMinutes: 60,

  /* Secrets — prefer the Config panel; never commit real values */
  // githubToken: "",
  // stackexchangeKey: ""
};
