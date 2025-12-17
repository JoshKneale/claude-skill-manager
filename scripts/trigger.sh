#!/bin/bash
# Skill Manager - SessionEnd Hook Trigger
# Discovers and analyzes unanalyzed transcripts across all projects

set -e

# Configuration (override via environment variables)
TRANSCRIPT_COUNT="${SKILL_MANAGER_COUNT:-1}"
LOOKBACK_DAYS="${SKILL_MANAGER_LOOKBACK_DAYS:-7}"
TRUNCATE_LINES="${SKILL_MANAGER_TRUNCATE_LINES:-30}"

# Paths
STATE_DIR="${HOME}/.claude/skill-manager"
STATE_FILE="${STATE_DIR}/analyzed.json"
LOG_FILE="${STATE_DIR}/skill-manager-$(date +%Y-%m-%d).log"
LOCK_FILE="${STATE_DIR}/skill-manager.lock"
PROJECTS_DIR="${HOME}/.claude/projects"

# OS Detection for cross-platform compatibility
OS_TYPE="$(uname -s)"
case "$OS_TYPE" in
  Darwin)
    # macOS (BSD stat)
    get_mtime() { stat -f "%m" "$1" 2>/dev/null; }
    ;;
  Linux|*)
    # Linux and others (GNU stat)
    get_mtime() { stat -c '%Y' "$1" 2>/dev/null; }
    ;;
esac

# Ensure directories exist
mkdir -p "$STATE_DIR"

# Cleanup logs older than 7 days
find "$STATE_DIR" -name "skill-manager-*.log" -mtime +7 -delete 2>/dev/null || true

# Logging function with timestamp
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Check if another instance is running
is_running() {
  if [ -f "$LOCK_FILE" ]; then
    local pid
    pid=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0  # Process is running
    fi
    # Stale lock file, remove it
    rm -f "$LOCK_FILE"
  fi
  return 1  # Not running
}

# Acquire lock (call from background process)
acquire_lock() {
  echo $$ > "$LOCK_FILE"
}

# Release lock
release_lock() {
  rm -f "$LOCK_FILE"
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  log "ERROR: jq is not installed."
  case "$OS_TYPE" in
    Darwin) log "  Install with: brew install jq" ;;
    Linux)  log "  Install with: apt install jq  OR  yum install jq" ;;
  esac
  log "  See: https://jqlang.github.io/jq/download/"
  exit 0
fi

# Preprocess transcript to reduce token usage
# Removes metadata bloat, filters unneeded message types, truncates large tool results
# Args: $1 = input transcript path
# Output: prints path to preprocessed temp file (caller must clean up)
preprocess_transcript() {
  local input_file="$1"
  local output_file
  output_file=$(mktemp)

  # jq filter that:
  # 1. Removes file-history-snapshot and queue-operation entries
  # 2. Strips redundant per-message fields (same for entire session)
  # 3. Removes message.role (redundant with type)
  # 4. Truncates large text content in tool results
  jq -c --argjson max_lines "$TRUNCATE_LINES" '
    # Skip metadata-only message types
    select(.type != "file-history-snapshot" and .type != "queue-operation")

    # Remove redundant session-level fields
    | del(.userType, .isSidechain, .cwd, .version, .gitBranch)

    # Remove redundant role field from message
    | if .message then .message |= del(.role) else . end

    # Truncate large text content in tool results
    | if .message.content then
        .message.content |= map(
          if .type == "tool_result" and (.content | type) == "string" then
            # Split into lines, truncate if over limit, rejoin
            .content |= (
              split("\n") |
              if length > ($max_lines * 2) then
                (.[0:$max_lines] + ["", "... [truncated \(length - $max_lines * 2) lines] ...", ""] + .[-$max_lines:])
                | join("\n")
              else
                join("\n")
              end
            )
          elif .type == "tool_result" and (.content | type) == "array" then
            # Handle array-format tool results (content is array of {type, text} objects)
            .content |= map(
              if .type == "text" and (.text | type) == "string" then
                .text |= (
                  split("\n") |
                  if length > ($max_lines * 2) then
                    (.[0:$max_lines] + ["", "... [truncated \(length - $max_lines * 2) lines] ...", ""] + .[-$max_lines:])
                    | join("\n")
                  else
                    join("\n")
                  end
                )
              else
                .
              end
            )
          else
            .
          end
        )
      else
        .
      end
  ' "$input_file" > "$output_file" 2>/dev/null

  echo "$output_file"
}

# Read and discard hook input (required for hook compliance, but we discover transcripts ourselves)
cat > /dev/null

log "=== SessionEnd triggered ==="

# Initialize state file if it doesn't exist
if [ ! -f "$STATE_FILE" ]; then
  echo '{"version":1,"transcripts":{}}' > "$STATE_FILE"
  log "Initialized state file: $STATE_FILE"
fi

