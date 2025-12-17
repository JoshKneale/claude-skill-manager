---
name: {{SKILL_NAME}}
description: |
  {{WHAT_IT_DOES}}. {{WHEN_TO_USE}}.
  Use when: {{SPECIFIC_TRIGGERS}}.
  Example triggers: "{{USER_PHRASE_1}}", "{{USER_PHRASE_2}}".
---

# {{SKILL_DISPLAY_NAME}}

> **Verified**: {{DATE}} | **Source**: session {{SESSION_ID}}

## When to Use

{{SPECIFIC_SCENARIOS}}

Include exact error messages or conditions that should trigger this skill.

## Instructions

{{STEP_BY_STEP_GUIDANCE}}

Be concrete - include exact commands, flags, configurations. No vague advice.

## Failed Attempts

| What I Tried | Why It Failed | Lesson Learned |
|--------------|---------------|----------------|
| {{APPROACH}} | {{ERROR_OR_PROBLEM}} | {{WHAT_TO_DO_INSTEAD}} |

This is the most valuable section. Document dead ends so future sessions don't repeat them.

## Common Mistakes

Based on corrections during the session:

- **Don't**: {{WHAT_NOT_TO_DO}}
  **Instead**: {{WHAT_TO_DO}}
  **Why**: {{REASON}}

## See Also

- [Examples](examples.md) - Real examples demonstrating this skill
- [Troubleshooting](troubleshooting.md) - Error → solution mappings

## Version History

- v1.0.0 ({{DATE}}): Initial extraction from session {{SESSION_ID}}
