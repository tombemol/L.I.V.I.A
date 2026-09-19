param(
  [string]$Alias = "livia-upload",
  [string]$OutputPath = (Join-Path $HOME ".livia\signing\livia-upload-key.jks"),
  [switch]$CopyBase64ToClipboard
)

$ErrorActionPreference = "Stop"

$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
  throw "keytool não encontrado. Instale um JDK 17+ e abra um novo terminal."
}

$directory = Split-Path -Parent $OutputPath
if (-not (Test-Path $directory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

if (Test-Path $OutputPath) {
  throw "O arquivo já existe: $OutputPath. Não sobrescreva uma upload key existente. Faça backup dela."
}

Write-Host ""
Write-Host "=== L.I.V.I.A. Android upload key ===" -ForegroundColor Cyan
Write-Host "Arquivo: $OutputPath"
Write-Host "Alias:   $Alias"
Write-Host ""
Write-Host "O keytool vai pedir a senha do keystore." -ForegroundColor Yellow
Write-Host "Quando pedir a senha da chave do alias, pressione ENTER para usar a MESMA senha." -ForegroundColor Yellow
Write-Host "Essa senha será usada depois no GitHub Secret ANDROID_KEY_PASSWORD."
Write-Host ""

$keytoolArgs = @(
  "-genkeypair",
  "-v",
  "-storetype", "JKS",
  "-keystore", $OutputPath,
  "-alias", $Alias,
  "-keyalg", "RSA",
  "-keysize", "4096",
  "-validity", "10000",
  "-dname", "CN=L.I.V.I.A. Upload Key, OU=Open Source, O=L.I.V.I.A., C=BR"
)

& $keytool.Source @keytoolArgs

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $OutputPath)) {
  throw "A upload key não foi criada."
}

Write-Host ""
Write-Host "Upload key criada com sucesso." -ForegroundColor Green
Write-Host "Faça pelo menos dois backups seguros desse arquivo antes de continuar." -ForegroundColor Yellow
Write-Host ""

if ($CopyBase64ToClipboard) {
  $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($OutputPath))
  Set-Clipboard -Value $base64
  Write-Host "Base64 copiado para a área de transferência." -ForegroundColor Green
  Write-Host "Cole DIRETAMENTE no GitHub Secret ANDROID_KEY_BASE64. Não envie em chat, issue ou commit." -ForegroundColor Yellow
} else {
  Write-Host "Para converter a chave existente em Base64 e copiar direto para o clipboard:" -ForegroundColor Cyan
  Write-Host ""
  Write-Host ("  [Convert]::ToBase64String([IO.File]::ReadAllBytes('{0}')) | Set-Clipboard" -f $OutputPath)
}

Write-Host ""
Write-Host "GitHub Secrets esperados:" -ForegroundColor Cyan
Write-Host "  ANDROID_KEY_BASE64    = Base64 do arquivo JKS"
Write-Host "  ANDROID_KEY_ALIAS     = $Alias"
Write-Host "  ANDROID_KEY_PASSWORD  = a senha definida no keytool"
Write-Host ""
Write-Host "Nunca versione o .jks e nunca compartilhe a senha em texto público." -ForegroundColor Yellow
