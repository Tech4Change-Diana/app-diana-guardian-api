# Análise Técnica — `app-diana-guardian-api` (API do Responsável)

> A API HTTP fina que **serve o app do responsável**. Entrega o **alerta estruturado**
> (score, prioridade, categorias, sinais, frequência, escalada, sequência, justificativa,
> recomendação) e **NUNCA a conversa integral** (RF-16). Fonte de dados **majoritariamente MOCK**
> com alertas reais ocasionais, lidos do **OCI Object Storage (JSON)** gravado pelo núcleo.
> **Sem autenticação no MVP** (decisão explícita — ver §8).
>
> Este documento é o **plano técnico de implementação**. Não implementa nada ainda: orienta os PRs
> de desenvolvimento (§11). Em caso de divergência de contrato, **`app-diana-monitoring/docs/`
> prevalece** (ver [`contracts.md`](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/docs/contracts.md)).

Selos usados: 🧊 **PRINCÍPIO CONGELADO** (não muda sem revisão) · ⚙️ **CONFIGURÁVEL** (parâmetro/heurística de MVP).

---

## 0. Contexto e fronteiras

```text
Núcleo (app-diana-monitoring)                  guardian-api (ESTE repo)        guardian-web
ingestor → pipeline → risk-engine  ──grava──▶  Object Storage (JSON)  ──lê──▶  HTTP fina  ──▶  app do responsável
                                               alerts/<conv>/<ts>.json         GET/POST/PUT
```

- O núcleo **produz** `AnalysisResult` agregado e **grava** um `AlertRecord` por alerta no Object
  Storage (layout em §5). O guardian-api é **somente-leitura** sobre esses alertas.
- O guardian-api **não** roda pipeline, **não** chama LLM, **não** acessa a `Conversation`. Ele
  lê alertas prontos, **resume** para a UI e coleta **feedback** + **settings**.
- 🧊 **P4/RF-16:** o responsável recebe alerta estruturado, **nunca a conversa integral**. A API é
  a última fronteira antes da tela — a garantia de RF-16 é reforçada aqui (§6).

---

## 1. Objetivo e princípios de porte

| # | Princípio | Selo |
| --- | --- | --- |
| A1 | **Fina e sem estado de negócio.** A API não recalcula risco; só lê, resume e serve. | 🧊 |
| A2 | **Mesmo contrato do núcleo.** Consome `AnalysisResult`/`AlertRecord` idênticos (mock e real). | 🧊 |
| A3 | **Minimização na borda.** Nunca serializa conteúdo bruto; expõe só o resumo necessário à UI (§6). | 🧊 |
| A4 | **Sem DB gerenciado.** Estado = JSON no Object Storage (alerts, feedback, settings), como o núcleo. | 🧊 (MVP) |
| A5 | **Fonte plugável.** `fixtures` (mock) | `file` (dev) | `oci` (Object Storage) por variável de ambiente. | ⚙️ |
| A6 | **Auth é um seam, não uma feature do MVP.** Placeholder aberto/chave simples; OIDC na Fase 2 (§8). | ⚙️ |

---

## 2. Stack e scaffolding

### 2.1 Escolhas de stack (🧊 alinhadas ao núcleo)

| Item | Escolha | Por quê |
| --- | --- | --- |
| Runtime | **Node.js ≥ 22** | mesma base do núcleo; `node:22-slim` na OCI. |
| Linguagem | **TypeScript 5.6**, ESM (`"type": "module"`, `NodeNext`) | espelha `app-diana-monitoring`. |
| HTTP | **Fastify 4** | leve, TS de primeira classe, validação por schema, hooks (CORS/auth). *(Alternativa: Express — mais familiar, menos schema.)* |
| Validação | **zod** | já usado no núcleo; valida env, body de feedback e settings. |
| Testes | **vitest** + **supertest**/`fastify.inject` | mesmo runner do núcleo. |
| Lint/format | **ESLint 9 (flat)** + **Prettier** | copiar config do núcleo (sem regras React). |
| Build | `tsc -p tsconfig.json` → `dist/` | idêntico ao núcleo. |

