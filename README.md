# DevTrends Insights

Analisador de popularidade de tecnologias. Cruza dados reais do **GitHub REST API** com o volume de dúvidas e a taxa de resolução do **Stack Overflow**, e pede ao **Google Gemini** um *Índice de Vitalidade* (0–100), uma previsão de tendência e tags de saúde da comunidade.

Feito com **HTML, CSS e JavaScript puro (Vanilla JS)** — sem framework, sem bundler, sem `node_modules` para rodar. Publicado em **GitHub Pages**.

👉 Site: <https://pedronunes0z.github.io/devtrends/>

---

## 1. Instalação e execução

Requisito para rodar: apenas um servidor de arquivos estáticos (ou Python 3 / Node 18+). **Não há `npm install`.**

```bash
git clone https://github.com/PedroNunes0z/devtrends.git
cd devtrends
python -m http.server 8080
```

Abra <http://localhost:8080/>.

Alternativas equivalentes:

```bash
npx serve .            # Node
php -S localhost:8080  # PHP
```

> Abrir `index.html` com `file://` não funciona: `fetch` para APIs externas e módulos relativos exigem HTTP.

### Gerar as páginas novamente (opcional)

As páginas de relatório já vêm prontas em `reports/`. Se alterar o catálogo ou os textos, regenere com Node (sem dependências):

```bash
node tools/generate-pages.mjs
```

Isso reescreve `index.html`, os 27 HTMLs de `reports/`, `sitemap.xml`, `robots.txt` e `.nojekyll`.

---

## 2. Configuração (as "variáveis de ambiente")

Como o site é 100% estático, **não existem variáveis de ambiente de servidor**. Há duas formas de configurar:

### Forma recomendada — painel no site

Clique em **Config** na barra superior e preencha. Os valores ficam **somente no `localStorage` do seu navegador** e nunca são enviados ao repositório.

#### Chaves Gemini com rodízio automático

O painel Config permite adicionar **várias chaves Gemini**. Se uma chave atingir a cota, o app tenta a próxima automaticamente (round-robin). Para cada chave você vê:

- rótulo personalizado;
- indicador visual de chave ativa;
- número de chamadas e erros;
- botão para remover.

