#!/usr/bin/env python3
"""
Simulador de telemetria OTLP/JSON alinhado ao contrato GenAI do MicroFirma.

NAO usa o exporter protobuf do OpenTelemetry SDK (o server so aceita JSON.parse).
Monta ExportTraceServiceRequest em JSON e POSTa em:
  http://127.0.0.1:8787/v1/traces
com header x-tenant-id.

Pre-requisito:
  1. server rodando
  2. tenant com otlpEndpoint (scripts/setup-otlp-tenant.ps1 ou
     npm run telemetria:enviar -- --new-tenant)

Uso:
  python scripts/test_agency_telemetry.py
  python scripts/test_agency_telemetry.py --tenant <tenantId>
  python scripts/test_agency_telemetry.py --base-url http://127.0.0.1:8787

Expectativas honestas:
  - 3x agent.discovered (gen_ai.agent.*)
  - heat via tool.called ok=false / error.raised (nao via retries OK)
  - approval.requested via human_approval.*
  - incident/smoke via status ERROR + timeout
  - layout NAO remesha sozinho (3 atores ≠ 3 mesas novas sem reseed)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TENANT_META = ROOT / "scripts" / "fixtures" / ".otlp-tenant.json"
DEFAULT_BASE = "http://127.0.0.1:8787"


def attr(key: str, value: Any) -> dict[str, Any]:
    """Monta um atributo OTLP/JSON tipado (bool/int/float/string)."""
    if isinstance(value, bool):
        return {"key": key, "value": {"boolValue": value}}
    if isinstance(value, int) and not isinstance(value, bool):
        return {"key": key, "value": {"intValue": str(value)}}
    if isinstance(value, float):
        return {"key": key, "value": {"doubleValue": value}}
    return {"key": key, "value": {"stringValue": str(value)}}


def nano_now(offset_ms: int = 0) -> str:
    """Timestamp Unix em nanossegundos (string), com offset opcional em ms."""
    return str(int((time.time() * 1000 + offset_ms) * 1_000_000))


def span(
    *,
    trace_id: str,
    span_id: str,
    name: str,
    start_ms: int,
    end_ms: int,
    attrs: dict[str, Any],
    parent_span_id: str | None = None,
    status_code: int = 1,
    status_message: str | None = None,
) -> dict[str, Any]:
    """Monta um span OTLP/JSON com atributos GenAI e status."""
    out: dict[str, Any] = {
        "traceId": trace_id,
        "spanId": span_id,
        "name": name,
        "kind": 1,
        "startTimeUnixNano": nano_now(start_ms),
        "endTimeUnixNano": nano_now(end_ms),
        "attributes": [attr(k, v) for k, v in attrs.items()],
        "status": {"code": status_code},
    }
    if parent_span_id:
        out["parentSpanId"] = parent_span_id
    if status_message:
        out["status"]["message"] = status_message
    return out


def build_lote() -> dict[str, Any]:
    """Mesma narrativa da fixture JSON: triador, analista (tool fail), gerente HITL+timeout."""
    t0 = 0
    spans = [
        # Agente 1 — Triador (discover + llm)
        span(
            trace_id="c1000000000000000000000000000001",
            span_id="d100000000000001",
            name="agent_run",
            start_ms=t0,
            end_ms=t0 + 1500,
            attrs={
                "gen_ai.agent.id": "agent_triador_01",
                "gen_ai.agent.name": "Triador de Demandas",
                "gen_ai.agent.role": "researcher",
                "gen_ai.operation.name": "chat",
                "gen_ai.request.model": "gpt-4o-mini",
                "gen_ai.usage.input_tokens": 800,
                "gen_ai.usage.output_tokens": 220,
                "gen_ai.usage.cost": 0.0021,
            },
        ),
        # Agente 2 — Analista (tools; ultima falha = heat)
        span(
            trace_id="c2000000000000000000000000000002",
            span_id="d200000000000001",
            name="agent_run",
            start_ms=t0 + 2000,
            end_ms=t0 + 5500,
            attrs={
                "gen_ai.agent.id": "agent_analista_02",
                "gen_ai.agent.name": "Analista de Credito",
                "gen_ai.agent.role": "analyst",
                "gen_ai.request.model": "gpt-4o-mini",
            },
        ),
        span(
            trace_id="c2000000000000000000000000000002",
            span_id="d200000000000002",
            parent_span_id="d200000000000001",
            name="tool_call",
            start_ms=t0 + 2200,
            end_ms=t0 + 3000,
            attrs={
                "gen_ai.agent.id": "agent_analista_02",
                "gen_ai.agent.name": "Analista de Credito",
                "gen_ai.operation.name": "tool",
                "gen_ai.tool.name": "ConsultarSerasaAPI",
            },
        ),
        span(
            trace_id="c2000000000000000000000000000002",
            span_id="d200000000000003",
            parent_span_id="d200000000000001",
            name="tool_call",
            start_ms=t0 + 3200,
            end_ms=t0 + 4000,
            attrs={
                "gen_ai.agent.id": "agent_analista_02",
                "gen_ai.agent.name": "Analista de Credito",
                "gen_ai.operation.name": "tool",
                "gen_ai.tool.name": "ConsultarSerasaAPI",
            },
        ),
        span(
            trace_id="c2000000000000000000000000000002",
            span_id="d200000000000004",
            parent_span_id="d200000000000001",
            name="tool_call",
            start_ms=t0 + 4200,
            end_ms=t0 + 5200,
            status_code=2,
            status_message="tool failure",
            attrs={
                "gen_ai.agent.id": "agent_analista_02",
                "gen_ai.agent.name": "Analista de Credito",
                "gen_ai.operation.name": "tool",
                "gen_ai.tool.name": "ConsultarSerasaAPI",
                "error.type": "timeout",
                "exception.message": "Serasa API timed out after 8s",
            },
        ),
        # Agente 3 — Gerente (HITL + timeout = approval + incident)
        span(
            trace_id="c3000000000000000000000000000003",
            span_id="d300000000000001",
            name="agent_run",
            start_ms=t0 + 6000,
            end_ms=t0 + 8500,
            status_code=2,
            status_message="Timeout na resposta humana",
            attrs={
                "gen_ai.agent.id": "agent_gerente_03",
                "gen_ai.agent.name": "Gerente de Contas",
                "gen_ai.agent.role": "finance",
                "gen_ai.request.model": "gpt-4o",
                "human_approval.required": True,
                "human_approval.id": "appr-limite-500k",
                "human_approval.question": "Liberar limite acima de R$500.000",
                "error.type": "timeout",
                "exception.message": "O operador humano demorou muito para responder (timeout).",
            },
        ),
    ]

    return {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [
                        attr("service.name", "agencia-suporte-financeiro"),
                        attr("telemetry.sdk.name", "crewai"),
                        attr("telemetry.sdk.language", "python"),
                        attr("deployment.environment", "local-test"),
                    ]
                },
                "scopeSpans": [
                    {
                        "scope": {"name": "microfirma-test-agency", "version": "1.0.0"},
                        "spans": spans,
                    }
                ],
            }
        ]
    }


def resolve_tenant(cli_tenant: str | None) -> str:
    """Resolve tenantId via CLI ou fixture scripts/fixtures/.otlp-tenant.json."""
    if cli_tenant:
        return cli_tenant
    if TENANT_META.exists():
        meta = json.loads(TENANT_META.read_text(encoding="utf-8-sig"))
        tid = meta.get("tenantId")
        if tid:
            return str(tid)
    raise SystemExit(
        "tenantId ausente. Rode scripts/setup-otlp-tenant.ps1 "
        "ou npm run telemetria:enviar -- --new-tenant, "
        "ou passe --tenant <id>."
    )


def post_json(url: str, body: dict[str, Any], headers: dict[str, str]) -> tuple[int, str]:
    """POST JSON e devolve (status HTTP, corpo texto), inclusive em HTTPError."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def main() -> int:
    """CLI: monta o lote sintetico e POSTa em /v1/traces (ou so imprime)."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument("--tenant", default=None, help="x-tenant-id (tenant com otlpEndpoint)")
    parser.add_argument(
        "--print-only",
        action="store_true",
        help="so imprime o lote JSON (nao POSTa)",
    )
    args = parser.parse_args()

    lote = build_lote()
    if args.print_only:
        json.dump(lote, sys.stdout, indent=2)
        print()
        return 0

    tenant_id = resolve_tenant(args.tenant)
    url = f"{args.base_url.rstrip('/')}/v1/traces"
    print(f"POST {url}")
    print(f"x-tenant-id: {tenant_id}")
    print("Enviando agencia sintetica (GenAI attrs)...")

    status, body = post_json(
        url,
        lote,
        {
            "content-type": "application/json",
            "x-tenant-id": tenant_id,
        },
    )
    print(f"-> HTTP {status} {body}")

    if status == 404:
        print(
            "Tenant sem OTLP. Crie com otlpEndpoint "
            "(setup-otlp-tenant.ps1 / enviar-telemetria-agencia.ts --new-tenant).",
            file=sys.stderr,
        )
        return 1
    if status >= 400:
        return 1

    print()
    print("Checklist:")
    print("  [ ] log [otlp] N eventos ingeridos")
    print("  [ ] 3 agent.discovered")
    print("  [ ] heat (tool fail / error) no analista")
    print("  [ ] waiting_approval + incident/smoke no gerente")
    print("  [ ] NAO espere 3 mesas novas sem reseed de layout")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