> Deps de runtime mínimas: `fastify`, `@fastify/cors`, `zod`. Sem SDK da OCI no MVP inicial; o
> `OciObjectStorageAlertReader` (§5.3) entra num PR próprio, isolando a dependência `oci-sdk`.

### 2.2 `package.json` (esboço)

```jsonc
{
  "name": "app-diana-guardian-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "main": "dist/main.js",
  "scripts": {
    "dev": "node --watch --experimental-strip-types src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check": "npm run lint && npm run typecheck && npm run test"
  },
  "dependencies": { "fastify": "^4.28.0", "@fastify/cors": "^9.0.0", "zod": "^3.23.8" },
  "devDependencies": {
    "@eslint/js": "^9.13.0", "@types/node": "^22.8.0", "eslint": "^9.13.0",
    "globals": "^15.11.0", "prettier": "^3.3.3", "typescript": "^5.6.3",
    "typescript-eslint": "^8.11.0", "vitest": "^2.1.4"
  }
}
```

### 2.3 `tsconfig.json` / ESLint

Copiar **na íntegra** os do núcleo (`app-diana-monitoring/tsconfig.json` e `eslint.config.js`):
`target/lib ES2023`, `module NodeNext`, `strict`, `noUncheckedIndexedAccess`, `outDir dist`,
`rootDir src`. ESLint flat com `@typescript-eslint` recomendado, `ignores: ["dist","coverage","node_modules"]`.

### 2.4 Variáveis de ambiente — `.env.example`

```bash
# app-diana-guardian-api — API do responsável. Copie para .env (NUNCA versione .env).

# --- servidor HTTP ---
PORT=8080
HOST=0.0.0.0
LOG_LEVEL=info                 # debug | info | warn | error

# --- fonte de alertas ---
# fixtures (default, demo) | file (lê o STATE_DIR do núcleo) | oci (Object Storage)
ALERTS_SOURCE=fixtures
# Quando ALERTS_SOURCE=file: mesmo diretório que o núcleo usa (STATE_DIR).
STATE_DIR=../app-diana-monitoring/.state
# Quando ALERTS_SOURCE=oci: bucket/namespace onde o núcleo grava alerts/, feedback/, settings/.
OCI_OS_BUCKET=diana-monitoring
OCI_OS_NAMESPACE=
OCI_OS_REGION=

# --- persistência de escrita (feedback + settings) ---
# memory (default p/ fixtures) | file | oci  — segue ALERTS_SOURCE se não definido.
WRITE_BACKEND=memory

# --- autenticação (MVP: SEM auth) ---
# Vazio = aberto (só para demo). Se definido, exige header "x-api-key" (§8).
GUARDIAN_API_KEY=
# CSV de origens permitidas para CORS (o guardian-web). "*" só em demo local.
CORS_ORIGINS=*
```

### 2.5 Runtime na OCI Container Instances

- **Servidor de longa duração** (≠ núcleo, que roda `--once`): escuta em `PORT`, 1 Container
  Instance simples. Sem OKE/Functions.
- **`GET /health`** (§7.5) para readiness/liveness da Container Instance.
- Imagem multi-stage `node:22-slim`, usuário não-root, `ENTRYPOINT ["node","dist/main.js"]`
  (sem `--once`). Espelha o Dockerfile do núcleo trocando o modo de execução.
- Segredos (ex.: credencial OCI para ler o bucket) via env da Container Instance ou OCI Vault;
  no MVP com `ALERTS_SOURCE=fixtures` não há segredo.

---

## 3. Layout de pastas

