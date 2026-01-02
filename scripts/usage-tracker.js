#!/usr/bin/env node
// Usage tracking and retirement for Claude Code skills

import fs from 'node:fs';
import path from 'node:path';
import { findSimilarSkillsStrict } from './similarity.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get the skills directory path
 * @returns {string} - Path to ~/.claude/skills/
 */
export function getSkillsDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    throw new Error('Neither HOME nor USERPROFILE environment variable is set');
  }
  return path.join(homeDir, '.claude', 'skills');
}

/**
 * Get the retired skills directory path
 * @returns {string} - Path to ~/.claude/skills/.retired/
 */
export function getRetiredDir() {
  return path.join(getSkillsDir(), '.retired');
}

// =============================================================================
// Frontmatter Parsing
// =============================================================================

/**
 * Parse YAML frontmatter from a markdown file
 * Simple parser for the frontmatter format we use (no external dependencies)
 * @param {string} content - File content
 * @returns {{ frontmatter: Object, body: string } | null} - Parsed frontmatter and body, or null if no frontmatter
 */
export function parseFrontmatter(content) {
  // Check for frontmatter delimiter
  if (!content.startsWith('---')) {
    return null;
  }

  // Find closing delimiter
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return null;
  }

  const frontmatterStr = content.slice(4, endIndex);
  const body = content.slice(endIndex + 4);

  // Parse simple YAML key-value pairs
  const frontmatter = {};
  let currentKey = null;
  let currentValue = '';
  let inMultiline = false;

  for (const line of frontmatterStr.split('\n')) {
    // Check for multiline continuation (indented line)
    if (inMultiline && (line.startsWith('  ') || line.startsWith('\t'))) {
      currentValue += '\n' + line.trim();
      continue;
    }

    // Save previous multiline value
    if (inMultiline && currentKey) {
      frontmatter[currentKey] = currentValue.trim();
      inMultiline = false;
      currentKey = null;
      currentValue = '';
    }

    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    // Parse key: value
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Check for multiline indicator
    if (value === '|' || value === '>') {
      currentKey = key;
      currentValue = '';
      inMultiline = true;
      continue;
    }

    // Handle null
    if (value === 'null' || value === '~') {
      frontmatter[key] = null;
      continue;
    }

    // Handle numbers
    if (/^-?\d+$/.test(value)) {
      frontmatter[key] = parseInt(value, 10);
      continue;
    }

    // Handle booleans
    if (value === 'true') {
      frontmatter[key] = true;
      continue;
    }
    if (value === 'false') {
      frontmatter[key] = false;
      continue;
    }

    // Handle quoted strings
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  // Save final multiline value
  if (inMultiline && currentKey) {
    frontmatter[currentKey] = currentValue.trim();
  }

  return { frontmatter, body };
}

/**
 * Serialize frontmatter object to YAML string
 * @param {Object} frontmatter - Frontmatter object
 * @returns {string} - YAML frontmatter string (without delimiters)
 */
