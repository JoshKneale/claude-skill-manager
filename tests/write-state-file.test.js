/**
 * Tests for writeStateFile function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { writeStateFile } from '../scripts/trigger.js';

describe('writeStateFile', () => {
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

  it('should write state atomically (temp file + rename)', () => {
    // Write state to a new file
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': { status: 'completed', analyzed_at: '2024-01-01T00:00:00Z' },
      },
    };

    writeStateFile(stateFile, state);

    // Verify the file exists and contains correct data
    assert.strictEqual(fs.existsSync(stateFile), true, 'State file should exist after write');
    const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(content, state, 'Written state should match input');

    // Verify no temp files left behind
    const filesInDir = fs.readdirSync(tempDir);
    assert.strictEqual(filesInDir.length, 1, 'Only the state file should exist (no temp files left)');
    assert.strictEqual(filesInDir[0], 'analyzed.json', 'Only analyzed.json should exist');
  });

  it('should preserve existing entries when updating', () => {
    // Create initial state file with some entries
    const existingState = {
      version: 1,
      transcripts: {
        '/path/to/old-transcript.jsonl': { status: 'completed', analyzed_at: '2024-01-01T00:00:00Z' },
      },
    };
    fs.writeFileSync(stateFile, JSON.stringify(existingState));

    // Write new state that includes existing entries plus new one
    const updatedState = {
      version: 1,
      transcripts: {
        '/path/to/old-transcript.jsonl': { status: 'completed', analyzed_at: '2024-01-01T00:00:00Z' },
        '/path/to/new-transcript.jsonl': { status: 'in_progress', started_at: '2024-01-02T00:00:00Z' },
      },
    };

    writeStateFile(stateFile, updatedState);

    // Verify both entries exist
    const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(content, updatedState, 'Updated state should contain both old and new entries');
  });

  it('should overwrite existing file completely', () => {
    // Create initial state with some data
    const initialState = {
      version: 1,
      transcripts: {
        '/path/to/transcript1.jsonl': { status: 'completed', analyzed_at: '2024-01-01T00:00:00Z' },
      },
    };
    fs.writeFileSync(stateFile, JSON.stringify(initialState));

    // Write completely different state
    const newState = {
      version: 1,
      transcripts: {
        '/path/to/transcript2.jsonl': { status: 'failed', failed_at: '2024-01-03T00:00:00Z', exit_code: 1 },
      },
    };

    writeStateFile(stateFile, newState);

    // Verify file contains only the new state
    const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(content, newState, 'File should contain only the new state');
  });

  it('should write valid JSON that can be read back', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/with spaces/transcript.jsonl': { status: 'completed', analyzed_at: '2024-01-01T00:00:00Z' },
        '/path/with"quotes/file.jsonl': { status: 'in_progress', started_at: '2024-01-02T00:00:00Z' },
      },
    };

    writeStateFile(stateFile, state);

    // Should not throw when parsing
    const content = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(content, state, 'Should handle special characters in paths');
  });

  it('should create parent directory if it does not exist', () => {
    // Use a nested path that doesn't exist
    const nestedDir = path.join(tempDir, 'nested', 'deep');
    const nestedStateFile = path.join(nestedDir, 'analyzed.json');

    const state = { version: 1, transcripts: {} };

    writeStateFile(nestedStateFile, state);

    assert.strictEqual(fs.existsSync(nestedStateFile), true, 'State file should be created in nested directory');
    const content = JSON.parse(fs.readFileSync(nestedStateFile, 'utf8'));
    assert.deepStrictEqual(content, state);
  });
});
