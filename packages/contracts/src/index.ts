/**
 * @microfirma/contracts
 *
 * Fonte unica de verdade dos contratos do sistema. Qualquer pacote (frontend,
 * engine, servico Python via schema gerado) fala esta linguagem e apenas esta.
 * Duplicar uma definicao de tipo neste projeto e considerado bug.
 */

export * from './domain-events.js';
export * from './layout.js';
export * from './world.js';
export * from './wire.js';
export * from './otlp.js';
export * from './replay.js';
export * from './tenant.js';
