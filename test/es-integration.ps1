$ErrorActionPreference = 'Stop'
$esCandidates = @(
  (Join-Path $env:ProgramW6432 'Everything\es.exe'),
  (Join-Path $env:ProgramFiles 'Everything\es.exe'),
  'D:\Program Files\Everything\es.exe',
  'C:\Program Files\Everything\es.exe',
  'C:\Program Files (x86)\Everything\es.exe'
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$es = $esCandidates | Select-Object -First 1
if (-not $es) {
  Write-Output 'SKIP: es.exe not found; Everything integration test was not run.'
  exit 0
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-everything-es-integration-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
try {
  Set-Content -LiteralPath (Join-Path $work '-version') -Value 'x' -Encoding ascii
  Set-Content -LiteralPath (Join-Path $work 'normal.txt') -Value 'x' -Encoding ascii
  Set-Content -LiteralPath (Join-Path $work 'a b.txt') -Value 'x' -Encoding ascii
  Set-Content -LiteralPath (Join-Path $work '测试-审计-文件.txt') -Value 'x' -Encoding utf8
  Start-Sleep -Milliseconds 1200

  function Run-EsExport([string]$query) {
    $export = Join-Path $work ('out-' + [guid]::NewGuid().ToString('N') + '.txt')
    $stdout = Join-Path $work ('stdout-' + [guid]::NewGuid().ToString('N') + '.txt')
    $stderr = Join-Path $work ('stderr-' + [guid]::NewGuid().ToString('N') + '.txt')
    Start-Process -FilePath $es -ArgumentList @('-n', '20', '-path', $work, '-export-txt', $export, '-utf8-bom', $query) -NoNewWindow -Wait -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
    if (-not (Test-Path -LiteralPath $export)) {
      $detail = Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
      throw "es.exe did not create an export for query: $query $detail"
    }
    $bytes = [System.IO.File]::ReadAllBytes($export)
    return [pscustomobject]@{
      Text = [System.Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF)
      Bytes = $bytes
    }
  }

  $normal = Run-EsExport '*.txt'
  if ($normal.Text -notmatch 'normal\.txt') { throw 'normal query did not return normal.txt' }
  if ($normal.Text -notmatch '测试-审计-文件\.txt') { throw 'normal query did not preserve the UTF-8 path' }

  $literalDash = Run-EsExport '"-version"'
  if ($literalDash.Text -notmatch '\-version') { throw 'quoted leading-dash query was not searchable' }
  if ($literalDash.Text -match '^1\.1\.0\.') { throw 'quoted leading-dash query was executed as -version' }

  $evil = Join-Path $work 'injected.txt'
  $malicious = Run-EsExport ('"-export-txt=' + $evil + '"')
  if (Test-Path -LiteralPath $evil) { throw 'quoted query still performed an export option injection' }
  if ($malicious.Text.Length -ne 0) { throw 'quoted option-like query unexpectedly returned paths' }

  Write-Output 'PASS: es.exe integration (normal query, UTF-8 paths, quoted switch-like query, option-injection regression).'
}
finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}