```text
app-diana-guardian-api/
├─ docs/
│  └─ analise-guardian-api.md        # este documento
├─ src/
│  ├─ main.ts                        # bootstrap: carrega config, monta server, listen(PORT)
│  ├─ config/
│  │  └─ env.ts                      # zod: PORT, ALERTS_SOURCE, WRITE_BACKEND, GUARDIAN_API_KEY…
│  ├─ contracts/                     # PORTADO do núcleo (idêntico) — futuro @diana/contracts
│  │  ├─ types.ts                    # Conversation, AnalysisResult, RiskCategory, labels…
│  │  └─ index.ts
│  ├─ domain/
│  │  ├─ alertId.ts                  # encode/decode do id composto (conversationId + processedAt)
│  │  ├─ summarize.ts                # AnalysisResult -> AlertSummary / AlertView (RF-16, §6)
│  │  └─ viewTypes.ts                # AlertSummary, AlertView, FeedbackRecord, GuardianSettings
│  ├─ sources/                       # LEITURA de alertas (read-only)
│  │  ├─ AlertReader.ts              # interface
│  │  ├─ FixtureAlertReader.ts       # mock (default)
│  │  ├─ FileAlertReader.ts          # lê STATE_DIR/alerts/** do núcleo
│  │  ├─ OciObjectStorageAlertReader.ts  # lista+lê prefixo alerts/ do bucket
│  │  └─ fixtures/                   # AlertRecord[] de demonstração
│  ├─ store/                         # ESCRITA de feedback + settings
│  │  ├─ FeedbackStore.ts            # interface + memory/file/oci
│  │  └─ SettingsStore.ts            # interface + memory/file/oci
│  ├─ http/
│  │  ├─ server.ts                   # cria Fastify, plugins (cors, auth), rotas
│  │  ├─ routes/
│  │  │  ├─ alerts.ts                # GET /alerts, GET /alerts/:id
│  │  │  ├─ feedback.ts              # POST /alerts/:id/feedback
│  │  │  ├─ settings.ts             # GET/PUT /settings
│  │  │  └─ health.ts               # GET /health
│  │  └─ auth.ts                     # hook de API key (placeholder) + seam OIDC (§8)
│  └─ logger.ts
├─ test/
├─ .env.example  .gitignore  .dockerignore  Dockerfile
├─ eslint.config.js  .prettierrc.json  tsconfig.json
├─ package.json  README.md
```

---

## 4. Contrato compartilhado (`@diana/contracts`)

- 🧊 **A2:** o guardian-api **importa o contrato**, nunca o runtime do núcleo. No MVP o pacote
  `@diana/contracts` ainda não existe (nascerá em `app-diana-llm-analyzer`), então **portamos os
  tipos** para `src/contracts/` — **cópia idêntica** de
  [`app-diana-monitoring/src/contracts/types.ts`](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/src/contracts/types.ts)
  (`Conversation`, `AnalysisResult`, `RiskAssessment`, `DetectedSignal`, `RiskPrediction`,
  `ContextualFactor`, `ExplanationResult`, `RiskCategory`, `riskCategoryLabels`, …).
- Tipo de persistência do alerta (o que o núcleo grava): `AlertRecord`
  ([`src/state/checkpoint.ts`](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/src/state/checkpoint.ts)):

  ```ts
  interface AlertRecord {
    conversationId: string;
    processedAt: string;   // ISO 8601
    result: AnalysisResult; // agregado — NUNCA contém a Conversation
  }
  ```

- **Regra de sincronização:** quando `@diana/contracts` for publicado, substituir `src/contracts/`
  pela dependência e remover a cópia. Até lá, um teste `contracts.parity.test.ts` (⚙️) pode comparar
  o hash dos tipos com o do núcleo para detectar deriva.

---

## 5. Fonte de dados no MVP

### 5.1 Layout no Object Storage (gravado pelo núcleo — espelha o `FileStateStore`)

```text
<bucket>/  (ou STATE_DIR/ em dev)
├─ alerts/<conversationId>/<processedAt>.json     # AlertRecord  ← guardian LÊ
├─ checkpoints/<conversationId>.json              # (interno do núcleo; guardian ignora)
├─ telegram/offset.json                           # (interno do núcleo; guardian ignora)
├─ feedback/<conversationId>/<processedAt>.json   # FeedbackRecord ← guardian GRAVA (§9)
└─ settings/guardian.json                         # GuardianSettings ← guardian GRAVA (§7.4)
```

