#!/usr/bin/env node
// Usage tracking and retirement for Claude Code skills

import fs from 'node:fs';
import path from 'node:path';

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
 * @param {number} retirementSessions - Number of sessions without use before retirement
 * @param {function} logFn - Logging function
 * @returns {{ retired: string[] }}
 */
export function retireUnusedSkills(retirementSessions, logFn) {
  const skills = getAllSkills();
  const retired = [];
  const retiredDir = getRetiredDir();

  for (const skill of skills) {
    const sessionsSinceUse = getSessionsSinceUse(skill.frontmatter);

    if (sessionsSinceUse > retirementSessions) {
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
        logFn(`Retired skill: ${skill.name} (unused for ${sessionsSinceUse} sessions)`);
      } catch (err) {
        logFn(`Warning: Failed to retire skill ${skill.name}: ${err.message}`);
      }
    }
  }

  return { retired };
}
