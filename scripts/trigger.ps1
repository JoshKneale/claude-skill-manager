#Requires -Version 5.1
# Skill Manager - SessionEnd Hook Trigger (Windows PowerShell)
# Discovers and analyzes unanalyzed transcripts across all projects

$ErrorActionPreference = "Stop"

# Configuration (override via environment variables)
$TranscriptCount = if ($env:SKILL_MANAGER_COUNT) { [int]$env:SKILL_MANAGER_COUNT } else { 1 }
$LookbackDays = if ($env:SKILL_MANAGER_LOOKBACK_DAYS) { [int]$env:SKILL_MANAGER_LOOKBACK_DAYS } else { 7 }
$TruncateLines = if ($env:SKILL_MANAGER_TRUNCATE_LINES) { [int]$env:SKILL_MANAGER_TRUNCATE_LINES } else { 30 }

# Paths
$StateDir = Join-Path $env:USERPROFILE ".claude\skill-manager"
$StateFile = Join-Path $StateDir "analyzed.json"
$LogFile = Join-Path $StateDir "skill-manager-$(Get-Date -Format 'yyyy-MM-dd').log"
$LockFile = Join-Path $StateDir "skill-manager.lock"
$ProjectsDir = Join-Path $env:USERPROFILE ".claude\projects"

# Ensure directories exist
if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}

# Cleanup logs older than 7 days
Get-ChildItem -Path $StateDir -Filter "skill-manager-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

# Logging function
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] $Message" | Add-Content -Path $LogFile -Encoding UTF8
}

# Check if another instance is running
function Test-IsRunning {
    if (Test-Path $LockFile) {
        try {
            $pid = Get-Content $LockFile -ErrorAction Stop
            if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
                return $true
            }
        } catch {}
        # Stale lock file, remove it
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    }
    return $false
}

# Acquire lock
function Set-Lock {
    $PID | Out-File -FilePath $LockFile -Encoding UTF8 -NoNewline
}

# Release lock
function Remove-Lock {
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}

# Preprocess transcript to reduce token usage
# Removes metadata bloat, filters unneeded message types, truncates large tool results
# Returns path to preprocessed temp file (caller must clean up)
function Invoke-PreprocessTranscript {
    param([string]$InputFile, [int]$MaxLines)

    $outputFile = [System.IO.Path]::GetTempFileName()
    $output = @()

    foreach ($line in Get-Content $InputFile -Encoding UTF8) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        try {
            $obj = $line | ConvertFrom-Json

            # Skip metadata-only message types
            if ($obj.type -eq "file-history-snapshot" -or $obj.type -eq "queue-operation") {
                continue
            }

            # Remove redundant session-level fields
            $obj.PSObject.Properties.Remove("userType")
            $obj.PSObject.Properties.Remove("isSidechain")
            $obj.PSObject.Properties.Remove("cwd")
            $obj.PSObject.Properties.Remove("version")
            $obj.PSObject.Properties.Remove("gitBranch")

            # Remove redundant role field from message
            if ($obj.message) {
                $obj.message.PSObject.Properties.Remove("role")
            }

            # Truncate large text content in tool results
            if ($obj.message -and $obj.message.content) {
                for ($i = 0; $i -lt $obj.message.content.Count; $i++) {
                    $item = $obj.message.content[$i]
                    if ($item.type -eq "tool_result") {
                        # Handle string content
                        if ($item.content -is [string]) {
                            $lines = $item.content -split "`n"
                            if ($lines.Count -gt ($MaxLines * 2)) {
                                $truncated = $lines.Count - ($MaxLines * 2)
                                $newLines = $lines[0..($MaxLines - 1)] + @("", "... [truncated $truncated lines] ...", "") + $lines[(-$MaxLines)..(-1)]
                                $obj.message.content[$i].content = $newLines -join "`n"
                            }
                        }
                        # Handle array content (array of {type, text} objects)
                        elseif ($item.content -is [array]) {
                            for ($j = 0; $j -lt $item.content.Count; $j++) {
                                $contentItem = $item.content[$j]
                                if ($contentItem.type -eq "text" -and $contentItem.text -is [string]) {
                                    $lines = $contentItem.text -split "`n"
                                    if ($lines.Count -gt ($MaxLines * 2)) {
                                        $truncated = $lines.Count - ($MaxLines * 2)
                                        $newLines = $lines[0..($MaxLines - 1)] + @("", "... [truncated $truncated lines] ...", "") + $lines[(-$MaxLines)..(-1)]
                                        $obj.message.content[$i].content[$j].text = $newLines -join "`n"
                                    }
                                }
                            }
                        }
                    }
                }
            }

            $output += ($obj | ConvertTo-Json -Compress -Depth 20)
        } catch {
            # If line fails to parse, skip it
            continue
        }
    }

    $output | Out-File -FilePath $outputFile -Encoding UTF8 -NoNewline
    return $outputFile
}

