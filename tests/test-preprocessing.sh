#!/bin/bash
# Test: Verify preprocessing function works correctly
# - Output is valid JSONL
# - Output is smaller than input (when input has large tool results)
# - Metadata lines (file-history-snapshot, queue-operation) are removed
# - Large tool results are truncated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; exit 1; }

echo "=== Test: Preprocessing ==="

# Verify jq is available
if ! command -v jq &> /dev/null; then
  fail "jq is not installed (required for this test)"
fi

# Source the preprocessing function from trigger.sh
# We need to extract just the function and required variables
TRUNCATE_LINES=30

# Copy the preprocess_transcript function (it's self-contained)
preprocess_transcript() {
  local input_file="$1"
  local output_file
  output_file=$(mktemp)

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

INPUT_FILE="$SCRIPT_DIR/fixtures/large-transcript.jsonl"
echo "Input file: $INPUT_FILE"

# Get input stats
INPUT_SIZE=$(wc -c < "$INPUT_FILE" | tr -d ' ')
INPUT_LINES=$(wc -l < "$INPUT_FILE" | tr -d ' ')
echo "Input: $INPUT_SIZE bytes, $INPUT_LINES lines"

# Run preprocessing
OUTPUT_FILE=$(preprocess_transcript "$INPUT_FILE")
trap "rm -f $OUTPUT_FILE" EXIT

# Get output stats
OUTPUT_SIZE=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
OUTPUT_LINES=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')
echo "Output: $OUTPUT_SIZE bytes, $OUTPUT_LINES lines"

# Test 1: Output is valid JSONL (each line is valid JSON)
echo ""
echo "Checking output validity..."
LINE_NUM=0
while IFS= read -r line; do
  LINE_NUM=$((LINE_NUM + 1))
  if ! echo "$line" | jq empty 2>/dev/null; then
    fail "Line $LINE_NUM is not valid JSON: $line"
  fi
done < "$OUTPUT_FILE"
pass "All $LINE_NUM lines are valid JSON"

# Test 2: Output is smaller than input
if [ "$OUTPUT_SIZE" -ge "$INPUT_SIZE" ]; then
  fail "Output ($OUTPUT_SIZE bytes) should be smaller than input ($INPUT_SIZE bytes)"
fi
REDUCTION=$((100 - (OUTPUT_SIZE * 100 / INPUT_SIZE)))
pass "Output is ${REDUCTION}% smaller than input"

# Test 3: Metadata lines are removed
if grep -q '"type":"file-history-snapshot"' "$OUTPUT_FILE"; then
  fail "file-history-snapshot entries should be removed"
fi
pass "file-history-snapshot entries removed"

if grep -q '"type":"queue-operation"' "$OUTPUT_FILE"; then
  fail "queue-operation entries should be removed"
fi
pass "queue-operation entries removed"

# Test 4: Role field is removed from messages
if grep -q '"role":' "$OUTPUT_FILE"; then
  fail "role field should be removed from messages"
fi
pass "role field removed from messages"

# Test 5: Large tool results are truncated (should contain truncation marker)
if ! grep -q '\[truncated' "$OUTPUT_FILE"; then
  fail "Large tool results should be truncated (no truncation marker found)"
fi
pass "Large tool results are truncated"

# Test 6: Output has fewer lines than input (metadata removed)
if [ "$OUTPUT_LINES" -ge "$INPUT_LINES" ]; then
  fail "Output should have fewer lines after removing metadata"
fi
pass "Output has fewer lines ($OUTPUT_LINES vs $INPUT_LINES)"

echo ""
echo -e "${GREEN}Preprocessing test passed!${NC}"
