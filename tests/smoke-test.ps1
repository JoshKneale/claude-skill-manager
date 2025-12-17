#Requires -Version 5.1
# Smoke test for trigger.ps1
# Verifies the hook machinery works without actually calling Claude

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir

function Pass { param([string]$Message) Write-Host "PASS: $Message" -ForegroundColor Green }
function Fail { param([string]$Message) Write-Host "FAIL: $Message" -ForegroundColor Red; exit 1 }

Write-Host "=== Smoke Test: trigger.ps1 ==="

# Create temp directory structure
$TestHome = Join-Path ([System.IO.Path]::GetTempPath()) "smoke-test-$(Get-Random)"
New-Item -ItemType Directory -Path $TestHome -Force | Out-Null

Write-Host "Test home: $TestHome"

try {
    # Set up fake USERPROFILE
    $env:USERPROFILE = $TestHome
    $env:SMOKE_TEST_MARKER_DIR = $TestHome

    # Create projects directory with mock transcript
    $ProjectsDir = Join-Path $TestHome ".claude\projects\-Users-test-myproject"
    New-Item -ItemType Directory -Path $ProjectsDir -Force | Out-Null
    Copy-Item (Join-Path $ScriptDir "fixtures\mock-transcript.jsonl") (Join-Path $ProjectsDir "session-12345.jsonl")

    # Create mock claude wrapper script in temp location
    $MockClaudeDir = Join-Path $TestHome "bin"
    New-Item -ItemType Directory -Path $MockClaudeDir -Force | Out-Null

    # Create a wrapper that calls our mock-claude.ps1
    $MockClaudeWrapper = Join-Path $MockClaudeDir "claude.ps1"
    @"
# Mock claude wrapper
`$MarkerDir = if (`$env:SMOKE_TEST_MARKER_DIR) { `$env:SMOKE_TEST_MARKER_DIR } else { `$env:TEMP }
`$MarkerFile = Join-Path `$MarkerDir "claude-was-called"
`$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
"mock-claude called with args: `$(`$args -join ' ')" | Out-File -Append -FilePath `$MarkerFile
"timestamp: `$timestamp" | Out-File -Append -FilePath `$MarkerFile
exit 0
"@ | Out-File -FilePath $MockClaudeWrapper -Encoding UTF8

    # Also create a batch file wrapper for Windows compatibility
    $MockClaudeBat = Join-Path $MockClaudeDir "claude.bat"
    "@pwsh -NoProfile -File `"$MockClaudeWrapper`" %*" | Out-File -FilePath $MockClaudeBat -Encoding ASCII

    # Add mock claude to PATH
    $env:PATH = "$MockClaudeDir;$env:PATH"

    # Run trigger.ps1 by dot-sourcing (keeps background jobs in our session)
    # Note: In production, trigger.ps1 runs as a separate process from the hook.
    # For testing, we dot-source so we can wait for the background job.
    Write-Host "Running trigger.ps1..."
    $TriggerScript = Join-Path $RepoDir "scripts/trigger.ps1"
    try {
        $null | . $TriggerScript
        Pass "trigger.ps1 exited cleanly"
    } catch {
        Fail "trigger.ps1 threw exception: $_"
    }

    # Wait for background job to complete
    $StateFile = Join-Path $TestHome ".claude/skill-manager/analyzed.json"
    Write-Host "Waiting for background job to complete..."

    $jobs = Get-Job
    if ($jobs) {
        $jobs | Wait-Job -Timeout 15 | Out-Null
        # Capture any job output/errors for debugging
        $jobOutput = $jobs | Receive-Job 2>&1
        if ($jobOutput) {
            Write-Host "Job output: $jobOutput"
        }
    } else {
        # No jobs found, wait by polling state file
        $Timeout = 10
        $Elapsed = 0
        while ($Elapsed -lt $Timeout) {
            if (Test-Path $StateFile) {
                try {
                    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
                    $transcripts = $state.transcripts.PSObject.Properties
                    if ($transcripts.Count -gt 0) {
                        $status = $transcripts | Select-Object -First 1 | ForEach-Object { $_.Value.status }
                        if ($status -eq "completed" -or $status -eq "failed") {
                            break
                        }
                    }
                } catch {}
            }
            Start-Sleep -Milliseconds 500
            $Elapsed++
        }
        if ($Elapsed -ge $Timeout) {
            Fail "Timed out waiting for processing to complete"
        }
    }
    Pass "Background processing completed"

    # Check state file exists
    if (-not (Test-Path $StateFile)) {
        Fail "State file not created: $StateFile"
    }
    Pass "State file exists"

    # Validate state file structure
    $state = Get-Content $StateFile -Raw | ConvertFrom-Json

    if ($state.version -ne 1) {
        Fail "State file missing version field"
    }
    Pass "State file has version field"

    if (-not $state.transcripts) {
        Fail "State file missing transcripts object"
    }
    Pass "State file has transcripts object"

    # Check transcript was processed
    $transcriptCount = ($state.transcripts.PSObject.Properties | Measure-Object).Count
    if ($transcriptCount -lt 1) {
        Fail "No transcripts recorded in state file"
    }
    Pass "Transcript recorded in state file"

    # Check transcript status
    $status = $state.transcripts.PSObject.Properties | Select-Object -First 1 | ForEach-Object { $_.Value.status }
    if ($status -ne "completed") {
        Fail "Transcript status is '$status', expected 'completed'"
    }
    Pass "Transcript marked as completed"

    # Check mock claude was called
    # In Docker, system-wide mock writes to /tmp; locally it writes to test home
    $MarkerFile = Join-Path $TestHome "claude-was-called"
    $SystemMarkerFile = "/tmp/claude-was-called"

    $foundMarker = $false
    $markerContent = ""

    if (Test-Path $MarkerFile) {
        $foundMarker = $true
        $markerContent = Get-Content $MarkerFile -Raw
    } elseif (Test-Path $SystemMarkerFile) {
        $foundMarker = $true
        $markerContent = Get-Content $SystemMarkerFile -Raw
    }

    if (-not $foundMarker) {
        Fail "Mock claude was not called (marker file missing from both $MarkerFile and $SystemMarkerFile)"
    }
    Pass "Mock claude was invoked"

    # Verify mock claude received the skill-manager command
    if ($markerContent -notmatch "/skill-manager") {
        Fail "Mock claude was not called with /skill-manager command"
    }
    Pass "Mock claude received /skill-manager command"

    Write-Host ""
    Write-Host "All smoke tests passed!" -ForegroundColor Green

} finally {
    # Cleanup
    Remove-Item -Path $TestHome -Recurse -Force -ErrorAction SilentlyContinue
}
