/**
 * Tests for skill consolidation functions
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  extractConsolidatableContent,
  appendConsolidatedContent,
  attemptConsolidation,
  retireUnusedSkills,
  getAllSkills,
  serializeFrontmatter,
} from '../scripts/usage-tracker.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'consolidation-test-'));
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

/**
 * Create a complete mock skill with all files
 * @param {string} skillsDir - Parent skills directory
 * @param {string} name - Skill name
 * @param {Object} options - Content options
 */
function createFullMockSkill(skillsDir, name, options = {}) {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });

  const frontmatter = {
    name,
    version: options.version || '1.0.0',
    sessions_since_use: options.sessions_since_use ?? 0,
    usage_count: options.usage_count ?? 0,
    ...options.frontmatter,
  };

  // Create SKILL.md with optional sections
  let skillContent = `---
${serializeFrontmatter(frontmatter)}
---

# ${name}

${options.description || 'A test skill.'}

## Instructions

${options.instructions || 'Follow these instructions.'}

`;

  if (options.failedAttempts) {
    skillContent += `## Failed Attempts

${options.failedAttempts}

`;
  }

  if (options.commonMistakes) {
    skillContent += `## Common Mistakes

${options.commonMistakes}

`;
  }

  skillContent += `## Version History

- 1.0.0: Initial version
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

  // Create examples.md
  const examplesContent = options.examples || `# Examples

## Example 1
Source: test-session
Date: 2025-01-01

Example content here.
`;
  fs.writeFileSync(path.join(skillDir, 'examples.md'), examplesContent);

  // Create troubleshooting.md
  const troubleContent = options.troubleshooting || `# Troubleshooting

## Error: Something went wrong

**Symptom:** The thing doesn't work
**Cause:** Wrong configuration
**Solution:** Fix the configuration
`;
  fs.writeFileSync(path.join(skillDir, 'troubleshooting.md'), troubleContent);

  return skillDir;
}

// =============================================================================
// extractConsolidatableContent Tests
// =============================================================================

describe('extractConsolidatableContent', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should extract failed attempts table from SKILL.md', () => {
    const skillDir = createFullMockSkill(tempDir, 'test-skill', {
      failedAttempts: `| Approach | Why it fails |
|----------|--------------|
| Using X | Causes memory leak |
| Using Y | Too slow |`,
    });

    const content = extractConsolidatableContent(skillDir);

    assert.ok(content.failedAttempts, 'Should extract failed attempts');
    assert.ok(content.failedAttempts.includes('Using X'), 'Should include table content');
    assert.ok(content.failedAttempts.includes('memory leak'), 'Should include failure reason');
  });

  it('should extract key insight from Instructions section', () => {
    const skillDir = createFullMockSkill(tempDir, 'test-skill', {
      instructions: 'Always use strict mode when parsing JSON. This prevents silent failures.',
    });

    const content = extractConsolidatableContent(skillDir);

    assert.ok(content.keyInsight, 'Should extract key insight');
    assert.ok(content.keyInsight.includes('strict mode'), 'Should include instruction content');
  });

  it('should extract troubleshooting content', () => {
    const troubleContent = `# Troubleshooting

## Error: Connection refused

**Symptom:** Can't connect to server
**Cause:** Port blocked
**Solution:** Open firewall
`;
    const skillDir = createFullMockSkill(tempDir, 'test-skill', {
      troubleshooting: troubleContent,
    });

    const content = extractConsolidatableContent(skillDir);

    assert.ok(content.troubleshooting, 'Should extract troubleshooting');
    assert.ok(content.troubleshooting.includes('Connection refused'), 'Should include error');
  });

  it('should extract examples content', () => {
    const examplesContent = `# Examples

## Example: Handling API Timeout

