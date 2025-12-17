/**
 * Tests for readStateFile function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { readStateFile } from '../scripts/trigger.js';

describe('readStateFile', () => {
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

  it('should parse and return state file contents', () => {
    // Create a valid state file with some data
    const expectedState = {
      version: 1,
      transcripts: {
        '/path/to/transcript1.jsonl': { status: 'completed', analyzed_at: '2024-01-01T00:00:00Z' },
        '/path/to/transcript2.jsonl': { status: 'in_progress', started_at: '2024-01-02T00:00:00Z' },
      },
    };
    fs.writeFileSync(stateFile, JSON.stringify(expectedState));

    const result = readStateFile(stateFile);

    assert.deepStrictEqual(result, expectedState, 'Should return parsed state object');
  });

  it('should return null for missing file', () => {
    // State file doesn't exist
    assert.strictEqual(fs.existsSync(stateFile), false, 'Precondition: state file should not exist');

    const result = readStateFile(stateFile);

    assert.strictEqual(result, null, 'Should return null for missing file');
  });

  it('should return empty initial state structure', () => {
    // Create a minimal valid state file
    const minimalState = { version: 1, transcripts: {} };
    fs.writeFileSync(stateFile, JSON.stringify(minimalState));

    const result = readStateFile(stateFile);

    assert.deepStrictEqual(result, minimalState, 'Should return minimal state structure');
  });

  it('should throw for invalid JSON', () => {
    // Create a state file with invalid JSON
    fs.writeFileSync(stateFile, 'not valid json {{{');

    assert.throws(
      () => readStateFile(stateFile),
      /SyntaxError|Unexpected/,
      'Should throw for invalid JSON'
    );
  });

  it('should throw for empty file', () => {
    // Create an empty state file
    fs.writeFileSync(stateFile, '');

    assert.throws(
      () => readStateFile(stateFile),
      /SyntaxError|Unexpected/,
      'Should throw for empty file'
    );
  });
});
