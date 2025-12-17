/**
 * Tests for log function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { log } from '../scripts/trigger.js';

describe('log', () => {
  let tempDir;
  let logFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-test-'));
    logFile = path.join(tempDir, 'test.log');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should format message with timestamp [YYYY-MM-DD HH:MM:SS]', () => {
    log(logFile, 'Test message');

    const content = fs.readFileSync(logFile, 'utf8');
    // Timestamp format: [YYYY-MM-DD HH:MM:SS]
    const timestampPattern = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/;
    assert.match(content, timestampPattern, 'Log entry should start with timestamp in [YYYY-MM-DD HH:MM:SS] format');
    assert.ok(content.includes('Test message'), 'Log entry should contain the message');
  });

  it('should append to log file, not overwrite', () => {
    log(logFile, 'First message');
    log(logFile, 'Second message');

    const content = fs.readFileSync(logFile, 'utf8');
    assert.ok(content.includes('First message'), 'Should contain first message');
    assert.ok(content.includes('Second message'), 'Should contain second message');

    // Both should be on separate lines
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 2, 'Should have two separate log entries');
  });

  it('should create log file if not exists', () => {
    // Verify file doesn't exist
    assert.strictEqual(fs.existsSync(logFile), false, 'Log file should not exist initially');

    log(logFile, 'Creating file');

    // Verify file now exists
    assert.strictEqual(fs.existsSync(logFile), true, 'Log file should be created');
    const content = fs.readFileSync(logFile, 'utf8');
    assert.ok(content.includes('Creating file'), 'File should contain the message');
  });

  it('should handle multiple arguments', () => {
    log(logFile, 'Count:', 42, 'items');

    const content = fs.readFileSync(logFile, 'utf8');
    // Arguments should be joined with spaces
    assert.ok(content.includes('Count: 42 items'), 'Multiple arguments should be joined with spaces');
  });

  it('should create parent directories if they do not exist', () => {
    const nestedLogFile = path.join(tempDir, 'nested', 'deep', 'test.log');

    log(nestedLogFile, 'Nested message');

    assert.strictEqual(fs.existsSync(nestedLogFile), true, 'Nested log file should be created');
    const content = fs.readFileSync(nestedLogFile, 'utf8');
    assert.ok(content.includes('Nested message'), 'File should contain the message');
  });

  it('should end each log entry with a newline', () => {
    log(logFile, 'Message');

    const content = fs.readFileSync(logFile, 'utf8');
    assert.ok(content.endsWith('\n'), 'Log entry should end with newline');
  });
});
