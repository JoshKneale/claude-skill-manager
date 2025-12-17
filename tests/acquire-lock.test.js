/**
 * Tests for acquireLock function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { acquireLock, releaseLock } from '../scripts/trigger.js';

describe('acquireLock', () => {
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

  it('should create lock directory when no lock exists', () => {
    acquireLock(stateDir);
    const lockDir = path.join(stateDir, 'skill-manager.lock.d');
    assert.strictEqual(fs.existsSync(lockDir), true);
    assert.strictEqual(fs.statSync(lockDir).isDirectory(), true);
  });

  it('should write PID to lock directory', () => {
    acquireLock(stateDir);
    const pidFile = path.join(stateDir, 'skill-manager.lock.d', 'pid');
    assert.strictEqual(fs.existsSync(pidFile), true);
    const writtenPid = fs.readFileSync(pidFile, 'utf-8');
    assert.strictEqual(writtenPid, String(process.pid));
  });

  it('should return true on successful lock acquisition', () => {
    const result = acquireLock(stateDir);
    assert.strictEqual(result, true);
  });

  it('should return false when lock already exists', () => {
    // First acquisition should succeed
    const firstResult = acquireLock(stateDir);
    assert.strictEqual(firstResult, true);

    // Second acquisition should fail
    const secondResult = acquireLock(stateDir);
    assert.strictEqual(secondResult, false);
  });

  it('should not throw when lock exists', () => {
    // First acquisition
    acquireLock(stateDir);

    // Second acquisition should not throw, just return false
    assert.doesNotThrow(() => {
      acquireLock(stateDir);
    });
  });
});
