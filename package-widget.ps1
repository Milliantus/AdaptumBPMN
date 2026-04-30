$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$widget = Join-Path $root "widget"
$out = Join-Path $root "widget.zip"

if (!(Test-Path $widget)) {
  throw "Folder not found: $widget"
}

if (Test-Path $out) {
  Remove-Item $out -Force
}

Compress-Archive -Path (Join-Path $widget "*") -DestinationPath $out -Force
Write-Host "Created: $out"

