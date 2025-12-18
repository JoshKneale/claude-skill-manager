# Claude Skill Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](.claude-plugin/plugin.json)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)]()

A Claude Code plugin that automatically extracts reusable skills from your conversations. The longer you use Claude Code, the better it gets at helping you.

> **Note**: This project is in early alpha. The core functionality works, but expect rough edges and breaking changes.

## Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [What Gets Extracted](#what-gets-extracted)
- [Why Failures Matter Most](#why-failures-matter-most)
- [Example Output](#example-output)
- [How Skills Improve Over Time](#how-skills-improve-over-time)
- [Skill Discovery](#skill-discovery)
- [Skill Quality](#skill-quality)
- [Configuration](#configuration)
- [Requirements & Platform Support](#requirements--platform-support)
- [Manual Usage](#manual-usage)
- [Uninstalling](#uninstalling)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Issues & Support](#issues--support)

## Quick Start

### From GitHub

```bash
# Add this repo as a marketplace
/plugin marketplace add joshkneale/claude-skill-manager

# Install the plugin
/plugin install skill-manager@skill-manager-marketplace
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/joshkneale/claude-skill-manager.git

# Add local directory as marketplace
/plugin marketplace add ./path/to/claude-skill-manager

# Install the plugin
/plugin install skill-manager@skill-manager-marketplace
```

## How It Works

1. **SessionEnd Hook**: When you end a Claude Code session, the plugin triggers
2. **Transcript Analysis**: Claude reads your conversation transcript
3. **Skill Extraction**: Identifies failures, corrections, and successful patterns
4. **Smart Merging**: Enhances existing skills or creates new ones
5. **Skill Writing**: Creates structured skills in `.claude/skills/`

## What Gets Extracted

Skills capture **what worked, what failed, and why**. Failures are often more valuable than successes.

### High-Value Patterns
- **Failed Attempts**: "I tried X and it broke because Y" - saves hours by documenting dead ends
- **User Corrections**: When you correct Claude's approach (these become "Common Mistakes")
- **Error Solutions**: Exact error messages and how they were resolved
- **Working Configurations**: Specific commands, flags, and parameters that work

### Skill Structure

Each skill is a directory with multiple files that grow over time:

```
.claude/skills/<skill-name>/
├── SKILL.md           # Core instructions, failed attempts, version history
├── examples.md        # Real examples from sessions (grows over time)
└── troubleshooting.md # Error → solution mappings (grows over time)
```

This structure allows skills to **improve incrementally** - new sessions add examples and failure cases without rewriting the whole skill.

## Why Failures Matter Most

From [Sionic AI's research](https://huggingface.co/blog/sionic-ai/claude-code-skills-training):

> "We noticed the Failed Attempts section became the most-referenced part of any skill. 'I tried X and it broke because Y' is more valuable than success stories."

Each skill includes a **Failed Attempts table**:

| What I Tried             | Why It Failed                | Lesson Learned        |
| ------------------------ | ---------------------------- | --------------------- |
| Running without `--flag` | 404 error on `/api/endpoint` | `--flag` is mandatory |

## Example Output

After a session where you debugged rate limit errors, the plugin might create:

```
.claude/skills/openai-rate-limits/
├── SKILL.md
├── examples.md
└── troubleshooting.md
```

**SKILL.md** (excerpt):
```markdown
---
name: openai-rate-limits
description: |
  Handle OpenAI API rate limit errors in Python applications.
  Use when: encountering 429 errors, RateLimitError exceptions,
  or "exceeded quota" messages.
---

## Failed Attempts

| What I Tried | Why It Failed | Lesson Learned |
|--------------|---------------|----------------|
| Simple retry loop | Still hit rate limits | Need exponential backoff |
| Catching generic Exception | Missed rate limit specifics | Catch `openai.RateLimitError` |

## Common Mistakes
- Don't retry immediately - always use backoff
- Don't ignore the `retry-after` header
```

**troubleshooting.md** (excerpt):
```markdown
## Error: RateLimitError: You exceeded your current quota

**Symptom:** API calls fail with 429 status
**Cause:** Too many requests in short period
**Solution:** Implement exponential backoff with `tenacity` library
```

## How Skills Improve Over Time

1. **First session**: Creates skill with initial example and any failures encountered
2. **Later sessions**: Adds new examples, failure cases, and troubleshooting entries
3. **Version tracking**: Each update bumps the version and notes what was added
4. **Team collaboration**: Skills in `.claude/skills/` can be committed to git

Example version history in a skill:
```markdown
## Version History
- v1.2.0 (2025-12-20): Added edge case for timeout errors from session xyz789
- v1.1.0 (2025-12-18): New failure case: missing env var, from session def456
- v1.0.0 (2025-12-16): Initial extraction from session abc123
```

## Skill Discovery

Skills are written with specific, discoverable descriptions:

**Bad** (too vague):
```yaml
description: Helps with API errors
```

**Good** (discoverable):
```yaml
description: |
  Resolve OpenAI API rate limit errors in Python.
  Use when: encountering 429 errors, "RateLimitError" in logs.
  Example triggers: "getting rate limited", "API quota exceeded".
```

## Skill Quality

The plugin only extracts skills rated "medium" or higher:

| Rating       | Criteria                                                      |
| ------------ | ------------------------------------------------------------- |
| **critical** | Prevents significant errors. Has clear "don't do X" guidance. |
| **high**     | Improves efficiency. Has specific error messages or configs.  |
| **medium**   | Useful pattern. Has concrete examples.                        |
| **low**      | Skipped - too minor to be worth the noise                     |

Maximum 3 skills per session to maintain quality over quantity.

## Configuration

Skills are written to `.claude/skills/` (project-level). This means:
- Skills stay with your project
- Can be version-controlled with git
- Team members benefit from extracted skills
- Skills grow richer as more sessions contribute

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_MANAGER_COUNT` | `1` | Number of transcripts to analyze per session |
| `SKILL_MANAGER_LOOKBACK_DAYS` | `7` | Only consider transcripts modified within N days |
| `SKILL_MANAGER_SAVE_OUTPUT` | `0` | Set to `1` to save Claude output to individual files |
| `SKILL_MANAGER_TRUNCATE_LINES` | `30` | Lines to keep at start/end of large tool results |

### System Behavior

- **Hook timeout**: 180 seconds maximum for the trigger script
- **Log retention**: Log files older than 7 days are automatically deleted
- **Concurrency**: Only one skill extraction runs at a time (lock file prevents overlap)

## Requirements & Platform Support

**Requirements:**
- Claude Code CLI
- Node.js 18+ (handles all cross-platform execution and JSON parsing)

| Platform | Status |
|----------|--------|
| macOS | Supported |
| Linux | Supported |
| Windows | Supported |

No additional platform-specific dependencies required. The trigger script is written in pure Node.js for consistent cross-platform behavior.

## Manual Usage

Run skill extraction manually on any transcript:

```
/skill-manager /path/to/transcript.jsonl
```

## Uninstalling

### Remove the Plugin

```bash
/plugin uninstall skill-manager@skill-manager-marketplace
```

This removes the plugin and its hooks. Your extracted skills in `.claude/skills/` are **not** deleted.

### Optional: Clean Up State Files

The plugin stores state (list of analyzed transcripts) and logs at:

**macOS/Linux:**
```bash
rm -rf ~/.claude/skill-manager
```

**Windows:**
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\skill-manager"
```

### What Gets Removed

| Item | Location | Removed by uninstall? |
|------|----------|----------------------|
| Plugin files | `~/.claude/plugins/installed/skill-manager@...` | Yes |
| State file | `~/.claude/skill-manager/analyzed.json` | No (manual cleanup) |
| Log files | `~/.claude/skill-manager/skill-manager-*.log` | No (manual cleanup) |
| Extracted skills | `.claude/skills/` (in your projects) | No (your data) |

## Development

### Running Tests

The project includes unit tests for the trigger script:

```bash
# Install dependencies
npm install

# Run all tests
npm test
```

See [Manual Usage](#manual-usage) for running skill extraction on specific transcripts, and [Debug mode](#debug-mode) for verbose output.

## Troubleshooting

### Plugin doesn't trigger after sessions

**macOS/Linux:**
1. Check the log file: `tail ~/.claude/skill-manager/skill-manager-$(date +%Y-%m-%d).log`
2. Check Node.js is in PATH: `node --version` (requires 18+)
3. Check Claude CLI is in PATH: `which claude`

**Windows:**
1. Check the log file: `Get-Content "$env:USERPROFILE\.claude\skill-manager\skill-manager-$(Get-Date -Format 'yyyy-MM-dd').log"`
2. Check Node.js is in PATH: `node --version` (requires 18+)
3. Check Claude CLI is in PATH: `Get-Command claude`

### No skills extracted from session

This is normal if:
- The session was purely informational (Q&A)
- Patterns were too project-specific to generalize
- No failures or corrections occurred
- Topics are already covered by existing skills

The plugin prioritizes quality over quantity - not every session produces skills.

### Skills not being discovered

Ensure your skill descriptions are specific. Vague descriptions like "Helps with API errors" won't be discovered. Include:
- Specific error messages
- Trigger phrases ("getting rate limited")
- Use cases ("Use when: encountering 429 errors")

### Viewing logs

Logs are written to daily files at `~/.claude/skill-manager/skill-manager-YYYY-MM-DD.log`. Logs older than 7 days are automatically cleaned up.

To watch today's logs in real-time:
```bash
tail -f ~/.claude/skill-manager/skill-manager-$(date +%Y-%m-%d).log
```

Skill extraction runs in the background so your session exits immediately. Check the log file to see results or troubleshoot issues.

### Saving output for debugging

By default, Claude's output is discarded. To save full output to individual files for debugging or comparing prompt iterations:

```bash
export SKILL_MANAGER_SAVE_OUTPUT=1
```

Output files are saved to `~/.claude/skill-manager/outputs/` with the format `YYYY-MM-DD-HH-MM-SS-<transcript-id>.log`. This is useful when:
- Troubleshooting why skill extraction isn't producing expected results
- Comparing results across iterations of the skill-manager prompt
- Debugging specific transcript analyses

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Issues & Support

- **Bug reports**: [Open an issue](https://github.com/joshkneale/claude-skill-manager/issues)
- **Feature requests**: [Open an issue](https://github.com/joshkneale/claude-skill-manager/issues) with the `enhancement` label
- **Questions**: [Start a discussion](https://github.com/joshkneale/claude-skill-manager/discussions)

## License

MIT