| Campo | Obrigatório | Para que serve |
| --- | --- | --- |
| `Nova chave Gemini` | não | Chave do [Google AI Studio](https://aistudio.google.com/app/apikey). Adicione quantas quiser. |
| `GitHub token` | não | Token [GitHub](https://github.com/settings/tokens) somente-leitura. Eleva a cota de **60** para **5.000 req/h**. |
| `Stack Exchange key` | não | Chave [Stack Apps](https://stackapps.com/apps/oauth/register). Eleva a cota de ~300 para ~10.000 req/dia. |

> Sem nenhuma chave Gemini o relatório usa uma **heurística local determinística**, sinalizada na interface.

### Forma alternativa — arquivo local

```bash
cp config.example.js config.local.js
```

Edite `config.local.js` e inclua a tag **antes** de `assets/js/config.js` nos HTMLs:

```html
<script src="config.local.js"></script>
```

`config.local.js` está no `.gitignore`.

### Valores públicos editáveis em `assets/js/config.js`

| Chave | Padrão | Descrição |
| --- | --- | --- |
| `siteUrl` | `https://pedronunes0z.github.io/devtrends` | Base usada em canonical / sitemap / OG |
| `githubApi` | `https://api.github.com` | Base da REST API |
| `stackexchangeApi` | `https://api.stackexchange.com/2.3` | Base da API de fallback |
| `stackOverflow` | `https://stackoverflow.com` | Links das perguntas |
| `geminiApi` | `https://generativelanguage.googleapis.com/v1beta` | Base do Gemini |
| `geminiModel` | `gemini-3.5-flash-lite` | Modelo com *structured output* |
| `scraperLocal` | `http://127.0.0.1:8787/api/stackoverflow` | Scraper local opcional |
| `cacheTtlMinutes` | `60` | TTL do cache de respostas no navegador |
| `timeoutMs` | `9000` | Timeout de cada chamada |
| `stargazerSamplePages` | `2` | Páginas de 100 stargazers amostradas |
| `soSampleSize` | `30` | Perguntas recentes analisadas |

> ⚠️ Qualquer chave colocada em `assets/js/config.js` é pública. Use apenas o painel Config ou `config.local.js` para segredos.

---

## 3. API própria de scraping (opcional, local)

O navegador não consegue raspar `stackoverflow.com` (CORS + Cloudflare). No GitHub Pages, o app usa diretamente a **Stack Exchange API**, que libera CORS. Para usar scraping de verdade durante o desenvolvimento:

```bash
node tools/scraper.mjs
# http://127.0.0.1:8787/api/stackoverflow?tag=reactjs
```

O servidor é um `http.createServer` sem dependências, envia `Access-Control-Allow-Origin: *` e devolve:

```json
{
  "source": "stackoverflow-scrape",
  "tag": "reactjs",
  "totalQuestions": 473723,
  "recentQuestions": [
    { "title": "...", "url": "...", "answers": 0, "votes": 2, "unanswered": true }
  ]
}
```

Quando `location.hostname` for `localhost`/`127.0.0.1`, o app tenta esse endpoint primeiro e cai para a Stack Exchange API se ele não responder. Em produção (HTTPS) ele nem tenta, evitando *mixed content*.

---

## 4. Publicar no GitHub Pages

O repositório já está configurado para Pages a partir de `main` / raiz. Para publicar numa nova branch:

```bash
git add .
git commit -m "DevTrends Insights"
git push origin main
```

Depois, em **Settings → Pages → Build and deployment**, selecione **Deploy from a branch** → `main` → `/ (root)`. Ou via CLI:

```bash
gh api -X POST repos/PedroNunes0z/devtrends/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

O arquivo `.nojekyll` impede que o GitHub ignore pastas/arquivos com `_`. `sitemap.xml` e `robots.txt` já apontam para a URL pública.

---

## 5. SEO

- `index.html` + **27 páginas estáticas** em `reports/<slug>.html` — conteúdo legível por crawlers sem JavaScript.
- `<title>`, `meta description`, `canonical`, Open Graph, Twitter Card por página.
- **JSON-LD**: `WebSite` + `SearchAction`, `SoftwareApplication`, `FAQPage`, `Dataset` e `BreadcrumbList`.
- `sitemap.xml` com `lastmod` / `changefreq` / `priority`, `robots.txt`, `og-default.png` 1200×630, `favicon.svg`.
- Cada tecnologia tem URL própria e compartilhável; o título é atualizado com a nota real após a consulta.

---

## 6. Componentes e visual

O design segue o sistema **Terminal Dark** descrito em [`SKILL.md`](./SKILL.md): canvas `#0A0B0D`, superfícies em camadas, bordas de 1px, paleta de sintaxe como único sistema de cor, Inter + JetBrains Mono, código real como hero, zero gradientes/sombras.

Dois componentes do **Magic UI** foram portados para Vanilla JS (sem React, sem `motion`, sem Tailwind):

| Componente | Arquivo | Adaptação |
| --- | --- | --- |
| [Dither Field](https://magicui.design/docs/components/dither-field) | `assets/js/dither-field.js` | Mesmos shaders WebGL2 (Bayer 8×8, duas passagens), agora num `<canvas>` **fixo no background da página inteira**, cor única `#82AAFF`, frame estático, brilho sob o ponteiro sob demanda, fallback CSS e respeito a `prefers-reduced-motion`. |
| [Number Ticker](https://magicui.design/docs/components/number-ticker) | `assets/js/number-ticker.js` | Mesma mola (`damping 60`, `stiffness 100`), disparo único por `IntersectionObserver`, `Intl.NumberFormat`, `direction` e `decimalPlaces`. Usado em **todos os números dos relatórios**. |

Outras decisões de interface:

- **Sem emojis**: todas as setas/ícones são SVG inline em `assets/js/icons.js`.
- **Hero**: título em cima, bloco de código em largura total abaixo.
- **Pipeline**: os três contêineres (`01 · github.js`, `02 · stackoverflow.js`, `03 · gemini.js`) empilhados verticalmente, separados por hairlines.
- **Opções de análise**: em cada relatório o usuário seleciona **foco** (geral/carreira/adoção/aprendizado/manutenção), **profundidade** (rápida/padrão/profunda) e **perfil** (iniciante/intermediário/avançado). Essas escolhas são incluídas no prompt enviado ao Gemini junto com os dados do GitHub e Stack Overflow.
- **Saída do Gemini como interface**: em vez de texto puro, a resposta é renderizada em:
  - **gauge** para o Índice de Vitalidade;
  - **badge colorido** para a tendência;
  - **tags de saúde** coloridas;
  - **gráfico de barras** para a decomposição do índice (`scoreBreakdown`);
  - **cards** para projeção (horizonte, risco, momentum);
  - **tabela em duas colunas** para comparativo (pontos fortes, pontos de atenção, alternativas);
  - **tabela** para as métricas brutas com barras proporcionais.
- **Gráfico de linha do tempo**: SVG calculado a partir dos totais reais; 11 pontos estimados (tracejado) + ponto atual real (contínuo), com a proveniência escrita na legenda.
- **Responsivo**: testado em 375, 640, 768, 1024, 1280 e 1536 px; tabelas e blocos de código rolam horizontalmente sem quebrar o layout.

---

## 7. Estrutura

```
index.html                  landing (hero, quickstart, amostra real, pipeline, FAQ)
reports/*.html              27 páginas estáticas de relatório (SEO)
assets/css/styles.css       Terminal Dark em CSS puro
assets/js/
  config.js                 configuração pública + localStorage
  icons.js                  ícones SVG (sem emojis)
  dither-field.js           port vanilla do Magic UI Dither Field
  number-ticker.js          port vanilla do Magic UI Number Ticker
  highlight.js              tokenizador real + botão de copiar
  data.js                   GitHub / Stack Exchange / scraper / Gemini / heurística / timeline
  widgets.js                cartão de tendência, gauge, tags, gráfico de barras, projeção, comparativo, tabela, proveniência
  app.js                    bootstrap, navegação, painel Config, rodízio de chaves, opções de análise
assets/img/                 favicon.svg, og-default.png
tools/
  generate-pages.mjs        gera HTMLs + sitemap (Node, sem dependências)
  scraper.mjs               API de scraping local opcional (Node, sem dependências)
  og-template.html          molde usado para gerar og-default.png
config.example.js           modelo de config local
SKILL.md                    sistema de design de referência
```

---

## 8. Honestidade dos dados e uso do Gemini

- Estrelas, forks, issues, watchers e datas: **GitHub REST API**.
- Total de perguntas e total sem resposta: **Stack Exchange API** (ou HTML do scraper local).
- Frequência de perguntas sem resposta: amostra das perguntas recentes (scraping ou API).
- Histórico de 12 meses: **estimado** a partir dos totais reais de hoje, da idade do repositório e da velocidade real dos últimos stargazers. O gráfico diz isso explicitamente.
- Sem chaves Gemini: nota, tendência e tags vêm de uma **heurística local**, identificada na interface.
- Com chaves Gemini: o prompt inclui obrigatoriamente os dados do **GitHub API**, dados do **Stack Overflow** e as **opções selecionadas pelo usuário** na interface (foco, profundidade, perfil, tecnologia de comparação). A resposta é **sempre estruturada (JSON)** e renderizada como widgets, nunca como texto puro.
- Cada widget mostra a origem; falhas de cota/bloqueio viram avisos, não números inventados silenciosamente.
- Se o GitHub não responder, estrelas/forks/atividade aparecem como **indisponível** (`—`), a série de estrelas é omitida do gráfico, a confiança cai e a tag `#DadosDoGitHubAusentes` sinaliza a lacuna. Nada é preenchido com `0` ou com uma data inventada.

---

## 9. Licença

MIT. Dados: GitHub e Stack Exchange conforme seus termos; conteúdo do Stack Overflow sob CC BY-SA.
