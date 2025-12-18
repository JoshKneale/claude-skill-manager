/**
 * Tests for hook input parsing functions
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { parseHookInput, isSubagent, countLines } from '../scripts/trigger.js';

// Helper to create a mock stdin stream with data
function createMockStdin(data) {
  const stream = new Readable({
    read() {
      this.push(data);
      this.push(null);
    }
  });
  return stream;
}

// Helper to create a temp directory for tests
function createTempDir() {
  const tmpDir = os.tmpdir();
  const testDir = path.join(tmpDir, `hook-input-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

describe('parseHookInput', () => {
  it('should parse valid SessionEnd hook input', async () => {
    const hookInput = JSON.stringify({
      transcript_path: '/path/to/transcript.jsonl',
      session_id: 'abc123',
      reason: 'exit',
    });

    const stdin = createMockStdin(hookInput);
    const result = await parseHookInput(stdin);

    assert.strictEqual(result.transcriptPath, '/path/to/transcript.jsonl');
    assert.strictEqual(result.sessionId, 'abc123');
    assert.strictEqual(result.reason, 'exit');
  });

  it('should return null for empty stdin', async () => {
    const stdin = createMockStdin('');
    const result = await parseHookInput(stdin);

    assert.strictEqual(result, null);
  });

  it('should return null for invalid JSON', async () => {
    const stdin = createMockStdin('not json');
    const result = await parseHookInput(stdin);

    assert.strictEqual(result, null);
  });

  it('should handle missing optional fields', async () => {
    const hookInput = JSON.stringify({
      transcript_path: '/path/to/transcript.jsonl',
    });

    const stdin = createMockStdin(hookInput);
    const result = await parseHookInput(stdin);

    assert.strictEqual(result.transcriptPath, '/path/to/transcript.jsonl');
    assert.strictEqual(result.sessionId, null);
    assert.strictEqual(result.reason, null);
  });

  it('should handle whitespace-only input', async () => {
    const stdin = createMockStdin('   \n\t  ');
    const result = await parseHookInput(stdin);

    assert.strictEqual(result, null);
  });
});

describe('isSubagent', () => {
  it('should return true for agent- prefixed files', () => {
    assert.strictEqual(isSubagent('/path/to/agent-abc123.jsonl'), true);
    assert.strictEqual(isSubagent('/path/to/agent-task.jsonl'), true);
    assert.strictEqual(isSubagent('agent-test.jsonl'), true);
  });

  it('should return false for regular transcript files', () => {
    assert.strictEqual(isSubagent('/path/to/abc123.jsonl'), false);
    assert.strictEqual(isSubagent('/path/to/transcript.jsonl'), false);
    assert.strictEqual(isSubagent('regular-session.jsonl'), false);
  });

  it('should return false for files with agent in the path but not filename', () => {
    assert.strictEqual(isSubagent('/path/agent/to/transcript.jsonl'), false);
    assert.strictEqual(isSubagent('/agent-folder/transcript.jsonl'), false);
  });
});

describe('countLines', () => {
  let testDir;

  beforeEach(() => {
    testDir = createTempDir();
  });

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should count non-empty lines in a file', () => {
    const filePath = path.join(testDir, 'test.jsonl');
    fs.writeFileSync(filePath, '{"a":1}\n{"b":2}\n{"c":3}\n');

    const count = countLines(filePath);
    assert.strictEqual(count, 3);
  });

  it('should not count empty lines', () => {
    const filePath = path.join(testDir, 'test.jsonl');
    fs.writeFileSync(filePath, '{"a":1}\n\n{"b":2}\n\n\n{"c":3}\n');

    const count = countLines(filePath);
    assert.strictEqual(count, 3);
  });

  it('should not count whitespace-only lines', () => {
    const filePath = path.join(testDir, 'test.jsonl');
    fs.writeFileSync(filePath, '{"a":1}\n   \n{"b":2}\n\t\n{"c":3}\n');

    const count = countLines(filePath);
    assert.strictEqual(count, 3);
  });

  it('should return 0 for empty file', () => {
    const filePath = path.join(testDir, 'test.jsonl');
    fs.writeFileSync(filePath, '');

    const count = countLines(filePath);
    assert.strictEqual(count, 0);
  });

  it('should return 0 for non-existent file', () => {
    const count = countLines('/nonexistent/file.jsonl');
    assert.strictEqual(count, 0);
  });

  it('should handle file without trailing newline', () => {
    const filePath = path.join(testDir, 'test.jsonl');
    fs.writeFileSync(filePath, '{"a":1}\n{"b":2}');

    const count = countLines(filePath);
    assert.strictEqual(count, 2);
  });
});
