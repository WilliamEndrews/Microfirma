/**
 * METRICAS PROMETHEUS
 *
 * Implementacao leve do formato de texto Prometheus (exposition format).
 * Sem dependencia externa para manter o servidor enxuto e multi-plataforma.
 *
 * Metricas expostas:
 *   - microfirma_requests_total (counter, rotulado por metodo e rota)
 *   - microfirma_active_tenants (gauge)
 *   - microfirma_ticks_total (counter)
 *   - microfirma_kpi_* (gauges com tenantId)
 */

export interface MetricPoint {
  labels: Record<string, string>;
  value: number;
}

export class MetricsRegistry {
  private counters = new Map<string, Map<string, number>>();
  private gauges = new Map<string, Map<string, number>>();
  private help = new Map<string, string>();

  private key(name: string, labels: Record<string, string>): string {
    const rotulos = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      .join(',');
    return `${name}{${rotulos}}`;
  }

  registerHelp(name: string, text: string): void {
    this.help.set(name, text);
  }

  inc(name: string, labels: Record<string, string> = {}, delta = 1, help?: string): void {
    if (help) this.help.set(name, help);
    if (!this.counters.has(name)) this.counters.set(name, new Map());
    const k = this.key(name, labels);
    const atual = this.counters.get(name)!.get(k) ?? 0;
    this.counters.get(name)!.set(k, atual + delta);
  }

  set(name: string, labels: Record<string, string> = {}, value: number, help?: string): void {
    if (help) this.help.set(name, help);
    if (!this.gauges.has(name)) this.gauges.set(name, new Map());
    const k = this.key(name, labels);
    this.gauges.get(name)!.set(k, value);
  }

  expose(): string {
    const linhas: string[] = [];

    for (const [name, map] of this.counters) {
      const h = this.help.get(name);
      if (h) linhas.push(`# HELP ${name} ${h}`);
      linhas.push(`# TYPE ${name} counter`);
      for (const [k, v] of map) linhas.push(`${k} ${v}`);
      linhas.push('');
    }

    for (const [name, map] of this.gauges) {
      const h = this.help.get(name);
      if (h) linhas.push(`# HELP ${name} ${h}`);
      linhas.push(`# TYPE ${name} gauge`);
      for (const [k, v] of map) linhas.push(`${k} ${v}`);
      linhas.push('');
    }

    return linhas.join('\n').trim() + '\n';
  }
}

export const metrics = new MetricsRegistry();
