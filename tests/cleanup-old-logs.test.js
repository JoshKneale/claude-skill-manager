/**
 * Tests for cleanupOldLogs function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { cleanupOldLogs } from '../scripts/trigger.js';

describe('cleanupOldLogs', () => {
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

  /**
   * Helper to set a file's mtime to N days ago
   * @param {string} filePath - Path to the file
   * @param {number} daysAgo - Number of days in the past
   */
  function setFileAge(filePath, daysAgo) {
    const now = Date.now();
    const pastTime = now - daysAgo * 24 * 60 * 60 * 1000;
    const pastDate = new Date(pastTime);
    fs.utimesSync(filePath, pastDate, pastDate);
  }

  it('should delete log files older than 7 days', () => {
    // Create a log file and set it to 10 days old
    const oldLogFile = path.join(stateDir, 'skill-manager-2024-01-01.log');
    fs.writeFileSync(oldLogFile, 'old log content');
    setFileAge(oldLogFile, 10);

    cleanupOldLogs(stateDir);

    assert.strictEqual(fs.existsSync(oldLogFile), false, 'Old log file should be deleted');
  });

  it('should keep log files newer than 7 days', () => {
    // Create a log file and set it to 3 days old
    const newLogFile = path.join(stateDir, 'skill-manager-2024-12-15.log');
    fs.writeFileSync(newLogFile, 'recent log content');
    setFileAge(newLogFile, 3);

    cleanupOldLogs(stateDir);

    assert.strictEqual(fs.existsSync(newLogFile), true, 'Recent log file should be kept');
  });

  it('should only delete files matching skill-manager-*.log pattern', () => {
    // Create an old file that doesn't match the pattern
    const otherOldFile = path.join(stateDir, 'analyzed.json');
    fs.writeFileSync(otherOldFile, '{}');
    setFileAge(otherOldFile, 10);

    // Create an old file with similar but wrong name
    const wrongPatternFile = path.join(stateDir, 'skill-manager-backup.txt');
    fs.writeFileSync(wrongPatternFile, 'backup');
    setFileAge(wrongPatternFile, 10);

    // Create an old log file that DOES match
    const matchingOldFile = path.join(stateDir, 'skill-manager-2024-01-01.log');
    fs.writeFileSync(matchingOldFile, 'old log');
    setFileAge(matchingOldFile, 10);

    cleanupOldLogs(stateDir);

    assert.strictEqual(fs.existsSync(otherOldFile), true, 'Non-matching files should be kept');
    assert.strictEqual(fs.existsSync(wrongPatternFile), true, 'Wrong pattern files should be kept');
    assert.strictEqual(fs.existsSync(matchingOldFile), false, 'Matching old log should be deleted');
  });

  it('should not throw if state directory is empty', () => {
    // stateDir is already empty after creation
    assert.doesNotThrow(() => {
      cleanupOldLogs(stateDir);
    });
  });

  it('should not throw if state directory does not exist', () => {
    const nonExistentDir = path.join(tempDir, 'does-not-exist');

    assert.doesNotThrow(() => {
      cleanupOldLogs(nonExistentDir);
    });
  });

  describe('outputs directory cleanup', () => {
    let outputsDir;

    beforeEach(() => {
      outputsDir = path.join(stateDir, 'outputs');
      fs.mkdirSync(outputsDir, { recursive: true });
    });

    it('should delete output files older than 7 days', () => {
      const oldOutputFile = path.join(outputsDir, '2024-01-01-12-00-00-test.log');
      fs.writeFileSync(oldOutputFile, 'old output content');
      setFileAge(oldOutputFile, 10);

      cleanupOldLogs(stateDir);

      assert.strictEqual(fs.existsSync(oldOutputFile), false, 'Old output file should be deleted');
    });

    it('should keep output files newer than 7 days', () => {
      const newOutputFile = path.join(outputsDir, '2024-12-15-12-00-00-test.log');
      fs.writeFileSync(newOutputFile, 'recent output content');
      setFileAge(newOutputFile, 3);

      cleanupOldLogs(stateDir);

      assert.strictEqual(fs.existsSync(newOutputFile), true, 'Recent output file should be kept');
    });

    it('should only delete .log files in outputs directory', () => {
      const nonLogFile = path.join(outputsDir, 'some-other-file.txt');
      fs.writeFileSync(nonLogFile, 'other content');
      setFileAge(nonLogFile, 10);

      cleanupOldLogs(stateDir);

      assert.strictEqual(fs.existsSync(nonLogFile), true, 'Non-log files should be kept');
    });

    it('should not throw if outputs directory does not exist', () => {
      fs.rmSync(outputsDir, { recursive: true, force: true });

      assert.doesNotThrow(() => {
        cleanupOldLogs(stateDir);
      });
    });
  });
});