> `alerts/`, `checkpoints/`, `telegram/` já são o layout real do núcleo
> ([`FileStateStore`](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/src/state/fileStateStore.ts)).
> `feedback/` e `settings/` são **novos prefixos** introduzidos por este serviço (não conflitam).

### 5.2 Interface de leitura

```ts
interface AlertReader {
  listAlerts(): Promise<AlertRecord[]>;                         // todos os alertas conhecidos
  getAlert(conversationId: string, processedAt: string): Promise<AlertRecord | null>;
}
```

Implementações (selecionadas por `ALERTS_SOURCE`):

| Backend | Uso | Como lê |
| --- | --- | --- |
| `FixtureAlertReader` | **default (demo)** | `AlertRecord[]` embutidos em `sources/fixtures/` (derivados dos `demoScenarios` do protótipo). |
| `FileAlertReader` | dev / integração local | varre `STATE_DIR/alerts/**/*.json`. |
| `OciObjectStorageAlertReader` | produção MVP | `listObjects(prefix="alerts/")` + `getObject` no bucket. |

- **Majoritariamente mock + real ocasional:** com `ALERTS_SOURCE=oci`, o reader lê o que houver no
  bucket; para a demo, o núcleo semeia o bucket com resultados mock e, quando a pipeline gera um
  alerta real, ele aparece na **mesma lista, no mesmo formato** (🧊 P8). Um modo `both` (fixtures +
  oci) é uma extensão ⚙️ opcional se quisermos garantir volume na demo.
- **Cache:** leitura direta no MVP (volume baixo). Um cache em memória com TTL curto é ⚙️ opcional.

---

## 6. Modelo de dados — alerta **resumido** (RF-16)

O `AnalysisResult` **já** é privacy-safe (não contém `Conversation`). Mesmo assim, a API aplica
**duas projeções** para servir a UI, reforçando A3/RF-16.

### 6.1 `AlertSummary` — item de lista (`GET /alerts`)

Deriva de `AlertRecord` o mínimo para a `AlertsList`/`Dashboard` do protótipo:

```ts
interface AlertSummary {
  id: string;                 // alertId (§6.3)
  conversationId: string;
  childName: string;          // AnalysisResult não tem childName → ver nota 6.4
  title: string;              // rótulo curto da categoria principal
  category: string;           // riskCategoryLabels[categoria principal]
  priority: "alta" | "media" | "baixa";   // mapeado de RiskPriority (nota 6.5)
  level: RiskLevel;
  score: number;              // 0–100
  requiresGuardianAttention: boolean;
  detectedAt: string;         // = processedAt (ISO)
}
```

### 6.2 `AlertView` — detalhe (`GET /alerts/{id}`)

É o `AnalysisResult` **já resumido para o responsável** — exatamente o que `AlertDetail.tsx` consome
(`assessment`, `explanation.summary/topSignals/contextualFactors/recommendedActions`,
`assessment.categories`, `model`). Regras de minimização aplicadas antes de serializar:

- 🧊 **Nunca** incluir `Conversation`/texto de mensagem (o `AnalysisResult` já não tem — a regra é
  uma **asserção defensiva** no summarizer: se algum campo bruto aparecer no futuro, é removido).
- `signals[].messageIds` / `topSignals[].messageIds`: são **referências opacas** (ex.: `"MSG-1291"`),
  sem conteúdo. A UI usa apenas `.length` ("N mensagens"). ⚙️ **Hardening opcional:** trocar por
  `occurrences: number` para não vazar nem os identificadores. No MVP mantém-se `messageIds`
  (a UI depende do `.length`), com nota de evolução.
- `audit`/`features`/`privacy`: úteis para transparência; podem ser omitidos do payload da UI por
  padrão e expostos sob `?verbose=1` (⚙️).

