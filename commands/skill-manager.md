---
description: Extract reusable skills from a conversation transcript
allowed-tools: Read, Write, Glob, Grep
argument-hint: [transcript_path]
---

# Skill Manager

You are analyzing a Claude Code conversation transcript to extract reusable skills that can help in future sessions. Skills should capture **what worked, what failed, and why** - failures are often more valuable than successes.

## Input

Transcript path: $ARGUMENTS

## Step 1: Read the Transcript

Read the JSONL file at the provided path. Each line is a JSON object representing a message in the conversation. Extract the session ID from the transcript path (usually in the filename).

Focus on identifying:
- **Successful approaches**: What worked and the exact steps taken
- **Failed attempts**: What was tried and why it didn't work (MOST VALUABLE)
- **User corrections**: "No, don't do X, instead do Y" - these become "Common Mistakes"
- **Error messages**: Exact errors encountered and how they were resolved
- **Specific configurations**: Exact commands, flags, parameters that worked
- **Environment context**: Versions, tools, platforms mentioned

## Step 2: Identify Extractable Skills

Look for patterns that would help future sessions. Prioritize:

### High-Value Patterns (Extract These)
- **Debugging workflows**: Error → diagnosis → solution chains
- **Configuration discoveries**: "Use flag X because Y doesn't work"
- **Tool combinations**: Effective multi-step approaches
- **Corrections from user**: Things Claude got wrong initially
- **Workarounds**: Non-obvious solutions to limitations

### Skip These
- General knowledge Claude already knows
- Project-specific details that won't generalize
- Trivial operations (basic file reads, simple edits)
- Conversations that were purely informational

## Step 3: Rate Skill Importance

For each potential skill:

- **critical**: Prevents significant errors or saves hours of work. Has clear "don't do X" guidance.
- **high**: Notably improves quality or efficiency. Has specific error messages or configs.
- **medium**: Useful pattern worth remembering. Has concrete examples.
- **low**: Minor optimization (skip these)

Only extract skills rated "medium" or higher. Maximum 3 skills per session.

## Step 4: Check for Existing Skills

Before creating a skill:

1. Use Glob to find existing skills: `~/.claude/skills/*/SKILL.md`
2. Read each existing skill's name and description
3. Determine:
   - **Exact match**: Same skill exists → ENHANCE it (add examples, failures, troubleshooting)
   - **Related**: Similar topic → Consider if this is a new skill or enhancement
   - **New**: Nothing similar → Create new skill

**Enhancement is preferred over creation.** Growing existing skills with new examples and failure cases makes them more valuable.

## Step 5: Write or Enhance Skills

### New Skill Structure

Create directory `~/.claude/skills/<skill-name>/` with three files. Use the templates in this plugin as your guide:

| File | Template | Purpose |
|------|----------|---------|
| `SKILL.md` | `templates/skill/SKILL.md` | Core instructions, failed attempts, version history |
| `examples.md` | `templates/skill/examples.md` | Real examples from sessions (grows over time) |
| `troubleshooting.md` | `templates/skill/troubleshooting.md` | Error → solution mappings (create if errors encountered) |

Read the template files to understand the expected structure. Key sections:

**SKILL.md must include:**
- Frontmatter with `name` and specific `description` (with trigger phrases)
- Verified date (`verified`) and source session (`source`)
- Version number (`version: 1.0.0`)
- Usage tracking fields: `created: YYYY-MM-DD`, `last_used: null`, `usage_count: 0`
- When to Use (specific scenarios)
- Instructions (concrete, not vague)
- Failed Attempts table (most valuable section)
- Common Mistakes (from user corrections)
- Version History

**examples.md entries must include:**
- Source session and date
- Context (what user was trying to do)
- Problem, Solution, Why This Works

**troubleshooting.md entries must include:**
- Exact error message
- Symptom, Cause, Solution
- Source session

### Enhancing Existing Skills

When enhancing an existing skill:

1. **Add to examples.md**: Append new example with session attribution
2. **Add to Failed Attempts table**: If new failure modes discovered
3. **Add to troubleshooting.md**: If new errors and solutions found
4. **Update Version History**: Bump version and note what was added
5. **Refine description**: If new trigger phrases discovered, add them

Version bumping:
- New examples only → patch (1.0.0 → 1.0.1)
- New failure cases or troubleshooting → minor (1.0.0 → 1.1.0)
- Significant instruction changes → minor (1.0.0 → 1.1.0)

## Step 6: Write Effective Descriptions

The description is critical for skill discovery. It must be specific, not vague.

**Bad** (too vague):
```
description: Helps with API errors
```

**Good** (specific, discoverable):
```
description: |
  Resolve OpenAI API rate limit and timeout errors in Python applications.
  Use when: encountering 429 rate limit errors, API timeout exceptions,
  or "RateLimitError" in error logs.
  Example triggers: "getting rate limited", "API keeps timing out",
  "RateLimitError: You exceeded your current quota".
```

Requirements:
- First sentence: What the skill does
- "Use when:" with specific scenarios
- Include exact error messages if applicable
- Include phrases a user might actually say
- Maximum 1024 characters

## Constraints

- Extract maximum 3 skills per session (focus on quality)
- Skills must be generalizable (not specific to one codebase/project)
- Skills must include at least one of: failed attempts, troubleshooting, or concrete examples
- Always include session attribution for traceability
- Prefer enhancing existing skills over creating new ones
- Write to user-level skills directory: `~/.claude/skills/`
- If no skills worth extracting, that's fine - explain why

## Output Summary

After processing, provide:

### Transcript Metadata
- **Session ID**: [extracted from `sessionId` field]
- **Project**: [extracted from transcript path, e.g., `-Users-josh-myproject` → `myproject`]
- **Session Date**: [extracted from first message `timestamp`]

### Skills Created
For each new skill:
- Path: `.claude/skills/<name>/`
- Description: [Brief description]
- Key value: [Why this skill is useful - what problem it prevents]

### Skills Enhanced
For each enhanced skill:
- Path: `.claude/skills/<name>/`
- What was added: [New examples, failures, troubleshooting]
- Version: [Old] → [New]

### Skills Skipped
For each potential skill not extracted:
- Topic: [What it was about]
- Reason: [duplicate, too minor, not generalizable, too project-specific]

### No Skills Found
If no skills extracted, explain:
- Conversation was purely informational
- Patterns were too project-specific
- No failures or corrections to learn from
- Topics already well-covered by existing skills