# Read and discard stdin (hook compliance)
try { $null = $input | Out-Null } catch {}

Write-Log "=== SessionEnd triggered ==="

# Initialize state file if it doesn't exist
if (-not (Test-Path $StateFile)) {
    '{"version":1,"transcripts":{}}' | Out-File -FilePath $StateFile -Encoding UTF8 -NoNewline
    Write-Log "Initialized state file: $StateFile"
}

# Validate state file is valid JSON
try {
    $null = Get-Content $StateFile -Raw | ConvertFrom-Json
} catch {
    Write-Log "WARNING: State file corrupted, reinitializing"
    '{"version":1,"transcripts":{}}' | Out-File -FilePath $StateFile -Encoding UTF8 -NoNewline
}

# Discover recent transcripts
Write-Log "Discovering transcripts from last $LookbackDays days..."

if (-not (Test-Path $ProjectsDir)) {
    Write-Log "Projects directory does not exist: $ProjectsDir"
    exit 0
}

# Find transcripts, sort by modification time (newest first)
$cutoffDate = (Get-Date).AddDays(-$LookbackDays)
$candidates = Get-ChildItem -Path $ProjectsDir -Filter "*.jsonl" -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt $cutoffDate } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 50 |
    Select-Object -ExpandProperty FullName

if (-not $candidates -or $candidates.Count -eq 0) {
    Write-Log "No recent transcripts found in $ProjectsDir"
    exit 0
}

Write-Log "Found $($candidates.Count) candidate transcripts"

# Read current state
$state = Get-Content $StateFile -Raw | ConvertFrom-Json

# Find unanalyzed transcripts
$unanalyzed = @()
foreach ($transcript in $candidates) {
    # Check if transcript path exists in state file
    $transcriptKey = $transcript -replace '\\', '/'  # Normalize path separators
    if (-not $state.transcripts.PSObject.Properties[$transcriptKey]) {
        $unanalyzed += $transcript
        if ($unanalyzed.Count -ge $TranscriptCount) {
            break
        }
    }
}

if ($unanalyzed.Count -eq 0) {
    Write-Log "All recent transcripts already analyzed"
    exit 0
}

Write-Log "Found $($unanalyzed.Count) unanalyzed transcript(s) to process"

# Check if another instance is already running
if (Test-IsRunning) {
    $existingPid = Get-Content $LockFile -ErrorAction SilentlyContinue
    Write-Log "Another skill-manager instance is already running (PID: $existingPid). Skipping."
    exit 0
}