### 6.3 `alertId` (chave estável)

O alerta é identificado por **(`conversationId`, `processedAt`)**. Para caber numa rota
`GET /alerts/{id}`:

```ts
alertId = base64url(`${conversationId}|${processedAt}`)   // decodificável, sem colisão
```

`decode(alertId)` → `{ conversationId, processedAt }`, usado por `getAlert(...)` e pelo feedback.
*(Alternativa ⚙️: hash SHA-1 curto + índice; o encode reversível é mais simples no MVP.)*

### 6.4 Nota — `childName` no summary

O `AnalysisResult` carrega `conversationId`, mas **não** `childName`/`childId` (esses vivem na
`Conversation`, que o guardian não vê). Opções (⚙️, decidir com o time do núcleo):

1. **Preferida:** o núcleo passa a incluir `childName` no `AlertRecord` (campo novo, não-sensível —
   apenas o primeiro nome já usado na UI). Pequena mudança de contrato, mantém RF-16.
2. Fallback no MVP: guardian exibe `"Criança"` / deriva de um mapa `conversationId→childName` em
   `settings` (fixtures já trazem o nome). Registrar como decisão em aberto (§12).

### 6.5 Mapa de prioridade

`RiskPriority` do contrato é `low|medium|high`; a UI usa `baixa|media|alta`. Mapa direto
(`high→alta`, `medium→media`, `low→baixa`). A **banda de 4 faixas** de negócio (baixa/moderada/alta/
crítica, §6.5 das regras) é ⚙️ e pode ser aplicada como rótulo derivado do `score` quando o enum for
estendido para `critical` na calibração — o guardian **apenas apresenta**, não recalcula (A1).

---

## 7. Rotas (conceituais)

Base: `/` · JSON · sem versão de path no MVP (⚙️ `/v1` na Fase 2). Todas passam pelo hook de auth
(§8, no-op quando `GUARDIAN_API_KEY` vazio) e CORS.

### 7.1 `GET /alerts` — lista (resumo)

- Query ⚙️: `?priority=alta|media|baixa`, `?limit`, `?cursor` (paginação simples), `?category`.
- Resposta: `{ items: AlertSummary[], nextCursor?: string }`, ordenado por `detectedAt` desc.
- Origem: `AlertReader.listAlerts()` → `summarize()` por item.

### 7.2 `GET /alerts/{id}` — detalhe (`AnalysisResult` resumido)

- `id` = `alertId`; decodifica → `getAlert(conversationId, processedAt)`.
- 200 `AlertView` · 404 se não existir · 400 se `id` malformado.

### 7.3 `POST /alerts/{id}/feedback` — feedback do responsável

- Body (zod): `{ verdict: "useful" | "false_positive" | "not_sure", note?: string }`.
- Grava `FeedbackRecord` (§9) via `FeedbackStore`. 201/204. Idempotência ⚙️: último feedback por
  `alertId` prevalece (sobrescreve) — simples para o MVP.

### 7.4 `GET /settings` · `PUT /settings` — preferências

- `GuardianSettings` espelha `settingsSections` do protótipo (Proteção, Privacidade, Responsável):
  `{ sections: { id, title, items: { id, label, description, enabled }[] }[] }` (validado por zod).
- 🧊 Sem auth e sem multiusuário no MVP → **um único documento global** `settings/guardian.json`
  (um responsável na demo). `GET` retorna default se ausente; `PUT` valida e persiste.
- Registrar como decisão em aberto: com auth (Fase 2), settings passa a ser **por responsável**.

### 7.5 `GET /health` — readiness/liveness

- `{ status: "ok", source: ALERTS_SOURCE, uptime }`. Sem auth. Usado pela Container Instance.

---

## 8. Sem autenticação no MVP (🧊 decisão; ⚙️ mitigação)

