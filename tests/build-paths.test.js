/**
 * Tests for buildPaths function
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { buildPaths } from '../scripts/trigger.js';

describe('buildPaths', () => {
  const homeDir = process.env.HOME || process.env.USERPROFILE;

  it('should construct STATE_DIR as $HOME/.claude/skill-manager', () => {
    const paths = buildPaths();
    assert.strictEqual(paths.STATE_DIR, `${homeDir}/.claude/skill-manager`);
  });

  it('should construct STATE_FILE as $STATE_DIR/analyzed.json', () => {
    const paths = buildPaths();
    assert.strictEqual(paths.STATE_FILE, `${homeDir}/.claude/skill-manager/analyzed.json`);
  });

  it('should construct LOG_FILE with current date YYYY-MM-DD', () => {
    const paths = buildPaths();
    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10);
    assert.strictEqual(paths.LOG_FILE, `${homeDir}/.claude/skill-manager/skill-manager-${today}.log`);
  });

  it('should construct PROJECTS_DIR as $HOME/.claude/projects', () => {
    const paths = buildPaths();
    assert.strictEqual(paths.PROJECTS_DIR, `${homeDir}/.claude/projects`);
  });
});
