<#
.SYNOPSIS
    Cria um tenant demo e gera apps/demo/.env.local com token JWT.
.DESCRIPTION
    Faz onboarding automatico no servidor local, pega o token de acesso
    e configura o demo para conectar com WebSocket autenticado.
.NOTES
    O servidor deve estar rodando em http://localhost:8787.
    A chave de onboarding padrao e 'microfirma-dev-onboarding'.
#>

$ErrorActionPreference = 'Stop'

$BaseUrl = 'http://127.0.0.1:8787'
$OnboardingKey = 'microfirma-dev-onboarding'
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path (Join-Path (Join-Path $Root 'apps') 'demo') '.env.local'

function Test-ServerHealth {
    try {
        $null = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -TimeoutSec 3
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-ServerHealth)) {
    Write-Error 'Servidor nao responde em http://localhost:8787/health. Suba o servidor primeiro com: npx pnpm --filter @microfirma/server dev'
}

$body = @{ displayName = 'Demo'; seed = 2026 } | ConvertTo-Json
$response = Invoke-RestMethod -Uri "$BaseUrl/api/tenants" -Method POST `
    -Headers @{'content-type' = 'application/json'; 'x-api-key' = $OnboardingKey} `
    -Body $body

$tenantId = $response.tenant.tenantId
$token = $response.token

if (-not $tenantId -or -not $token) {
    Write-Error 'Resposta do servidor nao trouxe tenantId ou token.'
}

$envContent = @"
# Gerado automaticamente por scripts/setup-demo.ps1
# Tenant: $tenantId
VITE_MICROFIRMA_WS=ws://127.0.0.1:8787/mundo?token=$token
VITE_MICROFIRMA_TOKEN=$token
"@

if (Test-Path $EnvFile) {
    $backup = "$EnvFile.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item -Path $EnvFile -Destination $backup -Force
    Write-Host "Backup do .env.local anterior criado: $backup"
}

$envDir = Split-Path -Parent $EnvFile
if (-not (Test-Path $envDir)) {
    New-Item -ItemType Directory -Path $envDir -Force | Out-Null
}
Set-Content -Path $EnvFile -Value $envContent -Encoding utf8 -NoNewline

Write-Host ""
Write-Host "OK - apps/demo/.env.local criado."
Write-Host "Tenant: $tenantId"
Write-Host "Token:  $($token.Substring(0, [Math]::Min(40, $token.Length)))..."
Write-Host ""
Write-Host "Agora rode:"
Write-Host "  npx pnpm --filter @microfirma/demo dev"