export function serializeFrontmatter(frontmatter) {
  const lines = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null) {
      lines.push(`${key}: null`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'string') {
      // Use multiline for strings with newlines
      if (value.includes('\n')) {
        lines.push(`${key}: |`);
        for (const line of value.split('\n')) {
          lines.push(`  ${line}`);
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Update frontmatter in a markdown file
 * @param {string} filePath - Path to the markdown file
 * @param {Object} updates - Key-value pairs to update
 */
export function updateSkillFrontmatter(filePath, updates) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(content);

  if (!parsed) {
    // No frontmatter, can't update
    return;
  }

  // Merge updates
  const newFrontmatter = { ...parsed.frontmatter, ...updates };

  // Rebuild file
  const newContent = `---\n${serializeFrontmatter(newFrontmatter)}\n---${parsed.body}`;
  fs.writeFileSync(filePath, newContent);
}

// =============================================================================
// Skill Discovery
// =============================================================================

/**
 * Get all skills from the skills directory
 * @returns {Array<{ name: string, path: string, frontmatter: Object }>}
 */
export function getAllSkills() {
  const skillsDir = getSkillsDir();

  // Check if skills directory exists
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const skills = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip non-directories and hidden directories (like .retired)
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const skillDir = path.join(skillsDir, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');

    // Check if SKILL.md exists
    if (!fs.existsSync(skillFile)) {
      continue;
    }

    // Parse frontmatter
    const content = fs.readFileSync(skillFile, 'utf8');
    const parsed = parseFrontmatter(content);

    if (!parsed || !parsed.frontmatter.name) {
      // Skip skills without valid frontmatter or name
      continue;
    }

    skills.push({
      name: parsed.frontmatter.name,
      path: skillFile,
      dirPath: skillDir,
      frontmatter: parsed.frontmatter,
    });
  }

  return skills;
}

// =============================================================================
// Usage Tracking
// =============================================================================

/**
 * Generate search patterns for a skill name
 * Matches both hyphenated and space-separated forms
 * @param {string} skillName - The skill name (e.g., "explicit-reasoning-protocol")
 * @returns {RegExp} - Case-insensitive regex matching the skill name
 */
export function createSkillPattern(skillName) {
  // Escape special regex characters except hyphens
  const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Allow hyphens to match hyphens or spaces
  const pattern = escaped.replace(/-/g, '[-\\s]');
  return new RegExp(pattern, 'i');
}

/**
 * Track skill usage in a transcript
 * Updates usage_count and last_used for skills found in transcript.
 * Increments sessions_since_use for skills NOT found (for session-based retirement).
 * @param {string} transcriptPath - Path to the transcript file
 * @param {function} logFn - Logging function
 * @returns {{ skillsFound: string[], updated: number }}
 */
export function trackUsageInTranscript(transcriptPath, logFn) {
  const skills = getAllSkills();

  if (skills.length === 0) {
    return { skillsFound: [], updated: 0 };
  }

  // Read transcript
  let transcriptContent;
  try {
    transcriptContent = fs.readFileSync(transcriptPath, 'utf8');
  } catch (err) {
    logFn(`Warning: Could not read transcript for usage tracking: ${err.message}`);
    return { skillsFound: [], updated: 0 };
  }

  const skillsFound = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const skill of skills) {
    const pattern = createSkillPattern(skill.name);

    if (pattern.test(transcriptContent)) {
      skillsFound.push(skill.name);

      // Update frontmatter: reset sessions_since_use, increment usage_count
      const currentCount = skill.frontmatter.usage_count || 0;
      updateSkillFrontmatter(skill.path, {
        last_used: today,
        usage_count: currentCount + 1,
        sessions_since_use: 0,
      });
    } else {
      // Skill not used in this session - increment sessions_since_use
      const currentSessions = skill.frontmatter.sessions_since_use || 0;
      updateSkillFrontmatter(skill.path, {
        sessions_since_use: currentSessions + 1,
      });
    }
  }

  return { skillsFound, updated: skillsFound.length };
}

// =============================================================================
// Skill Consolidation
// =============================================================================

/**
 * Extract valuable content from a skill for consolidation
 * @param {string} skillDirPath - Path to the skill directory
 * @returns {Object} - Extracted content { failedAttempts, keyInsight, troubleshooting, examples }
 */
export function extractConsolidatableContent(skillDirPath) {
  const content = {
    failedAttempts: null,
    troubleshooting: null,
    examples: null,
    keyInsight: null,
  };

  // Read SKILL.md
  const skillPath = path.join(skillDirPath, 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    const skillContent = fs.readFileSync(skillPath, 'utf8');

    // Extract Failed Attempts section
    const failedMatch = skillContent.match(/## Failed Attempts\n\n([\s\S]*?)(?=\n##|$)/);
    if (failedMatch && failedMatch[1].trim()) {
      content.failedAttempts = failedMatch[1].trim();
    }

    // Extract first paragraph after "## Instructions" as key insight
    const instructMatch = skillContent.match(/## Instructions\n\n([\s\S]*?)(?=\n##|\n\n)/);
    if (instructMatch && instructMatch[1].trim()) {
      content.keyInsight = instructMatch[1].trim();
    }
  }

  // Read troubleshooting.md
  const troublePath = path.join(skillDirPath, 'troubleshooting.md');
  if (fs.existsSync(troublePath)) {
    content.troubleshooting = fs.readFileSync(troublePath, 'utf8');
  }

  // Read examples.md
  const examplesPath = path.join(skillDirPath, 'examples.md');
  if (fs.existsSync(examplesPath)) {
    content.examples = fs.readFileSync(examplesPath, 'utf8');
  }

  return content;
}

/**
 * Append consolidated content to a target skill
 * @param {string} targetSkillDir - Path to target skill directory
 * @param {string} sourceSkillName - Name of skill being consolidated
 * @param {Object} content - Content to append { failedAttempts, keyInsight, troubleshooting, examples }
 * @param {function} logFn - Logging function
 */
export function appendConsolidatedContent(targetSkillDir, sourceSkillName, content, logFn) {
  const today = new Date().toISOString().slice(0, 10);

  // Append to SKILL.md if there's content to add
  const skillPath = path.join(targetSkillDir, 'SKILL.md');
  if (fs.existsSync(skillPath) && (content.failedAttempts || content.keyInsight)) {
    let skillContent = fs.readFileSync(skillPath, 'utf8');

    // Build consolidation block
    let consolidationBlock = `
---

## Consolidated from \`${sourceSkillName}\` (${today})

`;
    if (content.keyInsight) {
      consolidationBlock += `### Key Insight\n${content.keyInsight}\n\n`;
    }
    if (content.failedAttempts) {
      consolidationBlock += `### Additional Failed Attempts\n${content.failedAttempts}\n`;
    }

    // Insert before ## Version History, or append at end
    if (skillContent.includes('## Version History')) {
      skillContent = skillContent.replace('## Version History', consolidationBlock + '\n## Version History');
    } else {
      skillContent += consolidationBlock;
    }

    fs.writeFileSync(skillPath, skillContent);
    logFn(`  Added consolidated content to SKILL.md`);
  }

  // Append to examples.md
  if (content.examples) {
    const examplesPath = path.join(targetSkillDir, 'examples.md');
    if (fs.existsSync(examplesPath)) {
      let examplesContent = fs.readFileSync(examplesPath, 'utf8');
      examplesContent += `\n\n<!-- Consolidated from ${sourceSkillName} on ${today} -->\n${content.examples}`;
      fs.writeFileSync(examplesPath, examplesContent);
      logFn(`  Added consolidated examples`);
    }
  }

  // Append to troubleshooting.md
  if (content.troubleshooting) {
    const troublePath = path.join(targetSkillDir, 'troubleshooting.md');
    if (fs.existsSync(troublePath)) {
      let troubleContent = fs.readFileSync(troublePath, 'utf8');
      troubleContent += `\n\n<!-- Consolidated from ${sourceSkillName} on ${today} -->\n${content.troubleshooting}`;
      fs.writeFileSync(troublePath, troubleContent);
      logFn(`  Added consolidated troubleshooting`);
    }
  }
}

/**
 * Attempt to consolidate a skill into a similar active skill before retirement
 * Uses strict matching (Prefix >= 3 AND Jaccard >= 0.30) to be conservative
 *
 * @param {Object} skill - Skill to potentially consolidate { name, dirPath, ... }
 * @param {Array} activeSkills - List of all active skills
 * @param {function} logFn - Logging function
 * @returns {string|null} - Name of skill consolidated into, or null if no match
 */
export function attemptConsolidation(skill, activeSkills, logFn) {
  // Get names of active skills (excluding the one being retired)
  const activeNames = activeSkills
    .filter(s => s.name !== skill.name)
    .map(s => s.name);

  // Find similar skills using strict algorithm
  const matches = findSimilarSkillsStrict(skill.name, activeNames);

  if (matches.length === 0) {
    return null;
  }

  // Use the best match
  const bestMatch = matches[0];
  const targetSkill = activeSkills.find(s => s.name === bestMatch.name);

  if (!targetSkill) {
    return null;
  }

  logFn(`Consolidating ${skill.name} into ${bestMatch.name} (Jaccard: ${bestMatch.jaccard.toFixed(2)}, Prefix: ${bestMatch.prefix})`);

  // Extract content from retiring skill
  const content = extractConsolidatableContent(skill.dirPath);

  // Append to target skill
  appendConsolidatedContent(targetSkill.dirPath, skill.name, content, logFn);

  return bestMatch.name;
}

// =============================================================================
// Skill Retirement
// =============================================================================

/**
 * Get the number of sessions since a skill was last used
 * @param {Object} frontmatter - Skill frontmatter
 * @returns {number} - Sessions since last use (0 if recently used or new)
 */
export function getSessionsSinceUse(frontmatter) {
  return frontmatter.sessions_since_use || 0;
}

/**
 * Retire skills that haven't been used in the specified number of sessions
 * Attempts to consolidate valuable content into similar active skills before retirement.
 *
 * @param {number} retirementSessions - Number of sessions without use before retirement
 * @param {function} logFn - Logging function
 * @returns {{ retired: string[], consolidated: Array<{from: string, into: string}> }}
 */
export function retireUnusedSkills(retirementSessions, logFn) {
  const skills = getAllSkills();
  const retired = [];
  const consolidated = [];
  const retiredDir = getRetiredDir();

  for (const skill of skills) {
    const sessionsSinceUse = getSessionsSinceUse(skill.frontmatter);

    if (sessionsSinceUse > retirementSessions) {
      // Attempt consolidation before retirement
      const consolidatedInto = attemptConsolidation(skill, skills, logFn);

      if (consolidatedInto) {
        consolidated.push({ from: skill.name, into: consolidatedInto });
      }

      // Ensure retired directory exists
      fs.mkdirSync(retiredDir, { recursive: true });

      // Determine target path (handle collisions)
      let targetName = path.basename(skill.dirPath);
      let targetPath = path.join(retiredDir, targetName);

      if (fs.existsSync(targetPath)) {
        // Add timestamp suffix for collision
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        targetName = `${targetName}-${timestamp}`;
        targetPath = path.join(retiredDir, targetName);
      }

      // Move skill directory
      try {
        fs.renameSync(skill.dirPath, targetPath);
        retired.push(skill.name);
        const consolidationNote = consolidatedInto ? ` [consolidated into ${consolidatedInto}]` : '';
        logFn(`Retired skill: ${skill.name} (unused for ${sessionsSinceUse} sessions)${consolidationNote}`);
      } catch (err) {
        logFn(`Warning: Failed to retire skill ${skill.name}: ${err.message}`);
      }
    }
  }

  return { retired, consolidated };
}
