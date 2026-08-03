/**
 * Gera JSON Schema a partir dos schemas zod.
 *
 * Motivo: o servico Python (services/semantic-core) precisa validar os MESMOS
 * eventos de dominio. Em vez de manter duas definicoes (o pecado capital deste
 * projeto), geramos o schema aqui e o Python o consome nos testes de contrato.
 *
 * Uso: pnpm contracts:jsonschema
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { DomainEvent, AgentDescriptor } from '../src/domain-events.js';
import { SpaceProgram, OfficeLayout } from '../src/layout.js';
import { ClientCommand } from '../src/wire.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../schema');

const artefatos = {
  'domain-event.schema.json': zodToJsonSchema(DomainEvent, 'DomainEvent'),
  'agent-descriptor.schema.json': zodToJsonSchema(AgentDescriptor, 'AgentDescriptor'),
  'space-program.schema.json': zodToJsonSchema(SpaceProgram, 'SpaceProgram'),
  'office-layout.schema.json': zodToJsonSchema(OfficeLayout, 'OfficeLayout'),
  'client-command.schema.json': zodToJsonSchema(ClientCommand, 'ClientCommand'),
};

mkdirSync(outDir, { recursive: true });
for (const [nome, schema] of Object.entries(artefatos)) {
  writeFileSync(resolve(outDir, nome), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  console.log(`gerado: schema/${nome}`);
}
