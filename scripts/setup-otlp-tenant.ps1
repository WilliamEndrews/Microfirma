#Requires -Version 5.1
<#
.SYNOPSIS
    Cria um tenant com OtlpIngestor ligado e imprime o endpoint pronto para POST /v1/traces.
.DESCRIPTION
    O tenant demo padrao do server NAO tem OTLP. Este script faz onboarding com
    otlpEndpoint (flag que cria o OtlpIngestor) e grava apps/demo/.env.local
    apontando para esse tenant, para validar heat/smoke/approval no canvas.
.NOTES
    Servidor em http://127.0.0.1:8787. Depois:
      npx tsx scripts/enviar-telemetria-agencia.ts
    ou
      python scripts/test_agency_telemetry.py --tenant <tenantId>
#>

$ErrorActionPreference = 'Stop'

$BaseUrl = if ($env:MICROFIRMA_BASE_URL) { $env:MICROFIRMA_BASE_URL } else { 'http://127.0.0.1:8787' }
$OnboardingKey = if ($env:MICROFIRMA_ONBOARDING_KEY) { $env:MICROFIRMA_ONBOARDING_KEY } else { 'microfirma-dev-onboarding' }
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root 'apps\demo\.env.local'
$TenantFile = Join-Path $Root 'scripts\fixtures\.otlp-tenant.json'

function Test-ServerHealth {
    try {
        $null = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -TimeoutSec 3
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-ServerHealth)) {
    Write-Error "Servidor nao responde em $BaseUrl/health. Suba com: npx pnpm --filter @microfirma/server dev"
}

$body = @{
    displayName = 'OTLP Agency Test'
    seed = 20260907
    plano = 'pro'
    # Qualquer URL non-empty: o registry so usa o campo como flag para criar o ingestor.
    otlpEndpoint = 'http://127.0.0.1:8787/v1/traces'
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "$BaseUrl/api/tenants" -Method POST `
    -Headers @{ 'content-type' = 'application/json'; 'x-api-key' = $OnboardingKey } `
    -Body $body

$tenantId = $response.tenant.tenantId
$token = $response.token

if (-not $tenantId -or -not $token) {
    Write-Error 'Resposta do servidor nao trouxe tenantId ou token.'
}

$meta = @{
    tenantId = $tenantId
    token = $token
    baseUrl = $BaseUrl
    otlpUrl = "$BaseUrl/v1/traces"
    createdAt = (Get-Date).ToString('o')
} | ConvertTo-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($TenantFile, $meta, $utf8NoBom)

$envContent = @(
    "# Gerado por scripts/setup-otlp-tenant.ps1 - tenant com OTLP ligado"
    "# Tenant: $tenantId"
    "VITE_MICROFIRMA_WS=ws://127.0.0.1:8787/mundo?token=$token"
    "VITE_MICROFIRMA_TOKEN=$token"
) -join "`n"

$envDir = Split-Path -Parent $EnvFile
if (-not (Test-Path $envDir)) {
    New-Item -ItemType Directory -Path $envDir -Force | Out-Null
}
if (Test-Path $EnvFile) {
    $backup = "$EnvFile.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item -Path $EnvFile -Destination $backup -Force
    Write-Host "Backup do .env.local anterior: $backup"
}
[System.IO.File]::WriteAllText($EnvFile, $envContent, $utf8NoBom)

Write-Host ''
Write-Host 'OK - tenant OTLP criado.'
Write-Host "  tenantId : $tenantId"
Write-Host "  OTLP     : $BaseUrl/v1/traces"
Write-Host "  header   : x-tenant-id: $tenantId"
Write-Host "  meta     : $TenantFile"
Write-Host "  demo env : $EnvFile"
Write-Host ''
Write-Host 'Proximos passos:'
Write-Host '  1. npx pnpm --filter @microfirma/demo dev'
Write-Host '  2. npm run telemetria:enviar'
Write-Host '  3. No canvas: heat na mesa do analista, smoke/incident no gerente, waiting_approval'
Write-Host ''
Write-Host 'Gap consciente: 3 agentes descobertos NAO remesham o layout automaticamente.'
