# Claude Skill Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](.claude-plugin/plugin.json)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)]()

A Claude Code plugin that automatically extracts reusable skills from your conversations. The longer you use Claude Code, the better it gets at helping you.

> **Alpha**: Core functionality works, expect rough edges and breaking changes.

**Requirements:** Claude Code CLI, Node.js 18+

## Install

```bash
/plugin marketplace add joshkneale/claude-skill-manager
/plugin install skill-manager@skill-manager-marketplace
```

## How It Works

When a Claude Code session ends, the plugin:

1. Reads your conversation transcript
2. Identifies failures, corrections, and successful patterns
3. Enhances existing skills or creates new ones in `~/.claude/skills/`

Skills capture **what worked, what failed, and why**. Failures are often more valuable than successes.


## Configuration

| Variable                       | Default | Description                                      |
| ------------------------------ | ------- | ------------------------------------------------ |
| `SKILL_MANAGER_MIN_LINES`      | `10`    | Skip transcripts with fewer than N lines         |
| `SKILL_MANAGER_SAVE_OUTPUT`    | `0`     | Set to `1` to save Claude output for debugging   |
| `SKILL_MANAGER_TRUNCATE_LINES` | `30`    | Lines to keep at start/end of large tool results |

## Manual Usage

Run skill extraction on any transcript:

```
/skill-manager /path/to/transcript.jsonl
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/joshkneale/claude-skill-manager.git

# Run tests
npm test

# Add local directory as marketplace
/plugin marketplace add ./path/to/claude-skill-manager

# Install the plugin
/plugin install skill-manager@skill-manager-marketplace

# Test with a transcript (note: env var must be on the node command, not echo)
echo '{"transcript_path": "/path/to/transcript.jsonl"}' | SKILL_MANAGER_SAVE_OUTPUT=1 node scripts/trigger.js
```


## Troubleshooting

**Plugin doesn't trigger?**
Check the log file:
```bash
tail ~/.claude/skill-manager/skill-manager-$(date +%Y-%m-%d).log
```

**No skills extracted?**
This is normal if the session was purely Q&A, had no failures, or patterns were too project-specific. The plugin prioritizes quality over quantity.

**Want to debug output?**
```bash
export SKILL_MANAGER_SAVE_OUTPUT=1
# Output saved to ~/.claude/skill-manager/outputs/
```

## Uninstalling

```bash
/plugin uninstall skill-manager@skill-manager-marketplace
rm -rf ~/.claude/skill-manager  # Optional: remove logs/state
```

Your extracted skills in `~/.claude/skills/` are preserved.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT — [Issues](https://github.com/joshkneale/claude-skill-manager/issues) · [Discussions](https://github.com/joshkneale/claude-skill-manager/discussions)
