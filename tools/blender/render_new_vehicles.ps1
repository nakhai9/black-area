# Renders the Bushmaster and Twin-gun Tank sheets once each in neutral grey + their faction masks (the game tints the
# masks with the owner's colour), both Blender processes at once, skipping a vehicle whose last sheet is already on
# disk, then converts to WebP (tools/to_webp.py). Runs detached: logs in %TEMP%\r-*.log, %TEMP%\r-done.txt when done.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$sprites = Join-Path $root "ui\public\sprites"
$jobs = @(@("bushmaster_render.py", "bushmaster-team"), @("twintank_render.py", "tank-twin-hull-team"))
$running = @()
foreach ($j in $jobs) {
  if ((Test-Path (Join-Path $sprites "$($j[1]).png")) -or (Get-ChildItem $sprites -Recurse -Filter "$($j[1]).webp")) { continue }
  $log = Join-Path $env:TEMP ("r-" + $j[0].Split("_")[0] + ".log")
  $running += Start-Process -FilePath $blender -ArgumentList @("-b", "--factory-startup", "-P", "`"$(Join-Path $PSScriptRoot $j[0])`"", "--", "24") -RedirectStandardOutput $log -NoNewWindow -PassThru
}
$running | ForEach-Object { $_.WaitForExit() }
Set-Location $root
python tools/to_webp.py *> (Join-Path $env:TEMP "r-webp.log")
"done" | Out-File (Join-Path $env:TEMP "r-done.txt")
