# ADR-0010: Renderer da Fase 0 em Canvas 2D, nao WebGL/PixiJS

- Status: Aceita
- Data: 2026-08-03
- Contexto do produto: `apps/demo` (Fase 0 - Demonstracao sintetica)

## Contexto

O renderer do escritorio comecou implementado em PixiJS (WebGL). Em ambiente
de preview embutido (Chromium sem GPU acelerada), a tela renderizava
completamente preta, sem excecao lancada em nenhum ponto do codigo.

## Investigacao

O log do console mostrou duas linhas decisivas:

```
PixiJS Error: Could not retrieve shader source (WebGL context may be lost).
PixiJS Warning: gl.getProgramInfoLog() null
```

Em um contexto WebGL valido, `gl.getShaderSource()` e `gl.getProgramInfoLog()`
**nunca** retornam `null` - retornam string, inclusive vazia, inclusive em
erro de compilacao. Os dois retornando `null` simultaneamente indica que o
driver aceitou CRIAR o contexto, mas ele e um stub nao funcional (GPU em
blocklist / SwiftShader incompleto).

Cadeia de falha resultante:

1. O shader do batcher padrao do PixiJS nao linka.
2. O programa fica sem atributos (`aPosition`/`aUV`/`aColor`/
   `aTextureIdAndRound` ausentes).
3. Nenhum draw call e efetivo -> tela preta.

Ponto critico para o diagnostico: `Application.init()` do PixiJS **nao lanca
excecao** nesse cenario. A criacao do contexto "sucede"; a falha so aparece no
primeiro `render()`, dentro do `requestAnimationFrame`, bem depois de qualquer
`try/catch` ao redor da inicializacao. Por isso um fallback por excecao nunca
teria disparado.

## Decisao

Substituir o renderer WebGL por um renderer em Canvas 2D
(`apps/demo/src/office-renderer-2d.ts`), mantendo o mesmo contrato:

```ts
export interface RendererHandle {
  push(frame: WorldSnapshot | WorldDelta): void;
  select(agentId: string | null): void;
  destroy(): void;
}
```

Justificativa tecnica: toda a geometria da Fase 0 e vetorial (losangos, caixas
isometricas, elipses, retangulos, gradientes). Canvas 2D executa isso sem
compilar um unico shader, eliminando de uma vez a classe inteira de falha
acima. Como ganho colateral, `globalCompositeOperation = 'lighter'` fornece
blend aditivo NATIVO (sem pipeline de shader) e `createRadialGradient`
substitui aproximacoes por aneis concentricos por um halo continuo.

A troca exigiu alterar **uma linha** fora do renderer - o import em
`apps/demo/src/App.tsx` - porque a fronteira definida pelo contrato
`RendererHandle` estava no lugar certo (ver ADR-0006). Isso valida
empiricamente essa fronteira: a simulacao (World Engine, Narrative Scheduler)
nao sentiu a troca de tecnologia de render.

## Consequencias

- `apps/demo/src/office-renderer.ts` (versao PixiJS) permanece no repositorio,
  nao referenciado, como base para a Fase 2 (ADR-0008). Como nada o importa, o
  bundler nao inclui `pixi.js` no build atual - custo zero de manter o
  arquivo.
- Perda (aceita para a Fase 0): nenhuma. O volume de atores da demo nao exige
  GPU.
- Risco para o futuro: se a Fase 2 reintroduzir WebGL (por volume de atores ou
  sprites 3D), a deteccao de contexto degradado precisa ser EXPLICITA -
  verificar `gl.getShaderSource()`/`gl.getProgramInfoLog()` apos o primeiro
  `render()`, nao confiar em excecao de `init()` - e com fallback real para
  Canvas 2D, nao apenas log de erro.

## Alternativas consideradas

- **Forcar `preference: 'canvas'` no PixiJS**: PixiJS v8 nao possui backend
  Canvas2D como fallback de producao; a opcao nao resolve o problema.
- **Detectar GPU antes de inicializar e escolher backend**: adiaria o problema
  para o proximo ambiente com GPU parcialmente funcional (que cria o contexto
  mas falha silenciosamente no shader, como neste caso) - o teste de deteccao
  precisaria fazer exatamente o `render()` de sonda que motivou esta decisao,
  tornando a complexidade equivalente a simplesmente nao depender de GPU na
  Fase 0.
