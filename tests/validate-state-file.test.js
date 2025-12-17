/**
 * Tests for validateStateFile function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { validateStateFile } from '../scripts/trigger.js';

describe('validateStateFile', () => {
  let tempDir;
  let stateFile;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-manager-test-'));
    stateFile = path.join(tempDir, 'analyzed.json');
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should return true for valid state file', () => {
    // Create a valid state file with proper structure
    const validState = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': { status: 'completed', analyzed_at: '2024-01-01T00:00:00Z' },
      },
    };
    fs.writeFileSync(stateFile, JSON.stringify(validState));

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, true, 'Should return true for valid state file');
  });

  it('should return true for valid empty state file', () => {
    // Create a minimal valid state file (empty transcripts)
    const validState = { version: 1, transcripts: {} };
    fs.writeFileSync(stateFile, JSON.stringify(validState));

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, true, 'Should return true for minimal valid state');
  });

  it('should return false for invalid JSON', () => {
    // Create a state file with invalid JSON
    fs.writeFileSync(stateFile, 'not valid json {{{');

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, false, 'Should return false for invalid JSON');
  });

  it('should return false for empty file', () => {
    // Create an empty state file
    fs.writeFileSync(stateFile, '');

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, false, 'Should return false for empty file');
  });

  it('should return false for missing version field', () => {
    // Create state file without version field
    const invalidState = { transcripts: {} };
    fs.writeFileSync(stateFile, JSON.stringify(invalidState));

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, false, 'Should return false for missing version field');
  });

  it('should return false for missing transcripts object', () => {
    // Create state file without transcripts field
    const invalidState = { version: 1 };
    fs.writeFileSync(stateFile, JSON.stringify(invalidState));

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, false, 'Should return false for missing transcripts object');
  });

  it('should return false for transcripts that is not an object', () => {
    // Create state file where transcripts is an array (wrong type)
    const invalidState = { version: 1, transcripts: [] };
    fs.writeFileSync(stateFile, JSON.stringify(invalidState));

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, false, 'Should return false for transcripts array');
  });

  it('should return false for non-existent file', () => {
    // Don't create the file - test non-existent path
    assert.strictEqual(fs.existsSync(stateFile), false, 'Precondition: file should not exist');

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, false, 'Should return false for non-existent file');
  });

  it('should return false for version that is not a number', () => {
    // Create state file where version is a string
    const invalidState = { version: '1', transcripts: {} };
    fs.writeFileSync(stateFile, JSON.stringify(invalidState));

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, false, 'Should return false for non-numeric version');
  });

  it('should return false for null transcripts', () => {
    // Create state file where transcripts is null
    const invalidState = { version: 1, transcripts: null };
    fs.writeFileSync(stateFile, JSON.stringify(invalidState));

    const result = validateStateFile(stateFile);

    assert.strictEqual(result, false, 'Should return false for null transcripts');
  });
});