**Decisão explícita** (ver
[`05-experiencia-responsavel.md` §"Sem autenticação no MVP"](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/docs/05-experiencia-responsavel.md)
e [`06-mapeamento-oci.md`](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/docs/06-mapeamento-oci.md)):
o guardian-api **não tem camada de autenticação/IAM** no MVP.

### 8.1 Exposição no MVP

- **Aberto** por padrão (demo) **ou** protegido por **chave simples**: se `GUARDIAN_API_KEY` estiver
  definido, todas as rotas (exceto `/health`) exigem header `x-api-key` correspondente
  (comparação em tempo constante). Sem a variável → aberto.
- **CORS** restrito a `CORS_ORIGINS` (o domínio do guardian-web). `*` apenas em demo local.
- ⚙️ Complementos possíveis: restrição por IP na Container Instance, rate-limit
  (`@fastify/rate-limit`) — todos opcionais no MVP.

### 8.2 Nota de risco (🧊)

> Enquanto **não houver auth**, o guardian-api **não deve receber/servir dados sensíveis reais de
> crianças** de forma recorrente — coerente com a postura **mock-first**. A chave simples é um
> **freio de demonstração**, não controle de acesso real: não há identidade, autorização por
> responsável, nem auditoria de acesso. Qualquer alerta real exposto aqui é aceitável apenas em
> ambiente de demo controlado, com dados de teste.

### 8.3 Placeholder para a Fase 2 (OIDC / OCI IAM)

