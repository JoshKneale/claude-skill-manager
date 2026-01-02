#!/usr/bin/env node
/**
 * Skill similarity detection
 *
 * Provides algorithms for detecting similar skills to:
 * - Prevent duplicate skill creation (Approach A: wide matching)
 * - Consolidate skills on retirement (Approach B: strict matching)
 */

import fs from 'node:fs';
import path from 'node:path';

// =============================================================================
// Similarity Algorithms
// =============================================================================

/**
 * Calculate Jaccard similarity between two skill names
 * Jaccard = |intersection| / |union|
 *
 * @param {string} name1 - First skill name
 * @param {string} name2 - Second skill name
 * @returns {number} - Similarity score between 0 and 1
 */
export function jaccardSimilarity(name1, name2) {
  const tokens1 = new Set(name1.split('-'));
  const tokens2 = new Set(name2.split('-'));

  const intersection = [...tokens1].filter(t => tokens2.has(t));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.length / union.size;
}

/**
 * Count matching prefix tokens between two skill names
 * Stops counting at the first non-matching token
 *
 * @param {string} name1 - First skill name
 * @param {string} name2 - Second skill name
 * @returns {number} - Number of matching prefix tokens
 */
export function prefixTokenCount(name1, name2) {
  const parts1 = name1.split('-');
  const parts2 = name2.split('-');

  let shared = 0;
  for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
    if (parts1[i] === parts2[i]) {
      shared++;
    } else {
      break;
    }
  }

  return shared;
}

/**
 * Find similar skills using wide matching algorithm (Hybrid 4)
 * Criteria: (Jaccard >= 0.40) OR (Jaccard >= 0.30 AND Prefix >= 3)
 *
 * Use for: Approach A (creation prevention) - cast wide net
 *
 * @param {string} proposedName - Name of skill being created
 * @param {string[]} existingNames - Names of existing skills
 * @returns {Array<{name: string, jaccard: number, prefix: number}>} - Matching skills sorted by Jaccard desc
 */
export function findSimilarSkillsWide(proposedName, existingNames) {
  const matches = [];

  for (const name of existingNames) {
    const jaccard = jaccardSimilarity(proposedName, name);
    const prefix = prefixTokenCount(proposedName, name);

    // Hybrid 4: Jaccard >= 0.40 OR (Jaccard >= 0.30 AND Prefix >= 3)
    if (jaccard >= 0.40 || (jaccard >= 0.30 && prefix >= 3)) {
      matches.push({ name, jaccard, prefix });
    }
  }

  return matches.sort((a, b) => b.jaccard - a.jaccard);
}

/**
 * Find similar skills using strict matching algorithm (Hybrid 2)
 * Criteria: Jaccard >= 0.30 AND Prefix >= 3
 *
 * Use for: Approach B (retirement consolidation) - be conservative
 *
 * @param {string} proposedName - Name of skill being retired/created
 * @param {string[]} existingNames - Names of existing skills
 * @returns {Array<{name: string, jaccard: number, prefix: number}>} - Matching skills sorted by Jaccard desc
 */
export function findSimilarSkillsStrict(proposedName, existingNames) {
  const matches = [];

  for (const name of existingNames) {
    const jaccard = jaccardSimilarity(proposedName, name);
    const prefix = prefixTokenCount(proposedName, name);

    // Hybrid 2: Jaccard >= 0.30 AND Prefix >= 3
    if (jaccard >= 0.30 && prefix >= 3) {
      matches.push({ name, jaccard, prefix });
    }
  }

  return matches.sort((a, b) => b.jaccard - a.jaccard);
}

// =============================================================================
// CLI Interface
// =============================================================================

/**
 * Get all skill names from the skills directory
 * @returns {string[]} - Array of skill directory names
 */
function getExistingSkillNames() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    return [];
  }

  const skillsDir = path.join(homeDir, '.claude', 'skills');

  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);
}

// CLI: node similarity.js <wide|strict> <proposed-skill-name>
const isMainModule = process.argv[1]?.endsWith('similarity.js');

if (isMainModule && process.argv.length >= 4) {
  const mode = process.argv[2];
  const proposedName = process.argv[3];

  if (!['wide', 'strict'].includes(mode)) {
    console.error('Usage: node similarity.js <wide|strict> <proposed-skill-name>');
    process.exit(1);
  }

  const existingNames = getExistingSkillNames();
  const finder = mode === 'strict' ? findSimilarSkillsStrict : findSimilarSkillsWide;
  const matches = finder(proposedName, existingNames);

  console.log(JSON.stringify({ proposedName, mode, matches }, null, 2));
}
