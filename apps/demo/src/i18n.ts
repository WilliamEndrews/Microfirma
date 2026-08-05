/**
 * INTERNACIONALIZACAO (ADR-0011)
 *
 * O dicionario e plano, nao hierarquico: uma chave, uma string. Sem ICU,
 * sem pluralizacao complexa - a UI da MicroFirma tem ~50 strings e nenhuma
 * precisa de regras de plural. Se um dia precisar, troca-se a implementacao
 * do `t()` sem mudar as chamadas.
 *
 * O idioma default e pt-BR (o produto nasceu em portugues). en-US e a segunda
 * lingua para demos internacionais. Adicionar um idioma novo = adicionar um
 * objeto ao dicionario, nada mais.
 */

export type Idioma = 'pt-BR' | 'en-US';

export const IDIOMAS: Idioma[] = ['pt-BR', 'en-US'];

export const ROTULO_IDIOMA: Record<Idioma, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
};

type Dict = Record<string, string>;

const ptBR: Dict = {
  // Header
  'app.titulo': 'MicroFirma',
  'app.subtitulo': 'Plano de controle espacial para sistemas agenticos',
  'app.fonteMundo': 'Fonte do mundo',

  // Estados de conexao
  'conexao.local': 'simulando no navegador',
  'conexao.conectando': 'conectando ao servidor...',
  'conexao.conectado': 'servidor autoritativo',
  'conexao.reconectando': 'reconectando...',
  'conexao.falhou': 'servidor inalcancavel',

  // Aviso de fonte
  'app.servidorIndisponivel': 'Servidor {url} indisponivel. Simulando no navegador - o mundo mostrado NAO e o autoritativo.',

  // KPIs
  'kpi.execucoesAtivas': 'Execucoes ativas',
  'kpi.erros5min': 'Erros (5 min)',
  'kpi.tokensMin': 'Tokens / min',
  'kpi.aprovacoes': 'Aprovacoes',

  // Orcamento
  'orcamento.custoDia': 'Custo do dia',
  'orcamento.nota': 'Estourar o teto apaga as luzes do predio - o custo deixa de ser numero e passa a ser consequencia visivel.',

  // Aprovacoes
  'aprovacao.titulo': 'Intervencao humana necessaria',
  'aprovacao.bloqueado': '{nome} esta bloqueado na sua porta.',
  'aprovacao.liberar': 'Liberar',

  // Listas de agentes
  'agentes.titulo': 'Agentes',
  'agentes.internaTitulo': 'Equipe interna',
  'agentes.notaInterna': 'Zelador e Tecnico sao behavior trees deterministicas, sem LLM: chamar um modelo para decidir "ir varrer" seria custo sem beneficio.',

  // Atividades
  'atividade.idle': 'disponivel',
  'atividade.walking': 'deslocando',
  'atividade.working': 'executando',
  'atividade.resting': 'em descanso',
  'atividade.waiting_approval': 'AGUARDA APROVACAO',
  'atividade.blocked': 'bloqueado',
  'atividade.sweeping': 'limpando',
  'atividade.repairing': 'reparando',
  'atividade.talking': 'em reuniao',

  // Fatos recentes
  'fatos.titulo': 'Fatos recentes',
  'fatos.nota': 'Nenhum pixel sem fato: tudo que o escritorio mostra vem de um evento desta lista.',

  // Controles
  'controles.titulo': 'Controles',
  'controles.pausar': 'Pausar',
  'controles.retomar': 'Retomar',
  'controles.novoEscritorio': 'Novo escritorio',
  'controles.semente': 'Semente',
  'controles.notaSemente': 'A mesma semente sempre gera exatamente a mesma planta. E o que torna o modo Replay possivel e os testes confiaveis.',
  'controles.layoutValido': 'Layout valido: todas as invariantes geometricas satisfeitas.',
  'controles.violacoes': '{n} violacao(oes) de invariante no layout:',

  // Legenda
  'legenda.fila': 'pilha na mesa = profundidade de fila',
  'legenda.calor': 'mesa quente = retentativas e loops',
  'legenda.luz': 'luz apagada = falha de dependencia',
  'legenda.lixo': 'lixo = trabalho concluido nao coletado',

  // Descricao de eventos
  'evento.discovered': 'novo agente descoberto: {nome} ({framework})',
  'evento.runStarted': '{nome} iniciou {label}',
  'evento.runFinished': '{nome} concluiu em {duracao}s [{status}]',
  'evento.errorRaised': '{nome} falhou: {kind} ({severity})',
  'evento.approvalRequested': '{nome} aguarda aprovacao humana',
  'evento.queueObserved': '{nome} com fila de {depth}',
  'evento.execucao': 'execucao',

  // Canvas
  'canvas.ariaLabel': 'Planta do escritorio dos agentes',

  // Camera
  'camera.reset': 'Resetar camera',
  'camera.dica': 'Scroll = zoom | Arrastar = pan | Duplo-clique = reset',

  // SimFirma
  'simfirma.titulo': 'SimFirma (what-if)',
  'simfirma.duracao': 'Duracao (ms)',
  'simfirma.carga': 'Carga (1x a 100x)',
  'simfirma.token': 'Token JWT',
  'simfirma.rodar': 'Rodar cenario',
  'simfirma.rodando': 'Simulando...',
  'simfirma.ticks': 'ticks',
  'simfirma.tMundo': 'tempo do mundo',
  'simfirma.requerRemoto': 'SimFirma so funciona com servidor remoto.',

  // Idioma
  'i18ma.seletor': 'Idioma',
};