- **Seam já previsto:** `src/http/auth.ts` é um hook único. No MVP faz a checagem de API key
  (ou no-op). Na Fase 2 troca-se a implementação por **validação de token OIDC** (ex.: OCI IAM
  Identity Domains) — **adição, não reescrita** (mesmo princípio de "fora do MVP ≠ fora da
  arquitetura", doc 06).
- Efeitos derivados da Fase 2 a registrar: `settings` por responsável (§7.4), `childName`/vínculo por
  identidade (§6.4), escopo dos alertas por responsável, auditoria de acesso. Todos são **extensões**
  do modelo atual.

---

## 9. Feedback loop (human-in-the-loop, sem treino)

```text
Alerta ──▶ POST /alerts/{id}/feedback ──▶ FeedbackStore (Object Storage JSON) ──▶ dataset de avaliação (futuro)
```

```ts
interface FeedbackRecord {
  alertId: string;
  conversationId: string;
  processedAt: string;
  verdict: "useful" | "false_positive" | "not_sure";
  note?: string;
  createdAt: string; // ISO
}
```

- 🧊 No MVP o feedback é **apenas coletado** (grava em `feedback/<conversationId>/<processedAt>.json`).
  **Treinamento automático não é implementado** — igual ao protótipo (`docs/ml-architecture.md`) e à
  regra §10 das regras de negócio.
- Serve de insumo futuro para o **dataset de avaliação** do modelo (precision/recall/FPR). Nenhum
  laço automático fecha no MVP.

---

## 10. Testes e validação (mínimo do MVP)

- **Unit:** `summarize()` (AlertSummary/AlertView), `alertId` encode/decode, `env.ts` (zod),
  mapa de prioridade. **Asserção RF-16:** teste que garante que nenhuma serialização de resposta
  contém texto de mensagem/`Conversation`.
- **Contrato:** parse de fixtures/arquivos reais como `AnalysisResult` (falha se o contrato divergir).
- **HTTP (e2e leve):** `fastify.inject` nas 4 rotas + `/health`; 200/400/404; auth on/off; CORS.
- `npm run check` (lint + typecheck + test) verde antes de cada PR.

---

## 11. CHECKLIST de PRs (pequenos e ordenados)

> Cada PR: branch `feature/...` → PR para `develop`; commits em português; `npm run check` verde.

- [ ] **PR-01 — Scaffolding.** `package.json`, `tsconfig.json`, `eslint.config.js`,
      `.prettierrc.json`, `.gitignore` (corrigir `node_moodules`→`node_modules`), `.dockerignore`,
      `README.md`, `src/main.ts` mínimo + `src/logger.ts`. `npm run check` verde.
- [ ] **PR-02 — Contrato portado.** `src/contracts/` = cópia idêntica dos tipos do núcleo +
      `AlertRecord`. Teste de parse.
- [ ] **PR-03 — Config/env.** `src/config/env.ts` (zod): `PORT`, `HOST`, `LOG_LEVEL`,
      `ALERTS_SOURCE`, `WRITE_BACKEND`, `STATE_DIR`, `OCI_OS_*`, `GUARDIAN_API_KEY`, `CORS_ORIGINS`.
      `.env.example`. Testes de validação/cross-field.
- [ ] **PR-04 — Domínio de resumo.** `domain/viewTypes.ts`, `domain/alertId.ts`,
      `domain/summarize.ts` (RF-16 + asserção defensiva). Unit tests.
- [ ] **PR-05 — AlertReader + fixtures.** `sources/AlertReader.ts` + `FixtureAlertReader` +
      `sources/fixtures/` (AlertRecords de demo derivados dos `demoScenarios`).
- [ ] **PR-06 — HTTP base + leitura.** `http/server.ts` (Fastify + CORS + hook auth no-op),
      `GET /health`, `GET /alerts`, `GET /alerts/:id`. e2e com `fastify.inject`.
- [ ] **PR-07 — FileAlertReader.** Lê `STATE_DIR/alerts/**` (integra com o núcleo em dev).
- [ ] **PR-08 — Feedback.** `store/FeedbackStore.ts` (memory/file), `POST /alerts/:id/feedback`
      (zod). Testes.
- [ ] **PR-09 — Settings.** `store/SettingsStore.ts` (memory/file), `GET`/`PUT /settings` (zod +
      default). Testes.
- [ ] **PR-10 — Auth placeholder + CORS.** `http/auth.ts`: API key opcional (`x-api-key`) + seam
      OIDC documentado (§8.3). Testes on/off.
- [ ] **PR-11 — Backend OCI.** `OciObjectStorageAlertReader` + backends `oci` de Feedback/Settings
      (dependência `oci-sdk` isolada). Config `ALERTS_SOURCE=oci`.
- [ ] **PR-12 — Dockerfile + deploy.** Multi-stage `node:22-slim`, `/health`, notas de Container
      Instance (§2.5). Opcional: workflow de build.

Ordem de valor: **PR-01…06** já entregam a demo (fixtures → app do responsável). PR-07/11 conectam
ao núcleo real; PR-08/09 fecham feedback e settings; PR-10 e a Fase 2 endereçam auth.

---

## 12. Riscos e decisões em aberto (candidatas a ADR)

| # | Assunto | Decisão pendente |
| --- | --- | --- |
| D1 | `childName` no alerta (§6.4) | Núcleo inclui `childName` no `AlertRecord`, ou guardian usa fallback? (preferência: incluir no contrato). |
| D2 | `messageIds` no detalhe (§6.2) | Manter (UI usa `.length`) vs. trocar por `occurrences` no hardening. |
| D3 | Enum `RiskPriority` × banda de 4 faixas (§6.5) | Quando estender para `critical`? Alinhar com calibração do núcleo. |
| D4 | Sem auth (§8) | Confirmar exposição da demo (aberto vs. chave); cronograma do OIDC (Fase 2). |
| D5 | `@diana/contracts` (§4) | Migrar cópia local → pacote quando publicado em `app-diana-llm-analyzer`. |
| D6 | Multi-responsável | Settings/alertas por responsável só com auth (Fase 2). |

---

← Relacionados no núcleo:
[contracts](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/docs/contracts.md) ·
[02 — pipeline](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/docs/02-pipeline-background.md) ·
[05 — responsável](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/docs/05-experiencia-responsavel.md) ·
[06 — OCI](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/docs/06-mapeamento-oci.md) ·
[regras de negócio](https://github.com/Tech4Change-Diana/app-diana-monitoring/blob/develop/docs/regras-de-negocio.md)
