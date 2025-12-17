# Mock claude command for smoke testing (PowerShell)
# Writes a marker file to prove it was called, then exits 0

$MarkerDir = if ($env:SMOKE_TEST_MARKER_DIR) { $env:SMOKE_TEST_MARKER_DIR } else { $env:TEMP }
$MarkerFile = Join-Path $MarkerDir "claude-was-called"

# Log the arguments we received
$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
"mock-claude called with args: $($args -join ' ')" | Out-File -Append -FilePath $MarkerFile
"timestamp: $timestamp" | Out-File -Append -FilePath $MarkerFile

exit 0
