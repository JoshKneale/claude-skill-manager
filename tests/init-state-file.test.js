/**
 * Tests for initStateFile function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { initStateFile } from '../scripts/trigger.js';

describe('initStateFile', () => {
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

  it('should create state file with {version:1,transcripts:{}} if missing', () => {
    // State file doesn't exist yet
    assert.strictEqual(fs.existsSync(stateFile), false, 'Precondition: state file should not exist');

    initStateFile(stateFile);

    assert.strictEqual(fs.existsSync(stateFile), true, 'State file should be created');
    const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(content, { version: 1, transcripts: {} });
  });

  it('should not modify existing valid state file', () => {
    // Create a valid state file with some existing data
    const existingState = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': { status: 'completed', analyzed_at: '2024-01-01T00:00:00Z' },
      },
    };
    fs.writeFileSync(stateFile, JSON.stringify(existingState));

    initStateFile(stateFile);

    const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(content, existingState, 'Existing valid state should not be modified');
  });

  it('should reinitialize if state file contains invalid JSON', () => {
    // Create a state file with invalid JSON
    fs.writeFileSync(stateFile, 'not valid json {{{');

    initStateFile(stateFile);

    const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(content, { version: 1, transcripts: {} }, 'Invalid JSON should be reinitialized');
  });

  it('should reinitialize if state file is empty', () => {
    // Create an empty state file
    fs.writeFileSync(stateFile, '');

    initStateFile(stateFile);

    const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(content, { version: 1, transcripts: {} }, 'Empty file should be reinitialized');
  });
});
