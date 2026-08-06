# ADR-0001: Motor de tempo narrativo e separacao entre tempo real e tempo do mundo

- Status: Aceita
- Data: 2026-08-05
- Contexto do produto: `packages/world-engine/src/narrative-scheduler.ts`

## Contexto

A MicroFirma precisa mostrar o que acontece em um escritorio de agentes autonomos sem ser amarrada a velocidade do relogio de parede. Os eventos reais (OTLP) chegam em rajadas; o tempo de processamento varia; e o observador humano nao pode assimilar uma explosao de acoes na mesma cadencia em que elas ocorreram.

A arquitetura precisa permitir:

- Acelerar o mundo durante picos de eventos sem perder semantica.
- Pausar, retroceder e simular "e se" (SimFirma) independentemente do tempo real.
- Garantir que a mesma sequencia de eventos produza a mesma historia.

## Investigacao

Tres abordagens iniciais foram consideradas:

1. **Replay em tempo real**: o mundo avanca na mesma cadencia dos eventos. Rejeitada porque a velocidade dos eventos e instavel e o SimFirma exige fast-forward.
2. **Time-dilation continuo**: acelerar/desacelerar proporcionalmente ao atraso. Rejeitada porque distorce a percepcao sem criar momentos de respiro.
3. **Tempo narrativo discreto com orcamento de atencao**: agregar eventos em intents e decidir quais encenar agora, quais adiar e quais representar como acontecimentos de fundo. Mantem a causalidade e permite pausa.

## Decisao

Adotar o `NarrativeScheduler` como motor de tempo narrativo com as seguintes propriedades:

1. **Tempo do mundo (`tMundoMs`) e tempo real (`tRealMs`) sao independentes**: o `dt` passado para `WorldEngine.tick()` e controlado pelo scheduler, nao pela cadaencia do sistema.
2. **Agregacao de eventos em intencoes narrativas**: 15 eventos do tipo `run.started` em 2s viram a intencao `work`.
3. **Divida narrativa (`debtMs`)**: se o mundo esta atrasado em relacao aos eventos, o scheduler acelera o `dt`; se esta adiantado, desacelera.
4. **Orcamento de atencao**: incidentes e prioridades altas furam a fila de encenacao. Qualquer prioridade >= 0.8 bypassa o orcamento por design.
5. **Determinismo**: a mesma seed, o mesmo layout e a mesma sequencia de eventos produzem a mesma serie de snapshots.

A especificacao vive em `docs/specs/motor-de-tempo-narrativo.md` e e citada no codigo em `packages/world-engine/src/narrative-scheduler.ts:34` e `packages/contracts/src/world.ts:128`.

## Consequencias

- O `WorldEngine` nao sabe do tempo real; ele so consome `(eventos, dt)`.
- O `OfficeSession` pode simular cenarios SimFirma sem afetar o tempo real.
- A pausa e um estado legitimo: o mundo simplesmente nao recebe `dt`.
- A cache de intencoes permite retroceder a "narrativa" sem reprocessar todos os eventos brutos.

## Alternativas consideradas

- **Fila cronologica plana**: sem agregacao, a quantidade de acoes simultaneas esmagaria a visualizacao.
- **Buffer de quadros por tempo real**: mantem a sincronia com o relogio, mas impede SimFirma e pausa deterministica.
