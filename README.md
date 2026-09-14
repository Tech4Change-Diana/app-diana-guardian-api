# app-diana-guardian-api

API HTTP fina que **serve o app do responsável** da DIANA. Entrega o **alerta
estruturado** (score, prioridade, categorias, sinais, fatores, justificativa,
recomendação) e **NUNCA a conversa integral** (RF-16).

É **somente-leitura** sobre os alertas gravados pelo núcleo
(`app-diana-monitoring`) no Object Storage; **resume** para a UI e coleta
**feedback** + **settings**. Não roda pipeline, não chama LLM, não acessa a
`Conversation`.

> Plano técnico completo: [`docs/analise-guardian-api.md`](docs/analise-guardian-api.md).
> Em caso de divergência de contrato, `app-diana-monitoring/docs/` prevalece.

## Stack

Node.js ≥ 22 · TypeScript 5.6 (ESM/NodeNext) · Fastify 4 · zod · vitest ·
ESLint 9 (flat) + Prettier. Espelha o scaffolding do núcleo.

## Requisitos

- Node.js **≥ 22**
- npm

## Execução

```bash
npm install
cp .env.example .env        # defaults já servem para a DEMO (modo fixtures)

# desenvolvimento (hot-reload, TS direto)
npm run dev

# produção
npm run build
npm start
```

Por padrão o serviço sobe em `http://0.0.0.0:8080` com `ALERTS_SOURCE=fixtures`
(dados mock, **sem credenciais e sem auth**).

### Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | servidor com `--watch` (TS direto, sem build) |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | roda `dist/main.js` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest |
| `npm run check` | lint + typecheck + test (rodar antes de cada PR) |
| `npm run format` | Prettier `--write` |

## Configuração (`.env`)

Ver [`.env.example`](.env.example). Principais variáveis:

| Variável | Default | Descrição |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | socket HTTP |
| `LOG_LEVEL` | `info` | `debug\|info\|warn\|error` |
| `ALERTS_SOURCE` | `fixtures` | `fixtures` (demo) · `file` (STATE_DIR do núcleo) · `oci` (Object Storage) |
| `STATE_DIR` | `../app-diana-monitoring/.state` | usado quando `ALERTS_SOURCE=file` |
| `OCI_OS_BUCKET/NAMESPACE/REGION` | — | usados quando `ALERTS_SOURCE=oci` |
| `WRITE_BACKEND` | segue `ALERTS_SOURCE` | `memory` · `file` · `oci` (feedback + settings) |
| `GUARDIAN_API_KEY` | vazio | **vazio = API aberta**; definido = exige header `x-api-key` |
| `CORS_ORIGINS` | `*` | CSV de origens permitidas (o guardian-web) |

## Rotas

| Rota | Descrição |
| --- | --- |
| `GET /health` | readiness/liveness (sem auth) |
| `GET /alerts` | lista de alertas (`AlertSummary`), ordenada por `detectedAt` desc. Query: `priority`, `category`, `limit`, `cursor` |
| `GET /alerts/:id` | detalhe (`AlertView` — `AnalysisResult` resumido). `400` id malformado · `404` inexistente |
| `POST /alerts/:id/feedback` | feedback do responsável (`{ verdict, note? }`) |
| `GET /settings` · `PUT /settings` | preferências (documento único global no MVP) |

`id` = `base64url("<conversationId>|<processedAt>")` (reversível).

### Exemplos

```bash
curl localhost:8080/health
curl localhost:8080/alerts
curl "localhost:8080/alerts?priority=alta&limit=2"

ID=$(curl -s localhost:8080/alerts | node -e 'process.stdin.once("data",d=>console.log(JSON.parse(d).items[0].id))')
curl "localhost:8080/alerts/$ID"
curl -X POST "localhost:8080/alerts/$ID/feedback" \
  -H 'content-type: application/json' \
  -d '{"verdict":"useful","note":"confere"}'

curl localhost:8080/settings
```

Com `GUARDIAN_API_KEY` definido, adicione `-H "x-api-key: <chave>"` (exceto em `/health`).

## Segurança — SEM auth no MVP (⚠️)

Decisão explícita (ver §8 da análise e `05-experiencia-responsavel.md` do núcleo):
o guardian-api **não tem camada de autenticação/IAM** no MVP.

- **Exposição:** aberta (demo) ou protegida por **chave simples** (`x-api-key`) —
  um **freio de demonstração**, não controle de acesso real (sem identidade,
  autorização por responsável ou auditoria).
- **Nota de risco:** enquanto não houver auth, **não** servir dados sensíveis
  reais de crianças de forma recorrente — coerente com a postura *mock-first*.
- **Fase 2:** `src/http/auth.ts` é um *seam* único; a validação de token OIDC
  (ex.: OCI IAM Identity Domains) entra ali por **adição, não reescrita**.

## Fonte de dados

- `fixtures` (default): `AlertRecord[]` de demonstração em
  `src/sources/fixtures/` (derivados dos cenários do núcleo).
- `file`: varre `STATE_DIR/alerts/**` gravado pelo `FileStateStore` do núcleo.
- `oci`: **placeholder (PR-11)** — falha explicitamente até a implementação com
  `oci-sdk`.

Feedback e settings são gravados em `feedback/` e `settings/guardian.json`
(prefixos novos, não conflitam com o núcleo).

## Contrato compartilhado

`src/contracts/` é uma **cópia portada** dos tipos do núcleo
(`app-diana-monitoring/src/contracts/types.ts`) + `AlertRecord`. Quando o pacote
`@diana/contracts` existir (em `app-diana-llm-analyzer`), substituir a cópia pela
dependência. O teste `test/contracts.test.ts` valida que as fixtures ainda
casam com o contrato.

## Deploy (OCI Container Instances)

Imagem multi-stage `node:22-slim` (usuário não-root), servidor de longa duração
(sem `--once`). `GET /health` para readiness/liveness. Ver [`Dockerfile`](Dockerfile)
e §2.5 da análise.

```bash
docker build -t diana-guardian-api .
docker run --rm -p 8080:8080 --env-file .env diana-guardian-api
```

## Estrutura

```text
src/
├─ main.ts                # bootstrap (listen PORT)
├─ config/env.ts          # config validada (zod)
├─ contracts/             # tipos portados do núcleo + AlertRecord
├─ domain/                # alertId, summarize (RF-16), viewTypes
├─ sources/               # AlertReader (fixtures | file | oci)
├─ store/                 # FeedbackStore + SettingsStore (memory | file)
└─ http/                  # server, auth, rotas
test/                     # unit + e2e (fastify.inject)
```
