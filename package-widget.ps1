$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$widget = Join-Path $root "widget"
$widgetPublic = Join-Path $root "public\\widget"
$out = Join-Path $root "widget.zip"

if (!(Test-Path $widget)) {
  throw "Folder not found: $widget"
}

if (Test-Path $out) {
  Remove-Item $out -Force
}

$src = $widget
if (Test-Path $widgetPublic) {
  $src = $widgetPublic
}

Compress-Archive -Path (Join-Path $src "*") -DestinationPath $out -Force
Write-Host "Created: $out"

