#requires -Version 5
<#
.SYNOPSIS
  Configura Node.js para que confíe en certificados raíz corporativos
  cuando trabajas detrás de un proxy con interceptación TLS
  (típico en redes Havas, Generali, Vivendi, GroupM, etc).

.DESCRIPTION
  Busca en el almacén de certificados de Windows los CA raíz corporativos
  conocidos, los exporta a un único archivo PEM en %LOCALAPPDATA%\NodeCerts
  y configura la variable de entorno de usuario NODE_EXTRA_CA_CERTS para
  que Node los lea al arrancar.

  Sin esto, fetch/axios desde Node fallan con
  "SELF_SIGNED_CERT_IN_CHAIN" cuando llaman a APIs externas (Ahrefs,
  Sistrix, Google APIs, etc).

  Ejecutar UNA VEZ por máquina. Idempotente: se puede relanzar.

.NOTES
  - Solo afecta a tu entorno local. NO se commitea nada a git.
  - En producción (Vercel) este problema no existe.
  - Si se cambian los certs del proxy, relanza este script.
#>

[CmdletBinding()]
param(
  [string] $OutputDir = "$env:LOCALAPPDATA\NodeCerts",
  [string] $OutputFile = 'corp-roots.pem'
)

$ErrorActionPreference = 'Stop'

# Patrones de Subject típicos de CA corporativas conocidas en el ecosistema Havas/Generali/etc.
# Si tu organización usa otro, añade el patrón aquí.
$patterns = @(
  'Havas',
  'GS01-CSRV',
  'globalservs',
  'gs-glb-svc',
  'iberia-svc',
  'Generali',
  'Vivendi',
  'GroupM',
  'Bolloré',
  'Zscaler',
  'Forcepoint',
  'Bluecoat',
  'Netskope',
  'Cisco.*Umbrella'
)

Write-Host 'Buscando certificados corporativos en el almacen de Windows...' -ForegroundColor Cyan

$stores = @(
  'Cert:\LocalMachine\Root',
  'Cert:\LocalMachine\CA',
  'Cert:\LocalMachine\AuthRoot',
  'Cert:\CurrentUser\Root',
  'Cert:\CurrentUser\CA'
)

$found = @{}
foreach ($store in $stores) {
  $certs = Get-ChildItem $store -ErrorAction SilentlyContinue
  foreach ($cert in $certs) {
    foreach ($pat in $patterns) {
      if ($cert.Subject -match $pat) {
        $found[$cert.Thumbprint] = $cert
        break
      }
    }
  }
}

if ($found.Count -eq 0) {
  Write-Host ''
  Write-Host 'No se han encontrado certificados corporativos en tu almacen.' -ForegroundColor Yellow
  Write-Host 'Posibles motivos:'
  Write-Host '  1. No estas en una red corporativa con interceptacion TLS (en cuyo caso no necesitas este script).'
  Write-Host "  2. Tu organizacion usa un CA con nombre distinto. Anadelo a la lista `$patterns en este script."
  Write-Host ''
  return
}

Write-Host "Encontrados $($found.Count) certs unicos:" -ForegroundColor Green
foreach ($t in ($found.Keys | Sort-Object)) {
  $c = $found[$t]
  Write-Host "  - $($c.Subject)"
}
Write-Host ''

# Crear directorio y escribir PEM
if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}
$pemPath = Join-Path $OutputDir $OutputFile

$pem = ''
foreach ($cert in ($found.Values | Sort-Object Subject)) {
  $bytes = $cert.RawData
  $b64 = [Convert]::ToBase64String($bytes, 'InsertLineBreaks')
  $pem += "# Subject:    $($cert.Subject)`n"
  $pem += "# Issuer:     $($cert.Issuer)`n"
  $pem += "# Thumbprint: $($cert.Thumbprint)`n"
  $pem += "# NotAfter:   $($cert.NotAfter.ToString('yyyy-MM-dd'))`n"
  $pem += "-----BEGIN CERTIFICATE-----`n"
  $pem += $b64 + "`n"
  $pem += "-----END CERTIFICATE-----`n`n"
}
Set-Content -Path $pemPath -Value $pem -Encoding ascii
Write-Host "PEM escrito en: $pemPath ($((Get-Item $pemPath).Length) bytes)" -ForegroundColor Green

# Configurar variable de usuario permanente
[Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', $pemPath, 'User')
$env:NODE_EXTRA_CA_CERTS = $pemPath
Write-Host ''
Write-Host 'Variable NODE_EXTRA_CA_CERTS configurada como variable de usuario permanente.' -ForegroundColor Green
Write-Host ''
Write-Host 'IMPORTANTE: cierra y reabre tu terminal/VSCode para que Node la lea.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Verifica con:' -ForegroundColor Cyan
Write-Host '  echo $env:NODE_EXTRA_CA_CERTS'
Write-Host '  node --eval "fetch(''https://api.ahrefs.com'').then(r=>console.log(r.status))"'
