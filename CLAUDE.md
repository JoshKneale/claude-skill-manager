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
└── trigger.js           # Node.js script that hooks invoke (cross-platform, launches claude)

templates/skill/         # Templates for generated skill files
├── SKILL.md
├── examples.md
└── troubleshooting.md
```

## How It Works

1. **SessionEnd hook** triggers `scripts/trigger.js`
2. Script discovers recent transcripts from `~/.claude/projects/` (last 7 days)
3. Checks state file (`~/.claude/skill-manager/analyzed.json`) to find unanalyzed transcripts
4. Processes 1 unanalyzed transcript per session (configurable)
5. **Preprocesses transcript** to reduce token usage (removes metadata bloat, truncates large tool results)
6. Runs `claude --print "/skill-manager $preprocessed_path"` in background
7. The `/skill-manager` command prompt guides Claude to:
   - Read the JSONL transcript
   - Identify failures, corrections, error solutions
   - Check for existing skills to enhance (prefer enhancement over creation)
   - Write skills to `.claude/skills/<skill-name>/`
8. Updates state file to track analyzed transcripts (prevents re-analysis)

## Configuration

Environment variables to customize behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_MANAGER_COUNT` | `1` | Number of transcripts to analyze per SessionEnd |
| `SKILL_MANAGER_LOOKBACK_DAYS` | `7` | Only consider transcripts modified within N days |
| `SKILL_MANAGER_SAVE_OUTPUT` | `0` | Set to `1` to save Claude output to individual files in `outputs/` |
| `SKILL_MANAGER_TRUNCATE_LINES` | `30` | Lines to keep at start/end of large tool results (reduces tokens) |
| `SKILL_MANAGER_MIN_LINES` | `10` | Skip transcripts with fewer than N lines (filters warmup sessions) |
| `SKILL_MANAGER_SKIP_SUBAGENTS` | `1` | Skip sub-agent sessions (Task tool spawned). Set to `0` to include them |

## Testing Changes

```bash
# Enable output capture for debugging/prompt iteration
export SKILL_MANAGER_SAVE_OUTPUT=1

# Manual extraction on any transcript
/skill-manager /path/to/transcript.jsonl

# Watch today's audit log in real-time
tail -f ~/.claude/skill-manager/skill-manager-$(date +%Y-%m-%d).log

# View saved output files (when SAVE_OUTPUT=1)
ls -la ~/.claude/skill-manager/outputs/

# Check state file (analyzed transcripts)
cat ~/.claude/skill-manager/analyzed.json
```

## Local Development Install

```bash
/plugin marketplace add ./path/to/claude-skill-manager
/plugin install skill-manager@skill-manager-marketplace
```

## Key Files

- **`commands/skill-manager.md`**: The prompt that drives skill extraction. Contains all the logic for identifying patterns, rating importance, and writing skill files.
- **`scripts/trigger.js`**: Hook handler. Must exit quickly (spawns detached child process for background work).
- **`templates/skill/`**: Reference templates. Skills must follow this structure with frontmatter, failed attempts table, version history.

## Skill Structure

Generated skills are directories with three files:
- `SKILL.md` - Core instructions, failed attempts table, version history
- `examples.md` - Real examples from sessions (grows over time)
- `troubleshooting.md` - Error → solution mappings

## Dependencies

- Node.js 18+ (handles JSON parsing and cross-platform execution)
- Claude Code CLI (`claude` command in PATH)
