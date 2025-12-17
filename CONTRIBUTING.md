# Contributing to Claude Skill Manager

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Ways to Contribute

- **Bug reports**: Open an issue describing the bug, steps to reproduce, and expected behavior
- **Feature requests**: Open an issue describing the feature and why it would be useful
- **Code contributions**: Submit a pull request with your changes
- **Documentation**: Improve README, add examples, fix typos

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/joshkneale/claude-skill-manager.git
   cd claude-skill-manager
   ```

2. Install dependencies:
   ```bash
   # Ensure jq is installed
   brew install jq  # macOS
   ```

3. Add as a local marketplace for testing:
   ```
   /plugin marketplace add ./claude-skill-manager
   /plugin install skill-manager@skill-manager-marketplace
   ```

## Testing Changes

1. Make your changes to the relevant files
2. Start a Claude Code session with some extractable patterns (failures, corrections, etc.)
3. End the session and verify the hook triggers
4. Check that skills are created/updated correctly in `.claude/skills/`

Enable debug mode for verbose output:
```bash
export SKILL_MANAGER_DEBUG=1
```

## Pull Request Guidelines

1. **Keep changes focused**: One feature or fix per PR
2. **Test your changes**: Verify the plugin works end-to-end
3. **Update documentation**: If your change affects usage, update the README
4. **Write clear commit messages**: Describe what and why, not just how

## Code Style

- **Bash scripts**: Use `set -e`, quote variables, add comments for non-obvious logic
- **Markdown**: Use consistent heading levels, include code examples where helpful
- **JSON**: Use 2-space indentation

## Questions?

Open an issue if you have questions or need help getting started.
