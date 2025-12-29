# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Skill Manager is a Claude Code plugin that automatically extracts reusable skills from conversation transcripts. When a Claude Code session ends, it analyzes the transcript for failures, corrections, and successful patterns, then writes structured skills to `.claude/skills/`.

## Architecture

```
.claude-plugin/
├── plugin.json          # Plugin manifest (name, version, commands/hooks paths)
└── marketplace.json     # Marketplace distribution config

commands/
└── skill-manager.md     # Slash command prompt - the core extraction logic

hooks/
└── hooks.json           # Registers SessionEnd hook

scripts/
├── trigger.js           # Node.js script that hooks invoke (cross-platform, launches claude)
└── usage-tracker.js     # Tracks skill usage and retires unused skills

templates/skill/         # Templates for generated skill files
├── SKILL.md
├── examples.md
└── troubleshooting.md
```

## How It Works

1. **SessionEnd hook** triggers `scripts/trigger.js` with hook input via stdin
2. Script parses `transcript_path` from the hook input JSON
3. Applies filters: skips subagent sessions (`agent-*.jsonl`) and short transcripts (< MIN_LINES)
4. **Preprocesses transcript** to reduce token usage (removes metadata bloat, truncates large tool results)
5. Spawns detached child process to run Claude analysis in background
6. The `/skill-manager` command prompt guides Claude to:
   - Read the JSONL transcript
   - Identify failures, corrections, error solutions
   - Check for existing skills to enhance (prefer enhancement over creation)
   - Write skills to `~/.claude/skills/<skill-name>/`

## Configuration

Environment variables to customize behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_MANAGER_TRUNCATE_LINES` | `30` | Lines to keep at start/end of large tool results (reduces tokens) |
| `SKILL_MANAGER_MIN_LINES` | `10` | Skip transcripts with fewer than N lines (filters warmup sessions) |
| `SKILL_MANAGER_SAVE_OUTPUT` | `0` | Set to `1` to save Claude output to individual files in `outputs/` |
| `SKILL_MANAGER_RETIREMENT_SESSIONS` | `100` | Sessions without use before skill is retired to `.retired/` |
| `SKILL_MANAGER_TRACK_USAGE` | `1` | Set to `0` to disable usage tracking and retirement |

## Testing Changes

### Local Testing

```bash
# Run unit tests
npm test

# Manual extraction on a specific transcript (interactive mode)
node scripts/trigger.js /path/to/transcript.jsonl

# Simulate the SessionEnd hook locally (pipe JSON to stdin)
# This mimics exactly what Claude Code does when a session ends
echo '{"transcript_path": "~/.claude/projects/your-project/session-id.jsonl", "session_id": "abc123", "reason": "exit"}' | node scripts/trigger.js

# Find a recent transcript to test with
ls -lt ~/.claude/projects/*//*.jsonl | head -5

# Full local test with a real transcript
TRANSCRIPT=$(ls -t ~/.claude/projects/*/*.jsonl 2>/dev/null | head -1)
echo "{\"transcript_path\": \"$TRANSCRIPT\"}" | node scripts/trigger.js
```

### Debugging

```bash
# Enable output capture to see what Claude produces
export SKILL_MANAGER_SAVE_OUTPUT=1

# Watch today's audit log in real-time
tail -f ~/.claude/skill-manager/skill-manager-$(date +%Y-%m-%d).log

# View saved output files (when SAVE_OUTPUT=1)
ls -la ~/.claude/skill-manager/outputs/

# Or use the slash command directly in Claude Code
/skill-manager /path/to/transcript.jsonl
```

## Local Development Install

```bash
/plugin marketplace add ./path/to/claude-skill-manager
/plugin install skill-manager@skill-manager-marketplace
```

## Key Files

- **`commands/skill-manager.md`**: The prompt that drives skill extraction. Contains all the logic for identifying patterns, rating importance, and writing skill files.
- **`scripts/trigger.js`**: Hook handler. Must exit quickly (spawns detached child process for background work).
- **`scripts/usage-tracker.js`**: Tracks skill usage in transcripts and retires skills unused for 100+ sessions.
- **`templates/skill/`**: Reference templates. Skills must follow this structure with frontmatter, failed attempts table, version history.

## Skill Structure

Generated skills are directories with three files:
- `SKILL.md` - Core instructions, failed attempts table, version history
- `examples.md` - Real examples from sessions (grows over time)
- `troubleshooting.md` - Error → solution mappings

## Dependencies

- Node.js 18+ (handles JSON parsing and cross-platform execution)
- Claude Code CLI (`claude` command in PATH)