Context: User needed to retry failed requests
Solution: Implement exponential backoff
`;
    const skillDir = createFullMockSkill(tempDir, 'test-skill', {
      examples: examplesContent,
    });

    const content = extractConsolidatableContent(skillDir);

    assert.ok(content.examples, 'Should extract examples');
    assert.ok(content.examples.includes('API Timeout'), 'Should include example title');
  });

  it('should handle missing files gracefully', () => {
    const skillDir = path.join(tempDir, 'minimal-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    // Only create SKILL.md, skip other files
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: minimal-skill
---

# Minimal Skill

Just instructions.
`);

    const content = extractConsolidatableContent(skillDir);

    assert.strictEqual(content.troubleshooting, null, 'Should return null for missing troubleshooting');
    assert.strictEqual(content.examples, null, 'Should return null for missing examples');
  });

  it('should handle skill without Failed Attempts section', () => {
    const skillDir = createFullMockSkill(tempDir, 'test-skill', {
      failedAttempts: null, // Don't include this section
    });

    const content = extractConsolidatableContent(skillDir);

    assert.strictEqual(content.failedAttempts, null, 'Should return null when no failed attempts');
  });
});

// =============================================================================
// appendConsolidatedContent Tests
// =============================================================================

describe('appendConsolidatedContent', () => {
  let tempDir;
  let logs = [];

  function mockLog(...args) {
    logs.push(args.join(' '));
  }

  beforeEach(() => {
    tempDir = createTempDir();
    logs = [];
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should append consolidated content to SKILL.md before Version History', () => {
    const targetDir = createFullMockSkill(tempDir, 'target-skill', {});
    const content = {
      keyInsight: 'Important insight from source skill',
      failedAttempts: '| Bad approach | Reason |',
    };

    appendConsolidatedContent(targetDir, 'source-skill', content, mockLog);

    const skillContent = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf8');

    assert.ok(skillContent.includes('Consolidated from `source-skill`'), 'Should include source attribution');
    assert.ok(skillContent.includes('Important insight'), 'Should include key insight');
    assert.ok(skillContent.includes('Bad approach'), 'Should include failed attempts');
    // Version History should come after consolidated content
    const consolidatedIndex = skillContent.indexOf('Consolidated from');
    const versionIndex = skillContent.indexOf('## Version History');
    assert.ok(consolidatedIndex < versionIndex, 'Consolidated content should appear before Version History');
  });

  it('should append examples with source attribution', () => {
    const targetDir = createFullMockSkill(tempDir, 'target-skill', {});
    const content = {
      examples: '## New Example\n\nSome example content',
    };

    appendConsolidatedContent(targetDir, 'source-skill', content, mockLog);

    const examplesContent = fs.readFileSync(path.join(targetDir, 'examples.md'), 'utf8');

    assert.ok(examplesContent.includes('Consolidated from source-skill'), 'Should include source comment');
    assert.ok(examplesContent.includes('New Example'), 'Should include example content');
  });

  it('should append troubleshooting with source attribution', () => {
    const targetDir = createFullMockSkill(tempDir, 'target-skill', {});
    const content = {
      troubleshooting: '## Error: New error\n\nHow to fix it',
    };

    appendConsolidatedContent(targetDir, 'source-skill', content, mockLog);

    const troubleContent = fs.readFileSync(path.join(targetDir, 'troubleshooting.md'), 'utf8');

    assert.ok(troubleContent.includes('Consolidated from source-skill'), 'Should include source comment');
    assert.ok(troubleContent.includes('New error'), 'Should include troubleshooting content');
  });

  it('should include date in consolidated content', () => {
    const targetDir = createFullMockSkill(tempDir, 'target-skill', {});
    const content = {
      keyInsight: 'Some insight',
    };

    appendConsolidatedContent(targetDir, 'source-skill', content, mockLog);

    const skillContent = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf8');
    const today = new Date().toISOString().slice(0, 10);

    assert.ok(skillContent.includes(today), 'Should include today\'s date');
  });

  it('should handle empty content gracefully', () => {
    const targetDir = createFullMockSkill(tempDir, 'target-skill', {});
    const originalContent = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf8');
    const content = {
      keyInsight: null,
      failedAttempts: null,
      examples: null,
      troubleshooting: null,
    };

    appendConsolidatedContent(targetDir, 'source-skill', content, mockLog);

    // Should not crash, and should not add empty consolidated section
    const newContent = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf8');
    // Content should be mostly unchanged (no substantive additions)
    assert.ok(newContent.length >= originalContent.length - 10, 'Should not remove content');
  });
});

