/**
 * Tests for releaseLock function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { releaseLock } from '../scripts/trigger.js';

describe('releaseLock', () => {
  let tempDir;
  let stateDir;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-manager-test-'));
    stateDir = tempDir;
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should remove lock directory', () => {
    // Setup: create lock directory
    const lockDir = path.join(stateDir, 'skill-manager.lock.d');
    fs.mkdirSync(lockDir);
    assert.strictEqual(fs.existsSync(lockDir), true, 'lock dir should exist before release');

    // Act
    releaseLock(stateDir);

    // Assert
    assert.strictEqual(fs.existsSync(lockDir), false, 'lock dir should be removed after release');
  });

  it('should remove PID file inside lock directory', () => {
    // Setup: create lock directory with PID file
    const lockDir = path.join(stateDir, 'skill-manager.lock.d');
    const pidFile = path.join(lockDir, 'pid');
    fs.mkdirSync(lockDir);
    fs.writeFileSync(pidFile, '12345');
    assert.strictEqual(fs.existsSync(pidFile), true, 'pid file should exist before release');

    // Act
    releaseLock(stateDir);

    // Assert
    assert.strictEqual(fs.existsSync(pidFile), false, 'pid file should be removed after release');
    assert.strictEqual(fs.existsSync(lockDir), false, 'lock dir should be removed after release');
  });

  it('should not throw if lock directory missing', () => {
    // Setup: ensure lock directory does NOT exist
    const lockDir = path.join(stateDir, 'skill-manager.lock.d');
    assert.strictEqual(fs.existsSync(lockDir), false, 'lock dir should not exist');

    // Act & Assert: should not throw
    assert.doesNotThrow(() => {
      releaseLock(stateDir);
    });
  });
});
