# Cérebro Gemini no celular — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Sexta-feira conversa livremente usando o Gemini (cota grátis do Google), no celular e no PC, e fica publicada num endereço `https://` para instalar no celular.

**Architecture:** Novo módulo puro `assistente/js/ia-gemini.js` (mesmo formato UMD de `js/ia.js`/`js/voz-google.js`) chama a Interactions API do Gemini com a chave do usuário e troca de modelo quando a cota acaba. O `app.js` ganha o motor `'gemini'` na cadeia Claude Code → Gemini → API do Claude → resposta local. Um workflow novo publica `assistente/` no GitHub Pages.

**Tech Stack:** JavaScript sem build (navegador + Electron), `node --test`, Playwright (Python) para ponta a ponta, GitHub Actions (`actions/deploy-pages`).

**Spec:** `docs/superpowers/specs/2026-11-19-cerebro-gemini-celular-design.md`

## Global Constraints

- Chave: a mesma `S.cfg.geminiChave` ("Chave do Google AI Studio"); só vai para `generativelanguage.googleapis.com`, nunca para código, logs ou outro servidor.
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/interactions`, headers `Content-Type: application/json` e `x-goog-api-key: <chave>`.
- Modelos, nesta ordem: `gemini-3.8-flash`, reserva `gemini-3.5-flash-lite` (os dois com cota grátis, conferidos na página de preços do Google em 19/11/2026).
- Respostas em português do Brasil, até 3 frases curtas, sem markdown (mesmo prompt de sistema que a conversa com o Claude já usa).
- Comandos locais (cérebro + organizador) continuam resolvidos antes de qualquer IA.
- Ordem no "Automático": Claude Code (se instalado, só PC) → Gemini (se tiver chave) → API do Claude (se tiver chave) → mensagem local.
- Mensagens ao usuário em português simples, sem código de erro cru.

## Review Focus

1. **Cota acaba no meio do dia (429 nos dois modelos)** → ela diz que a conversa grátis do Google acabou por hoje, pausa o Gemini por 1 hora e, se houver chave do Claude, usa ela na mesma resposta. Teste: Task 2, `cota nos dois modelos`.
2. **Sem internet no celular** → "Estou sem internet agora…" e os comandos locais seguem funcionando; não pausa o Gemini (a próxima tentativa já pode dar certo). Teste: Task 1 `sem conexão`; Task 2 `sem internet não pausa`.
3. **Chave errada ou colada com espaço** → `trim()` na chave; resposta "A chave do Google AI Studio não foi aceita. Confira em Ajustes." Teste: Task 1 `chave inválida` e `chave com espaços`.
4. **Resposta do Google sem texto (bloqueio de segurança ou formato inesperado)** → mensagem de desculpa curta, nunca `undefined` na tela. Teste: Task 1 `resposta sem texto`.
5. **Celular sem nenhuma chave** → em vez de só "essa eu ainda não sei", explica onde colar a chave grátis (`aistudio.google.com/apikey`) — só fora do app de PC com Claude Code. Teste: Task 2 `sem chave explica`.

---

### Task 1: Módulo `ia-gemini.js`

**Files:**
- Create: `assistente/js/ia-gemini.js`
- Test: `assistente/tests/ia-gemini.test.js`

**Interfaces:**
- Produces (global `window.IA_GEMINI` e `module.exports`):
  - `MODELOS: string[]` = `['gemini-3.8-flash', 'gemini-3.5-flash-lite']`
  - `montarEntrada(historico: Array<{role:'user'|'assistant', content:string}>, nome: string): string` — texto único para o `input`: as mensagens anteriores como "Usuário: …"/"<nome>: …" sob "Conversa recente:", e a última mensagem do usuário depois de "Mensagem nova:". Histórico de 1 item → só o texto dele.
  - `extrairTexto(resposta: object): string` — junta os `text` dos itens `type:'text'` do último step `type:'model_output'`; aceita `output_text` se existir; devolve `''` se não achar.
  - `perguntar({ chave, sistema, historico, nome, modelo?, sinal?, fetch? }): Promise<{ texto: string, modelo?: string, erro?: true, cota?: true, chaveInvalida?: true, semRede?: true }>` — tenta `modelo` se vier, senão cada um de `MODELOS`; em 429 passa para o próximo; se todos derem 429 → `{ erro, cota }`. `fetch` injetável para teste (padrão: `globalThis.fetch`).
- Corpo da requisição: `{ model, store: false, system_instruction: sistema, input: [{ type: 'user_input', content: [{ type: 'text', text: montarEntrada(...) }] }] }`.

- [ ] **Step 1: Write the failing tests** (`fetch` falso que grava a requisição e devolve `{ ok, status, json }`):
  - `montarEntrada com histórico`: `[{user:'oi'},{assistant:'Oi! Tudo bem?'},{user:'me conta uma curiosidade'}]`, nome `'Sexta-feira'` → contém `'Usuário: oi'`, `'Sexta-feira: Oi! Tudo bem?'` e termina com `'Mensagem nova: me conta uma curiosidade'`; um item só → `'oi'`.
  - `resposta ok`: resposta `{ steps: [{ type:'user_input' }, { type:'model_output', content:[{ type:'text', text:'Polvos têm três corações.' }] }] }` → `{ texto: 'Polvos têm três corações.', modelo: 'gemini-3.8-flash' }`; a requisição foi para a URL do Global Constraints, com header `x-goog-api-key` igual à chave e `body.model === 'gemini-3.8-flash'`, `body.store === false`, `body.system_instruction === sistema`.
  - `output_text`: `{ output_text: 'Oi!' }` → `texto 'Oi!'`.
  - `cota no primeiro modelo`: 429 e depois 200 → segunda requisição com `model 'gemini-3.5-flash-lite'`, resultado com `modelo: 'gemini-3.5-flash-lite'`.
  - `cota nos dois modelos`: 429, 429 → `{ erro: true, cota: true }` e `texto` contendo `'acabou'`.
  - `chave inválida`: 400 com `{ error: { message: 'API key not valid' } }` → `{ erro: true, chaveInvalida: true }`, texto contendo `'não foi aceita'`; não tenta o segundo modelo.
  - `chave com espaços`: chave `'  AIza123 \n'` → header enviado `'AIza123'`.
  - `sem conexão`: `fetch` que rejeita `TypeError` → `{ erro: true, semRede: true }`, texto contendo `'sem internet'`.
  - `resposta sem texto`: 200 com `{ steps: [] }` → `{ erro: true }` e texto não vazio, sem `'undefined'`.
  - `erro do servidor`: 500 → `{ erro: true }`, texto em português, sem tentar o segundo modelo.
- [ ] **Step 2: Run** `cd assistente && node --test tests/ia-gemini.test.js` → FAIL (`Cannot find module '../js/ia-gemini.js'`).
- [ ] **Step 3: Implement** `assistente/js/ia-gemini.js` com as interfaces acima (padrão UMD de `js/ia.js`: `(function (raiz) { … })(typeof window !== 'undefined' ? window : globalThis)`).
- [ ] **Step 4: Run** `node --test tests/ia-gemini.test.js` → PASS; `node --test tests/*.test.js` → todos passam.
- [ ] **Step 5: Commit** `git add assistente/js/ia-gemini.js assistente/tests/ia-gemini.test.js && git commit -m "Gemini chat module with quota fallback"`

### Task 2: Ligar o Gemini na Sexta-feira

**Files:**
- Modify: `assistente/js/app.js` — `motorCerebro()` (~linha 282), `case 'desconhecido'` (~linha 1665), Ajustes → Cérebro (~linha 1983)
- Modify: `assistente/index.html` (incluir `js/ia-gemini.js` depois de `js/ia.js`), `assistente/sw.js` (lista de arquivos + `CACHE` `'lumi-v12'`)
- Test: `/home/claude/scripts/gemini-e2e.py` (Playwright; intercepta `generativelanguage.googleapis.com` com `page.route`, sem rede real)

**Interfaces:**
- Consumes: `window.IA_GEMINI.perguntar(...)` (Task 1).
- Produces em `app.js`:
  - `motorCerebro(): 'cc' | 'gemini' | 'api' | null` — `S.cfg.cerebro` aceita também `'gemini'`; no `'auto'` segue a ordem do Global Constraints; Gemini só conta se `S.cfg.geminiChave.trim()` e `Date.now() >= R.geminiPausa`.
  - `contextoConversa(): { sistema: string, historico: Array<{role, content}> }` — o prompt de sistema e o histórico que hoje estão dentro do ramo `'api'`, extraídos para ser usados pelos dois motores.
  - `R.geminiPausa: number` — `Date.now() + 60*60e3` quando a resposta vier com `cota`.

- [ ] **Step 1: Write the failing e2e** `gemini-e2e.py` (abre `Lumi.html` gerado, limpa `localStorage`, grava `geminiChave` pela tela de Ajustes ou por `LUMI.estado.cfg`, abre com Alt+K e conversa):
  - `conversa`: rota devolve 200 `{steps:[{type:'model_output',content:[{type:'text',text:'Polvos têm três corações!'}]}]}` → ao mandar "me conta uma curiosidade", a última `.msg.k` é exatamente `'Polvos têm três corações!'`; a requisição interceptada tem `x-goog-api-key` igual à chave salva.
  - `comandos continuam locais`: "timer de 5 minutos" e "adiciona leite na lista" respondem sem nenhuma requisição ao Google.
  - `cota nos dois modelos`: rota sempre 429 → resposta contém `'acabou'`; segunda pergunta logo depois não faz requisição (pausado).
  - `cota com reserva do Claude`: rota 429 e `S.cfg.iaChave` preenchida → é chamado o motor `'api'` (verificar com `window.IA.perguntar` substituído por um stub que devolve `{ texto: 'resposta do Claude' }`).
  - `sem internet não pausa`: rota `abort()` → resposta contém `'sem internet'`; a próxima pergunta faz requisição de novo.
  - `sem chave explica`: sem `geminiChave` e sem `iaChave` → resposta contém `'aistudio.google.com'`.
  - `Ajustes`: a lista "Cérebro" tem a opção `value="gemini"` e um campo para a chave do Google (mesmo `data-cfg="geminiChave"`).
  - Nenhum `pageerror`.
- [ ] **Step 2: Run** `cd assistente && npm run -s unico && python3 /home/claude/scripts/gemini-e2e.py "file://$PWD/Lumi.html"` → FAIL (`conversa` recebe "essa eu ainda não sei").
- [ ] **Step 3: Implement** em `app.js`: `motorCerebro`, `contextoConversa`, ramo `'gemini'` no `desconhecido` usando `trabalhar('💭', 'Pensando', …)` como o ramo `'api'`; em `cota` grava `R.geminiPausa` e, se `S.cfg.iaChave`, cai no ramo `'api'` na mesma resposta; mensagem "sem chave" com o link `https://aistudio.google.com/apikey` (só quando `!DESKTOP || !CC`); Ajustes → Cérebro ganha `['gemini', 'Gemini (cota grátis do Google)']` e o campo de chave "Chave do Google AI Studio (a mesma da voz)". Incluir o script no `index.html` e no `sw.js`.
- [ ] **Step 4: Run** o e2e → PASS; `node --test tests/*.test.js` → todos passam; `scripts/recursos.py` (estudo/compras/gastos) continua sem erros.
- [ ] **Step 5: Commit** `git add assistente/js/app.js assistente/index.html assistente/sw.js assistente/Lumi.html && git commit -m "Gemini as a chat brain, with quota pause and Claude fallback"`

### Task 3: Publicar no GitHub Pages

**Files:**
- Create: `.github/workflows/lumi-pages.yml`
- Modify: `.github/workflows/lumi-windows.yml` (incluir `tests/util.test.js tests/organizador.test.js tests/ia-gemini.test.js` no passo Testes)
- Test: `/home/claude/scripts/celular.py` (Playwright com viewport 390×780, `is_mobile`, servindo `assistente/` por `python3 -m http.server`)

**Interfaces:**
- Produces: site em `https://reiscaiosantil-ai.github.io/teste/` (raiz = conteúdo de `assistente/`).

- [ ] **Step 1: Write the check** `celular.py`: abre `http://localhost:8765/index.html` em viewport de celular → `navigator.serviceWorker.ready` resolve; `manifest.webmanifest` responde 200 com `display: 'standalone'`; a pílula abre ao tocar; conversa com o Gemini simulado (mesma rota da Task 2) funciona; nenhum `pageerror`.
- [ ] **Step 2: Run it** → PASS já com o código da Task 2 (este passo prova que a versão servida por `https`/http funciona, não só o arquivo único).
- [ ] **Step 3: Create** `lumi-pages.yml`: gatilho `push` na branch `claude/kobi-virtual-assistant-8xc699` com `paths: ['assistente/**', '.github/workflows/lumi-pages.yml']` + `workflow_dispatch`; `permissions: { contents: read, pages: write, id-token: write }`; `concurrency: { group: pages, cancel-in-progress: true }`; job em `ubuntu-latest`: `actions/checkout@v4` → `actions/setup-node@v4` (node 22) → `npm ci` + `node --test tests/cerebro.test.js tests/util.test.js tests/organizador.test.js tests/ia-gemini.test.js` em `assistente` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` com `path: assistente` → job `deploy` com `environment: github-pages` e `actions/deploy-pages@v4`.
- [ ] **Step 4: Verify** `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/lumi-pages.yml'))"` sem erro; os mesmos testes do workflow rodam localmente.
- [ ] **Step 5: Commit** `git add .github/workflows/ && git commit -m "Publish Sexta-feira to GitHub Pages for phones"`

### Task 4: Documentar, enviar e conferir

**Files:**
- Modify: `assistente/README.md` (seção "Cérebro para conversar" ganha o Gemini; nova seção curta "No celular" com o endereço, "Adicionar à tela inicial", o que funciona e o que não, e os dados separados do PC)
- Modify (Projects): `claude/lumi-estado-do-projeto.md`

- [ ] **Step 1:** Escrever as duas atualizações.
- [ ] **Step 2: Commit** `git commit -am "Document the Gemini brain and the phone version"`.
- [ ] **Step 3: Push** `git -c push.negotiate=true push origin HEAD:claude/kobi-virtual-assistant-8xc699`.
- [ ] **Step 4: Verify** com `gh run list --repo reiscaiosantil-ai/teste --branch claude/kobi-virtual-assistant-8xc699 --limit 3`: "Lumi para Windows" e o workflow de Pages terminam com sucesso. Se o de Pages falhar com "Pages not enabled", avisar o dono para ligar Settings → Pages → Source: GitHub Actions e rodar de novo (`gh workflow run lumi-pages.yml`).