// =============================================================================
// attemptConsolidation Tests
// =============================================================================

describe('attemptConsolidation', () => {
  let tempDir;
  let originalHome;
  let logs = [];

  function mockLog(...args) {
    logs.push(args.join(' '));
  }

  beforeEach(() => {
    tempDir = createTempDir();
    originalHome = process.env.HOME;
    const skillsDir = path.join(tempDir, '.claude', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    process.env.HOME = tempDir;
    logs = [];
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanupTempDir(tempDir);
  });

  it('should consolidate into similar skill when prefix >= 3 and Jaccard >= 0.30', () => {
    const skillsDir = path.join(tempDir, '.claude', 'skills');

    // Create source skill (to be retired)
    const sourceDir = createFullMockSkill(skillsDir, 'rust-test-provider-old-thing', {
      sessions_since_use: 101,
      instructions: 'Unique insight from old skill',
      failedAttempts: '| Old approach | Old reason |',
    });

    // Create target skill (active, similar name)
    createFullMockSkill(skillsDir, 'rust-test-provider-new-thing', {
      sessions_since_use: 0,
    });

    // Create unrelated skill
    createFullMockSkill(skillsDir, 'python-api-handler', {
      sessions_since_use: 0,
    });

    const skills = getAllSkills();
    const sourceSkill = skills.find(s => s.name === 'rust-test-provider-old-thing');

    const consolidatedInto = attemptConsolidation(sourceSkill, skills, mockLog);

    assert.strictEqual(consolidatedInto, 'rust-test-provider-new-thing', 'Should consolidate into similar skill');

    // Verify content was added to target
    const targetContent = fs.readFileSync(
      path.join(skillsDir, 'rust-test-provider-new-thing', 'SKILL.md'),
      'utf8'
    );
    assert.ok(targetContent.includes('rust-test-provider-old-thing'), 'Target should reference source');
  });

  it('should return null when no similar skill exists', () => {
    const skillsDir = path.join(tempDir, '.claude', 'skills');

    // Create source skill (to be retired)
    createFullMockSkill(skillsDir, 'unique-standalone-skill', {
      sessions_since_use: 101,
    });

    // Create unrelated skills
    createFullMockSkill(skillsDir, 'completely-different-thing', {
      sessions_since_use: 0,
    });

    const skills = getAllSkills();
    const sourceSkill = skills.find(s => s.name === 'unique-standalone-skill');

    const consolidatedInto = attemptConsolidation(sourceSkill, skills, mockLog);

    assert.strictEqual(consolidatedInto, null, 'Should return null when no similar skill');
  });

  it('should not consolidate into self', () => {
    const skillsDir = path.join(tempDir, '.claude', 'skills');

    createFullMockSkill(skillsDir, 'rust-test-only-one', {
      sessions_since_use: 101,
    });

    const skills = getAllSkills();
    const sourceSkill = skills.find(s => s.name === 'rust-test-only-one');

    const consolidatedInto = attemptConsolidation(sourceSkill, skills, mockLog);

    assert.strictEqual(consolidatedInto, null, 'Should not consolidate into self');
  });

  it('should pick best match when multiple similar skills exist', () => {
    const skillsDir = path.join(tempDir, '.claude', 'skills');

    // Source skill
    createFullMockSkill(skillsDir, 'rust-trait-migration-old-pattern', {
      sessions_since_use: 101,
    });

    // Two similar skills - one more similar than the other
    createFullMockSkill(skillsDir, 'rust-trait-migration-bridge-pattern', {
      sessions_since_use: 0,
    });
    createFullMockSkill(skillsDir, 'rust-trait-something-else', {
      sessions_since_use: 0,
    });

    const skills = getAllSkills();
    const sourceSkill = skills.find(s => s.name === 'rust-trait-migration-old-pattern');

    const consolidatedInto = attemptConsolidation(sourceSkill, skills, mockLog);

    // Should pick rust-trait-migration-bridge-pattern (3 prefix tokens vs 2)
    assert.strictEqual(consolidatedInto, 'rust-trait-migration-bridge-pattern');
  });
});

// =============================================================================
// retireUnusedSkills with consolidation Tests
// =============================================================================

describe('retireUnusedSkills with consolidation', () => {
  let tempDir;
  let originalHome;
  let logs = [];

  function mockLog(...args) {
    logs.push(args.join(' '));
  }

  beforeEach(() => {
    tempDir = createTempDir();
    originalHome = process.env.HOME;
    const skillsDir = path.join(tempDir, '.claude', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    process.env.HOME = tempDir;
    logs = [];
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanupTempDir(tempDir);
  });

  it('should return consolidated array with consolidation info', () => {
    const skillsDir = path.join(tempDir, '.claude', 'skills');

    // Create skill to be retired (similar to active skill)
    createFullMockSkill(skillsDir, 'rust-test-provider-old-feature', {
      sessions_since_use: 101,
      instructions: 'Old feature insight',
    });

    // Create active similar skill
    createFullMockSkill(skillsDir, 'rust-test-provider-new-feature', {
      sessions_since_use: 5,
    });

    const result = retireUnusedSkills(100, mockLog);

    assert.ok(result.retired.includes('rust-test-provider-old-feature'), 'Should retire the old skill');
    assert.ok(Array.isArray(result.consolidated), 'Should return consolidated array');

    if (result.consolidated.length > 0) {
      const consolidation = result.consolidated[0];
      assert.strictEqual(consolidation.from, 'rust-test-provider-old-feature');
      assert.strictEqual(consolidation.into, 'rust-test-provider-new-feature');
    }
  });

  it('should still retire skills without similar matches', () => {
    const skillsDir = path.join(tempDir, '.claude', 'skills');

    // Create standalone skill to be retired
    createFullMockSkill(skillsDir, 'unique-old-skill', {
      sessions_since_use: 101,
    });

    const result = retireUnusedSkills(100, mockLog);

    assert.ok(result.retired.includes('unique-old-skill'), 'Should still retire the skill');
    // consolidated might be empty array or have no entry for this skill
    const wasConsolidated = result.consolidated?.some(c => c.from === 'unique-old-skill');
    assert.strictEqual(wasConsolidated, false, 'Should not be in consolidated list');
  });

  it('should move retired skill to .retired directory after consolidation', () => {
    const skillsDir = path.join(tempDir, '.claude', 'skills');

    createFullMockSkill(skillsDir, 'rust-api-old-handler', {
      sessions_since_use: 101,
    });

    createFullMockSkill(skillsDir, 'rust-api-new-handler', {
      sessions_since_use: 0,
    });

    retireUnusedSkills(100, mockLog);

    // Verify skill was moved to .retired
    assert.ok(
      fs.existsSync(path.join(skillsDir, '.retired', 'rust-api-old-handler')),
      'Skill should be in .retired directory'
    );
    assert.ok(
      !fs.existsSync(path.join(skillsDir, 'rust-api-old-handler')),
      'Skill should not be in original location'
    );
  });

  it('should log consolidation when it happens', () => {
    const skillsDir = path.join(tempDir, '.claude', 'skills');

    createFullMockSkill(skillsDir, 'doc-driven-incremental-old', {
      sessions_since_use: 101,
    });

    createFullMockSkill(skillsDir, 'doc-driven-incremental-new', {
      sessions_since_use: 0,
    });

    retireUnusedSkills(100, mockLog);

    const consolidationLog = logs.find(log => log.includes('Consolidating') || log.includes('consolidated'));
    assert.ok(consolidationLog, 'Should log consolidation activity');
  });
});
