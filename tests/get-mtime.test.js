/**
 * Tests for getMtime function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getMtime } from '../scripts/trigger.js';

describe('getMtime', () => {
  let tempDir;
  let tempFile;

  beforeEach(() => {
    // Create a temp directory and file for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'getMtime-test-'));
    tempFile = path.join(tempDir, 'test-file.txt');
    fs.writeFileSync(tempFile, 'test content');
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  it('should return mtime in seconds for existing file', () => {
    const mtime = getMtime(tempFile);

    // mtime should be a number
    assert.strictEqual(typeof mtime, 'number');

    // mtime should be in seconds (not milliseconds)
    // Current time in seconds should be close to file mtime
    const nowSeconds = Math.floor(Date.now() / 1000);
    // File was just created, so mtime should be within last 5 seconds
    assert.ok(mtime <= nowSeconds, 'mtime should not be in the future');
    assert.ok(mtime >= nowSeconds - 5, 'mtime should be recent (within 5 seconds)');
  });

  it('should return null for non-existent file', () => {
    const nonExistentPath = path.join(tempDir, 'does-not-exist.txt');
    const mtime = getMtime(nonExistentPath);

    assert.strictEqual(mtime, null);
  });

  it('should return correct mtime matching fs.statSync', () => {
    // Verify our getMtime matches what Node's fs.statSync reports
    const stat = fs.statSync(tempFile);
    const expectedMtimeSeconds = Math.floor(stat.mtimeMs / 1000);

    const mtime = getMtime(tempFile);

    assert.strictEqual(mtime, expectedMtimeSeconds);
  });

  it('should detect mtime changes after file modification', async () => {
    const mtimeBefore = getMtime(tempFile);

    // Wait a bit and modify the file
    await new Promise(resolve => setTimeout(resolve, 1100)); // >1 second to ensure mtime changes
    fs.writeFileSync(tempFile, 'modified content');

    const mtimeAfter = getMtime(tempFile);

    assert.ok(mtimeAfter > mtimeBefore, 'mtime should increase after modification');
  });
});