const enUS: Dict = {
  // Header
  'app.titulo': 'MicroFirma',
  'app.subtitulo': 'Spatial control plane for agentic systems',
  'app.fonteMundo': 'World source',

  // Estados de conexao
  'conexao.local': 'simulating in browser',
  'conexao.conectando': 'connecting to server...',
  'conexao.conectado': 'authoritative server',
  'conexao.reconectando': 'reconnecting...',
  'conexao.falhou': 'server unreachable',

  // Aviso de fonte
  'app.servidorIndisponivel': 'Server {url} unavailable. Simulating in browser - the world shown is NOT the authoritative one.',

  // KPIs
  'kpi.execucoesAtivas': 'Active runs',
  'kpi.erros5min': 'Errors (5 min)',
  'kpi.tokensMin': 'Tokens / min',
  'kpi.aprovacoes': 'Approvals',

  // Orcamento
  'orcamento.custoDia': 'Daily cost',
  'orcamento.nota': 'Exceeding the ceiling turns off the building lights - cost stops being a number and becomes a visible consequence.',

  // Aprovacoes
  'aprovacao.titulo': 'Human intervention required',
  'aprovacao.bloqueado': '{nome} is blocked at your door.',
  'aprovacao.liberar': 'Release',

  // Listas de agentes
  'agentes.titulo': 'Agents',
  'agentes.internaTitulo': 'Internal team',
  'agentes.notaInterna': 'Janitor and Technician are deterministic behavior trees, no LLM: calling a model to decide "go sweep" would be cost without benefit.',

  // Atividades
  'atividade.idle': 'available',
  'atividade.walking': 'moving',
  'atividade.working': 'executing',
  'atividade.resting': 'on break',
  'atividade.waiting_approval': 'AWAITING APPROVAL',
  'atividade.blocked': 'blocked',
  'atividade.sweeping': 'sweeping',
  'atividade.repairing': 'repairing',
  'atividade.talking': 'in meeting',

  // Fatos recentes
  'fatos.titulo': 'Recent events',
  'fatos.nota': 'No pixel without a fact: everything the office shows comes from an event in this list.',

  // Controles
  'controles.titulo': 'Controls',
  'controles.pausar': 'Pause',
  'controles.retomar': 'Resume',
  'controles.novoEscritorio': 'New office',
  'controles.semente': 'Seed',
  'controles.notaSemente': 'The same seed always generates exactly the same floor plan. This is what makes Replay mode possible and tests reliable.',
  'controles.layoutValido': 'Valid layout: all geometric invariants satisfied.',
  'controles.violacoes': '{n} invariant violation(s) in layout:',

  // Legenda
  'legenda.fila': 'stack on desk = queue depth',
  'legenda.calor': 'hot desk = retries and loops',
  'legenda.luz': 'light off = dependency failure',
  'legenda.lixo': 'trash = completed work not collected',

  // Descricao de eventos
  'evento.discovered': 'new agent discovered: {nome} ({framework})',
  'evento.runStarted': '{nome} started {label}',
  'evento.runFinished': '{nome} finished in {duracao}s [{status}]',
  'evento.errorRaised': '{nome} failed: {kind} ({severity})',
  'evento.approvalRequested': '{nome} awaiting human approval',
  'evento.queueObserved': '{nome} has queue depth of {depth}',
  'evento.execucao': 'execution',

  // Canvas
  'canvas.ariaLabel': 'Floor plan of the agents office',

  // Camera
  'camera.reset': 'Reset camera',
  'camera.dica': 'Scroll = zoom | Drag = pan | Double-click = reset',

  // SimFirma
  'simfirma.titulo': 'SimFirma (what-if)',
  'simfirma.duracao': 'Duration (ms)',
  'simfirma.carga': 'Load (1x to 100x)',
  'simfirma.token': 'JWT token',
  'simfirma.rodar': 'Run scenario',
  'simfirma.rodando': 'Simulating...',
  'simfirma.ticks': 'ticks',
  'simfirma.tMundo': 'world time',
  'simfirma.requerRemoto': 'SimFirma only works with a remote server.',

  // Idioma
  'i18ma.seletor': 'Language',
};

const DICCIONARIOS: Record<Idioma, Dict> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

/**
 * Traduz uma chave, substituindo {placeholders} por valores.
 * Se a chave nao existe no idioma, cai para pt-BR. Se nao existe em nenhum,
 * devolve a chave crua - melhor que crashar a UI por uma string faltante.
 */
export function traduzir(idioma: Idioma, chave: string, vars?: Record<string, string | number>): string {
  const dict = DICCIONARIOS[idioma] ?? ptBR;
  let s = dict[chave] ?? ptBR[chave] ?? chave;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}
