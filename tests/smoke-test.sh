#!/bin/bash
# Smoke test for trigger.sh
# Verifies the hook machinery works without actually calling Claude

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; exit 1; }

echo "=== Smoke Test: trigger.sh ==="

# Create temp directory structure
TEST_HOME=$(mktemp -d)
trap "rm -rf $TEST_HOME" EXIT

echo "Test home: $TEST_HOME"

# Set up fake HOME
export HOME="$TEST_HOME"
export SMOKE_TEST_MARKER_DIR="$TEST_HOME"

# Create projects directory with mock transcript
PROJECTS_DIR="$TEST_HOME/.claude/projects/-Users-test-myproject"
mkdir -p "$PROJECTS_DIR"
cp "$SCRIPT_DIR/fixtures/mock-transcript.jsonl" "$PROJECTS_DIR/session-12345.jsonl"

# Create mock claude command in temp bin directory
MOCK_BIN="$TEST_HOME/bin"
mkdir -p "$MOCK_BIN"
cp "$SCRIPT_DIR/mock-claude" "$MOCK_BIN/claude"
chmod +x "$MOCK_BIN/claude"
export PATH="$MOCK_BIN:$PATH"

# Verify jq is available
if ! command -v jq &> /dev/null; then
  fail "jq is not installed (required for trigger.sh)"
fi

# Run trigger.sh (it reads from stdin, so provide empty input)
echo "Running trigger.sh..."
echo "" | "$REPO_DIR/scripts/trigger.sh"
TRIGGER_EXIT=$?

if [ $TRIGGER_EXIT -ne 0 ]; then
  fail "trigger.sh exited with code $TRIGGER_EXIT"
fi
pass "trigger.sh exited cleanly"

# Wait for background process to complete (poll state file)
STATE_FILE="$TEST_HOME/.claude/skill-manager/analyzed.json"
TIMEOUT=10
ELAPSED=0

echo "Waiting for background processing (max ${TIMEOUT}s)..."
while [ $ELAPSED -lt $TIMEOUT ]; do
  if [ -f "$STATE_FILE" ]; then
    # Check if transcript is marked as completed or failed (not in_progress)
    STATUS=$(jq -r '.transcripts | to_entries | .[0].value.status // "none"' "$STATE_FILE" 2>/dev/null || echo "none")
    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
      break
    fi
  fi
  sleep 0.5
  ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  fail "Timed out waiting for processing to complete"
fi
pass "Background processing completed"

# Check state file exists and has correct structure
if [ ! -f "$STATE_FILE" ]; then
  fail "State file not created: $STATE_FILE"
fi
pass "State file exists"

# Validate state file structure
if ! jq -e '.version == 1' "$STATE_FILE" > /dev/null 2>&1; then
  fail "State file missing version field"
fi
pass "State file has version field"

if ! jq -e '.transcripts | type == "object"' "$STATE_FILE" > /dev/null 2>&1; then
  fail "State file missing transcripts object"
fi
pass "State file has transcripts object"

# Check transcript was processed
TRANSCRIPT_COUNT=$(jq '.transcripts | length' "$STATE_FILE")
if [ "$TRANSCRIPT_COUNT" -lt 1 ]; then
  fail "No transcripts recorded in state file"
fi
pass "Transcript recorded in state file"

# Check transcript status
STATUS=$(jq -r '.transcripts | to_entries | .[0].value.status' "$STATE_FILE")
if [ "$STATUS" != "completed" ]; then
  fail "Transcript status is '$STATUS', expected 'completed'"
fi
pass "Transcript marked as completed"

# Check mock claude was called (marker file created)
MARKER_FILE="$TEST_HOME/claude-was-called"
if [ ! -f "$MARKER_FILE" ]; then
  fail "Mock claude was not called (marker file missing)"
fi
pass "Mock claude was invoked"

# Verify mock claude received the skill-manager command
if ! grep -q "/skill-manager" "$MARKER_FILE"; then
  fail "Mock claude was not called with /skill-manager command"
fi
pass "Mock claude received /skill-manager command"

echo ""
echo -e "${GREEN}All smoke tests passed!${NC}"