# Process in background job so session exits immediately
$jobScript = {
    param($StateDir, $StateFile, $LockFile, $LogFile, $UnanalyzedList, $Debug, $TruncateLines)

    $ErrorActionPreference = "Stop"

    function Write-Log {
        param([string]$Message)
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        "[$timestamp] $Message" | Add-Content -Path $LogFile -Encoding UTF8
    }

    # Preprocess transcript to reduce token usage (duplicated here since jobs run in separate process)
    function Invoke-PreprocessTranscript {
        param([string]$InputFile, [int]$MaxLines)

        $outputFile = [System.IO.Path]::GetTempFileName()
        $output = @()

        foreach ($line in Get-Content $InputFile -Encoding UTF8) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }

            try {
                $obj = $line | ConvertFrom-Json

                # Skip metadata-only message types
                if ($obj.type -eq "file-history-snapshot" -or $obj.type -eq "queue-operation") {
                    continue
                }

                # Remove redundant session-level fields
                $obj.PSObject.Properties.Remove("userType")
                $obj.PSObject.Properties.Remove("isSidechain")
                $obj.PSObject.Properties.Remove("cwd")
                $obj.PSObject.Properties.Remove("version")
                $obj.PSObject.Properties.Remove("gitBranch")

                # Remove redundant role field from message
                if ($obj.message) {
                    $obj.message.PSObject.Properties.Remove("role")
                }

                # Truncate large text content in tool results
                if ($obj.message -and $obj.message.content) {
                    for ($i = 0; $i -lt $obj.message.content.Count; $i++) {
                        $item = $obj.message.content[$i]
                        if ($item.type -eq "tool_result") {
                            # Handle string content
                            if ($item.content -is [string]) {
                                $lines = $item.content -split "`n"
                                if ($lines.Count -gt ($MaxLines * 2)) {
                                    $truncated = $lines.Count - ($MaxLines * 2)
                                    $newLines = $lines[0..($MaxLines - 1)] + @("", "... [truncated $truncated lines] ...", "") + $lines[(-$MaxLines)..(-1)]
                                    $obj.message.content[$i].content = $newLines -join "`n"
                                }
                            }
                            # Handle array content (array of {type, text} objects)
                            elseif ($item.content -is [array]) {
                                for ($j = 0; $j -lt $item.content.Count; $j++) {
                                    $contentItem = $item.content[$j]
                                    if ($contentItem.type -eq "text" -and $contentItem.text -is [string]) {
                                        $lines = $contentItem.text -split "`n"
                                        if ($lines.Count -gt ($MaxLines * 2)) {
                                            $truncated = $lines.Count - ($MaxLines * 2)
                                            $newLines = $lines[0..($MaxLines - 1)] + @("", "... [truncated $truncated lines] ...", "") + $lines[(-$MaxLines)..(-1)]
                                            $obj.message.content[$i].content[$j].text = $newLines -join "`n"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                $output += ($obj | ConvertTo-Json -Compress -Depth 20)
            } catch {
                # If line fails to parse, skip it
                continue
            }
        }

        $output | Out-File -FilePath $outputFile -Encoding UTF8 -NoNewline
        return $outputFile
    }

    # Acquire lock
    $PID | Out-File -FilePath $LockFile -Encoding UTF8 -NoNewline

    try {
        foreach ($transcript in $UnanalyzedList) {
            Write-Log "Processing: $transcript"

            # Skip if file no longer exists
            if (-not (Test-Path $transcript)) {
                Write-Log "  Skipped (file missing): $transcript"
                continue
            }

            # Read current state
            $state = Get-Content $StateFile -Raw | ConvertFrom-Json
            $transcriptKey = $transcript -replace '\\', '/'

            # Mark as in_progress
            $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
            if (-not $state.transcripts) {
                $state | Add-Member -NotePropertyName "transcripts" -NotePropertyValue ([PSCustomObject]@{}) -Force
            }
            $state.transcripts | Add-Member -NotePropertyName $transcriptKey -NotePropertyValue ([PSCustomObject]@{
                status = "in_progress"
                started_at = $timestamp
            }) -Force
            $state | ConvertTo-Json -Depth 10 | Out-File -FilePath $StateFile -Encoding UTF8 -NoNewline

            # Preprocess transcript to reduce token usage
            Write-Log "  Preprocessing transcript..."
            $preprocessedFile = Invoke-PreprocessTranscript -InputFile $transcript -MaxLines $TruncateLines

            # Log size reduction
            $originalSize = (Get-Item $transcript).Length
            $preprocessedSize = (Get-Item $preprocessedFile).Length
            $reduction = [math]::Round(100 - ($preprocessedSize * 100 / $originalSize))
            Write-Log "  Reduced from $originalSize to $preprocessedSize bytes ($reduction% reduction)"

            # Run analysis
            Write-Log "  Starting skill extraction..."
            $startTime = Get-Date

            try {
                if ($Debug -eq "1") {
                    $output = & claude --model sonnet --print "/skill-manager $preprocessedFile" 2>&1
                    $output | Add-Content -Path $LogFile -Encoding UTF8
                    $exitCode = $LASTEXITCODE
                } else {
                    $null = & claude --model sonnet --print "/skill-manager $preprocessedFile" 2>&1
                    $exitCode = $LASTEXITCODE
                }
            } catch {
                $exitCode = 1
                Write-Log "  Exception: $_"
            }

            # Clean up preprocessed temp file
            Remove-Item $preprocessedFile -Force -ErrorAction SilentlyContinue

            $endTime = Get-Date
            $duration = [int]($endTime - $startTime).TotalSeconds

            # Read state again for update
            $state = Get-Content $StateFile -Raw | ConvertFrom-Json
            $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"

            if ($exitCode -eq 0) {
                Write-Log "  Completed in ${duration}s: $transcript"
                $state.transcripts | Add-Member -NotePropertyName $transcriptKey -NotePropertyValue ([PSCustomObject]@{
                    status = "completed"
                    analyzed_at = $timestamp
                }) -Force
            } else {
                Write-Log "  Failed (exit $exitCode) in ${duration}s: $transcript"
                $state.transcripts | Add-Member -NotePropertyName $transcriptKey -NotePropertyValue ([PSCustomObject]@{
                    status = "failed"
                    failed_at = $timestamp
                    exit_code = $exitCode
                }) -Force
            }
            $state | ConvertTo-Json -Depth 10 | Out-File -FilePath $StateFile -Encoding UTF8 -NoNewline
        }

        Write-Log "=== Processing complete ==="
    } finally {
        # Release lock
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    }
}

$debugMode = if ($env:SKILL_MANAGER_DEBUG) { $env:SKILL_MANAGER_DEBUG } else { "0" }

Start-Job -ScriptBlock $jobScript -ArgumentList $StateDir, $StateFile, $LockFile, $LogFile, $unanalyzed, $debugMode, $TruncateLines | Out-Null

Write-Log "Background processing started for $($unanalyzed.Count) transcript(s)"
