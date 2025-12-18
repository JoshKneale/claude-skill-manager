/**
 * Tests for buildPaths and expandTilde functions
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { buildPaths, expandTilde } from '../scripts/trigger.js';

describe('buildPaths', () => {
  const homeDir = process.env.HOME || process.env.USERPROFILE;

  it('should construct STATE_DIR as $HOME/.claude/skill-manager', () => {
    const paths = buildPaths();
    assert.strictEqual(paths.STATE_DIR, `${homeDir}/.claude/skill-manager`);
  });

  it('should construct LOG_FILE with current date YYYY-MM-DD', () => {
    const paths = buildPaths();
    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10);
    assert.strictEqual(paths.LOG_FILE, `${homeDir}/.claude/skill-manager/skill-manager-${today}.log`);
  });

  it('should construct OUTPUTS_DIR as $STATE_DIR/outputs', () => {
    const paths = buildPaths();
    assert.strictEqual(paths.OUTPUTS_DIR, `${homeDir}/.claude/skill-manager/outputs`);
  });

  it('should not include STATE_FILE (removed in simplification)', () => {
    const paths = buildPaths();
    assert.strictEqual(paths.STATE_FILE, undefined);
  });

  it('should not include PROJECTS_DIR (removed in simplification)', () => {
    const paths = buildPaths();
    assert.strictEqual(paths.PROJECTS_DIR, undefined);
  });

  it('should throw error when HOME and USERPROFILE are both undefined', () => {
    // Save original values
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;

    try {
      // Clear both environment variables
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      assert.throws(
        () => buildPaths(),
        {
          message: 'Neither HOME nor USERPROFILE environment variable is set'
        }
      );
    } finally {
      // Restore original values
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      }
      if (originalUserProfile !== undefined) {
        process.env.USERPROFILE = originalUserProfile;
      }
    }
  });
});

describe('expandTilde', () => {
  const homeDir = process.env.HOME || process.env.USERPROFILE;

  it('should expand ~ at the start of a path', () => {
    const result = expandTilde('~/test/file.txt');
    assert.strictEqual(result, `${homeDir}/test/file.txt`);
  });

  it('should expand standalone ~', () => {
    const result = expandTilde('~');
    assert.strictEqual(result, homeDir);
  });

  it('should not expand ~ in the middle of a path', () => {
    const result = expandTilde('/path/to/~file.txt');
    assert.strictEqual(result, '/path/to/~file.txt');
  });

  it('should not expand ~username style paths', () => {
    const result = expandTilde('~otheruser/file.txt');
    assert.strictEqual(result, '~otheruser/file.txt');
  });

  it('should return absolute paths unchanged', () => {
    const result = expandTilde('/absolute/path/file.txt');
    assert.strictEqual(result, '/absolute/path/file.txt');
  });

  it('should return relative paths unchanged', () => {
    const result = expandTilde('./relative/path/file.txt');
    assert.strictEqual(result, './relative/path/file.txt');
  });

  it('should handle null input gracefully', () => {
    const result = expandTilde(null);
    assert.strictEqual(result, null);
  });

  it('should handle undefined input gracefully', () => {
    const result = expandTilde(undefined);
    assert.strictEqual(result, undefined);
  });

  it('should handle empty string', () => {
    const result = expandTilde('');
    assert.strictEqual(result, '');
  });

  it('should handle non-string input gracefully', () => {
    const result = expandTilde(123);
    assert.strictEqual(result, 123);
  });
});
