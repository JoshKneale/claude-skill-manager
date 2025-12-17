#!/bin/bash
# Test: Verify failed claude invocation is handled correctly
# - Mock claude exits with code 1
# - State file should show status: "failed" and exit_code: 1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; exit 1; }

echo "=== Test: Failure Handling ==="

# Create temp directory structure
TEST_HOME=$(mktemp -d)
trap "rm -rf $TEST_HOME" EXIT

echo "Test home: $TEST_HOME"

# Set up fake HOME
export HOME="$TEST_HOME"
export SMOKE_TEST_MARKER_DIR="$TEST_HOME"
export MOCK_CLAUDE_EXIT_CODE=1  # Make mock claude fail

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

# Run trigger.sh
echo "Running trigger.sh with failing mock claude..."
echo "" | "$REPO_DIR/scripts/trigger.sh"

# Wait for background process to complete
STATE_FILE="$TEST_HOME/.claude/skill-manager/analyzed.json"
TIMEOUT=10
ELAPSED=0

echo "Waiting for background processing..."
while [ $ELAPSED -lt $TIMEOUT ]; do
  if [ -f "$STATE_FILE" ]; then
    STATUS=$(jq -r '.transcripts | to_entries | .[0].value.status // "none"' "$STATE_FILE" 2>/dev/null || echo "none")
    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
      break
    fi
  fi
  sleep 0.5
  ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  fail "Timed out waiting for processing"
fi

# Verify status is "failed"
STATUS=$(jq -r '.transcripts | to_entries | .[0].value.status' "$STATE_FILE")
if [ "$STATUS" != "failed" ]; then
  fail "Expected status 'failed', got '$STATUS'"
fi
pass "Transcript status is 'failed'"

# Verify exit_code is recorded
EXIT_CODE=$(jq -r '.transcripts | to_entries | .[0].value.exit_code' "$STATE_FILE")
if [ "$EXIT_CODE" != "1" ]; then
  fail "Expected exit_code 1, got '$EXIT_CODE'"
fi
pass "Exit code 1 recorded in state"

# Verify failed_at timestamp exists
FAILED_AT=$(jq -r '.transcripts | to_entries | .[0].value.failed_at // "missing"' "$STATE_FILE")
if [ "$FAILED_AT" = "missing" ] || [ "$FAILED_AT" = "null" ]; then
  fail "Missing failed_at timestamp"
fi
pass "failed_at timestamp recorded"

echo ""
echo -e "${GREEN}Failure handling test passed!${NC}"