# Validate state file is valid JSON
if ! jq empty "$STATE_FILE" 2>/dev/null; then
  log "WARNING: State file corrupted, reinitializing"
  echo '{"version":1,"transcripts":{}}' > "$STATE_FILE"
fi

# Discover recent transcripts (modified within lookback window)
log "Discovering transcripts from last $LOOKBACK_DAYS days..."

if [ ! -d "$PROJECTS_DIR" ]; then
  log "Projects directory does not exist: $PROJECTS_DIR"
  exit 0
fi

# Find transcripts and sort by modification time (newest first)
# Uses get_mtime function for cross-platform stat compatibility
candidates=""
while IFS= read -r -d '' file; do
  mtime=$(get_mtime "$file")
  if [ -n "$mtime" ]; then
    candidates+="$mtime $file"$'\n'
  fi
done < <(find "$PROJECTS_DIR" -name "*.jsonl" -mtime -"$LOOKBACK_DAYS" -type f -print0 2>/dev/null)

candidates=$(echo "$candidates" | sort -rn | head -50 | cut -d' ' -f2-)

if [ -z "$candidates" ]; then
  log "No recent transcripts found in $PROJECTS_DIR"
  exit 0
fi

candidate_count=$(echo "$candidates" | wc -l | tr -d ' ')
log "Found $candidate_count candidate transcripts"

# Find unanalyzed transcripts
unanalyzed=()
while IFS= read -r transcript; do
  [ -z "$transcript" ] && continue

  # Check if transcript path exists in state file
  if ! jq -e --arg path "$transcript" '.transcripts[$path]' "$STATE_FILE" > /dev/null 2>&1; then
    unanalyzed+=("$transcript")
    # Stop once we have enough
    if [ ${#unanalyzed[@]} -ge "$TRANSCRIPT_COUNT" ]; then
      break
    fi
  fi
done <<< "$candidates"

if [ ${#unanalyzed[@]} -eq 0 ]; then
  log "All recent transcripts already analyzed"
  exit 0
fi

log "Found ${#unanalyzed[@]} unanalyzed transcript(s) to process"

# Check if another instance is already running
if is_running; then
  log "Another skill-manager instance is already running (PID: $(cat "$LOCK_FILE")). Skipping."
  exit 0
fi

# Process in background so session exits immediately
(
  acquire_lock
  trap 'release_lock' EXIT
  for transcript in "${unanalyzed[@]}"; do
    log "Processing: $transcript"

    # Skip if file no longer exists
    if [ ! -f "$transcript" ]; then
      log "  Skipped (file missing): $transcript"
      continue
    fi

    # Mark as in_progress
    tmp_file=$(mktemp)
    jq --arg path "$transcript" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '.transcripts[$path] = {"status": "in_progress", "started_at": $ts}' \
      "$STATE_FILE" > "$tmp_file" && mv "$tmp_file" "$STATE_FILE"

    # Preprocess transcript to reduce token usage
    log "  Preprocessing transcript..."
    preprocessed_file=$(preprocess_transcript "$transcript")

    # Get file sizes for logging
    original_size=$(wc -c < "$transcript" | tr -d ' ')
    preprocessed_size=$(wc -c < "$preprocessed_file" | tr -d ' ')
    reduction=$((100 - (preprocessed_size * 100 / original_size)))
    log "  Reduced from ${original_size} to ${preprocessed_size} bytes (${reduction}% reduction)"

    # Run analysis
    log "  Starting skill extraction..."
    start_time=$(date +%s)

    if [ "${SKILL_MANAGER_DEBUG:-0}" = "1" ]; then
      # Debug mode: capture full Claude output
      if claude --model sonnet --print "/skill-manager $preprocessed_file" >> "$LOG_FILE" 2>&1; then
        exit_code=0
      else
        exit_code=$?
      fi
    else
      # Normal mode: discard Claude output, only log status
      if claude --model sonnet --print "/skill-manager $preprocessed_file" > /dev/null 2>&1; then
        exit_code=0
      else
        exit_code=$?
      fi
    fi

    # Clean up preprocessed temp file
    rm -f "$preprocessed_file"

    end_time=$(date +%s)
    duration=$((end_time - start_time))

    # Update state based on result
    tmp_file=$(mktemp)
    if [ $exit_code -eq 0 ]; then
      log "  Completed in ${duration}s: $transcript"
      jq --arg path "$transcript" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '.transcripts[$path] = {"status": "completed", "analyzed_at": $ts}' \
        "$STATE_FILE" > "$tmp_file" && mv "$tmp_file" "$STATE_FILE"
    else
      log "  Failed (exit $exit_code) in ${duration}s: $transcript"
      jq --arg path "$transcript" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson code "$exit_code" \
        '.transcripts[$path] = {"status": "failed", "failed_at": $ts, "exit_code": $code}' \
        "$STATE_FILE" > "$tmp_file" && mv "$tmp_file" "$STATE_FILE"
    fi
  done

  log "=== Processing complete ==="
) & disown

log "Background processing started for ${#unanalyzed[@]} transcript(s)"
