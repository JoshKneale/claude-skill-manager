/**
 * Tests for ensureDirectories function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ensureDirectories } from '../scripts/trigger.js';

describe('ensureDirectories', () => {
  let tempDir;
  let originalHome;

  beforeEach(() => {
    // Create a temp directory to use as fake HOME
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensureDirectories-test-'));
    // Store original HOME
    originalHome = process.env.HOME;
    // Override HOME to our temp dir
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    // Restore original HOME
    process.env.HOME = originalHome;
    // Clean up temp directory recursively
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create state directory if not exists', () => {
    const stateDir = path.join(tempDir, '.claude', 'skill-manager');

    // Verify directory doesn't exist yet
    assert.strictEqual(fs.existsSync(stateDir), false);

    // Call ensureDirectories
    ensureDirectories();

    // Verify directory now exists
    assert.strictEqual(fs.existsSync(stateDir), true);
    assert.strictEqual(fs.statSync(stateDir).isDirectory(), true);
  });

  it('should not throw if state directory already exists', () => {
    const stateDir = path.join(tempDir, '.claude', 'skill-manager');

    // Create directory beforehand
    fs.mkdirSync(stateDir, { recursive: true });
    assert.strictEqual(fs.existsSync(stateDir), true);

    // Should not throw when calling ensureDirectories
    assert.doesNotThrow(() => {
      ensureDirectories();
    });

    // Directory should still exist
    assert.strictEqual(fs.existsSync(stateDir), true);
  });

  it('should create nested directories recursively', () => {
    // Verify the parent .claude directory doesn't exist
    const claudeDir = path.join(tempDir, '.claude');
    const stateDir = path.join(claudeDir, 'skill-manager');

    assert.strictEqual(fs.existsSync(claudeDir), false);
    assert.strictEqual(fs.existsSync(stateDir), false);

    // Call ensureDirectories - should create both .claude and skill-manager
    ensureDirectories();

    // Verify both directories were created
    assert.strictEqual(fs.existsSync(claudeDir), true);
    assert.strictEqual(fs.existsSync(stateDir), true);
    assert.strictEqual(fs.statSync(claudeDir).isDirectory(), true);
    assert.strictEqual(fs.statSync(stateDir).isDirectory(), true);
  });
});
