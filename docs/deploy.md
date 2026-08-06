# Deploy e Runbook da MicroFirma

## Ambiente local (desenvolvimento)

```powershell
# Instala dependencias
pnpm install

# Typecheck + testes
pnpm typecheck
pnpm test

# Sobe o servidor
$env:MICROFIRMA_REPLAY_DIR=".\replays"
pnpm --filter @microfirma/server start

# Em outro terminal, sobe a demo
pnpm --filter @microfirma/demo dev
```

## Ambiente Windows (PowerShell 5.1+)

```powershell
.\scripts\setup-demo.ps1
pnpm --filter @microfirma/demo dev
```

O `setup-demo.ps1` cria um tenant, gera o JWT e escreve `apps/demo/.env.local` com as URLs apontando para `127.0.0.1`.

## Docker Compose

```powershell
docker-compose up --build
```

Acessos:

- API: `http://127.0.0.1:8787`
- Demo: `http://127.0.0.1:5173`

O container `demo` faz onboarding automatico no `server` e gera `.env.local` com o token.

## Variaveis de ambiente

| Variavel | Default | Descricao |
|----------|---------|-----------|
| `MICROFIRMA_PORT` | `8787` | Porta do servidor |
| `MICROFIRMA_HOST` | `127.0.0.1` | Bind do servidor. Use `0.0.0.0` no Docker. |
| `MICROFIRMA_ONBOARDING_KEY` | `microfirma-dev-onboarding` | Chave para `POST /api/tenants` em dev |
| `MICROFIRMA_REPLAY_DIR` | - | Diretorio para persistir `SessionLog` NDJSON |

## Replay e auditoria

Quando `MICROFIRMA_REPLAY_DIR` esta configurado, cada tenant grava seu `SessionLog` em `<tenantId>.ndjson`. Na proxima subida do servidor, os arquivos sao lidos e os tenants sao restaurados com a mesma seed.

Download do replay:

```powershell
curl -H "authorization: Bearer <token>" http://127.0.0.1:8787/api/tenants/<tenantId>/replay
```

## OTLP real

Envie spans para `/v1/traces` com o header `x-tenant-id`:

```powershell
curl -X POST http://127.0.0.1:8787/v1/traces `
  -H "content-type: application/json" `
  -H "x-tenant-id: <tenantId>" `
  -d @meu-lote-otlp.json
```

O lote deve conter spans com atributos `gen_ai.*` para serem traduzidos em eventos de dominio.

## Testes de carga

```powershell
# Com o servidor rodando:
npx tsx scripts/load-test.ts 10 100 5000
```

Parametros: concorrencia, total de requisicoes, duracao (ms).

## CI/CD

O workflow `.github/workflows/ci.yml` roda `typecheck`, `test` e `build` em cada push/PR para `main`.

## Troubleshooting

- **Tela preta no canvas**: o Canvas 2D (ADR-0010) e o fallback. Verifique `document.documentElement.lang` e o seletor de idioma.
- **WebSocket falha com `localhost`**: use `127.0.0.1` para evitar resolucao IPv6/IPv4. O `setup-demo.ps1` e o `docker-compose` ja fazem isso.
- **Erro 403 no SimFirma**: `VITE_MICROFIRMA_TOKEN` nao esta preenchido ou expirou. Rode `setup-demo.ps1` novamente.
