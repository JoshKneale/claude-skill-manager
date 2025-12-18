/**
 * Tests for discoverTranscripts function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { discoverTranscripts } from '../scripts/trigger.js';

describe('discoverTranscripts', () => {
  let tempDir;
  let projectsDir;

  // Default config for tests
  const defaultConfig = {
    lookbackDays: 7,
    skipSubagents: false,
    minFileSize: 0,
    discoveryLimit: 1000,
  };

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-manager-test-'));
    projectsDir = path.join(tempDir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
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

  /**
   * Helper to create a transcript file
   * @param {string} relativePath - Path relative to projectsDir
   * @param {number} [daysAgo=0] - Age of the file in days
   * @param {string} [content='{"type":"summary"}\n'] - File content
   * @returns {string} - Full path to the created file
   */
  function createTranscript(relativePath, daysAgo = 0, content = '{"type":"summary"}\n') {
    const fullPath = path.join(projectsDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    if (daysAgo > 0) {
      setFileAge(fullPath, daysAgo);
    }
    return fullPath;
  }

  it('should find .jsonl files in projects directory', () => {
    const transcript1 = createTranscript('project-a/transcript.jsonl');
    const transcript2 = createTranscript('project-b/session.jsonl');

    const result = discoverTranscripts(projectsDir, defaultConfig);

    assert.strictEqual(result.length, 2, 'Should find 2 transcript files');
    assert.ok(result.includes(transcript1), 'Should include transcript1');
    assert.ok(result.includes(transcript2), 'Should include transcript2');
  });

  it('should search recursively in subdirectories', () => {
    const shallow = createTranscript('project-a/transcript.jsonl');
    const deep = createTranscript('project-b/nested/deep/transcript.jsonl');
    const veryDeep = createTranscript('a/b/c/d/e/transcript.jsonl');

    const result = discoverTranscripts(projectsDir, defaultConfig);

    assert.strictEqual(result.length, 3, 'Should find all 3 transcripts');
    assert.ok(result.includes(shallow), 'Should include shallow transcript');
    assert.ok(result.includes(deep), 'Should include deep transcript');
    assert.ok(result.includes(veryDeep), 'Should include very deep transcript');
  });

  it('should filter by modification time (lookback days)', () => {
    const recent = createTranscript('recent/transcript.jsonl', 2);
    const nearBoundary = createTranscript('boundary/transcript.jsonl', 6);
    const old = createTranscript('old/transcript.jsonl', 10);

    const result = discoverTranscripts(projectsDir, defaultConfig);

    assert.ok(result.includes(recent), 'Should include recent transcript (2 days old)');
    assert.ok(result.includes(nearBoundary), 'Should include transcript near boundary (6 days old)');
    assert.ok(!result.includes(old), 'Should exclude old transcript (10 days old)');
  });

  it('should sort by mtime descending (newest first)', async () => {
    // Create files with different ages
    const oldest = createTranscript('oldest/transcript.jsonl', 5);
    const middle = createTranscript('middle/transcript.jsonl', 3);
    const newest = createTranscript('newest/transcript.jsonl', 1);

    const result = discoverTranscripts(projectsDir, defaultConfig);

    assert.strictEqual(result.length, 3, 'Should find all 3 transcripts');
    assert.strictEqual(result[0], newest, 'First result should be newest');
    assert.strictEqual(result[1], middle, 'Second result should be middle');
    assert.strictEqual(result[2], oldest, 'Third result should be oldest');
  });

  it('should respect discoveryLimit config', () => {
    // Create 60 transcript files
    for (let i = 0; i < 60; i++) {
      createTranscript(`project-${i}/transcript.jsonl`);
    }

    const config = { ...defaultConfig, discoveryLimit: 50 };
    const result = discoverTranscripts(projectsDir, config);

    assert.strictEqual(result.length, 50, 'Should limit to configured discoveryLimit');
  });

  it('should skip agent-* files when skipSubagents is true', () => {
    const regular = createTranscript('project/transcript.jsonl');
    const agent1 = createTranscript('project/agent-abc123.jsonl');
    const agent2 = createTranscript('project/agent-def456.jsonl');

    const config = { ...defaultConfig, skipSubagents: true };
    const result = discoverTranscripts(projectsDir, config);

    assert.strictEqual(result.length, 1, 'Should only find non-agent transcript');
    assert.ok(result.includes(regular), 'Should include regular transcript');
    assert.ok(!result.includes(agent1), 'Should exclude agent-abc123');
    assert.ok(!result.includes(agent2), 'Should exclude agent-def456');
  });

  it('should include agent-* files when skipSubagents is false', () => {
    const regular = createTranscript('project/transcript.jsonl');
    const agent = createTranscript('project/agent-abc123.jsonl');

    const config = { ...defaultConfig, skipSubagents: false };
    const result = discoverTranscripts(projectsDir, config);

    assert.strictEqual(result.length, 2, 'Should find both transcripts');
    assert.ok(result.includes(regular), 'Should include regular transcript');
    assert.ok(result.includes(agent), 'Should include agent transcript');
  });

  it('should filter by minimum file size', () => {
    // Create files with different sizes
    const large = createTranscript('project/large.jsonl', 0, '{"type":"summary"}\n'.repeat(50));
    const small = createTranscript('project/small.jsonl', 0, '{}');

    const config = { ...defaultConfig, minFileSize: 100 };
    const result = discoverTranscripts(projectsDir, config);

    assert.strictEqual(result.length, 1, 'Should only find file above size threshold');
    assert.ok(result.includes(large), 'Should include large file');
    assert.ok(!result.includes(small), 'Should exclude small file');
  });

  it('should return empty array if projects directory missing', () => {
    const nonExistentDir = path.join(tempDir, 'does-not-exist');

    const result = discoverTranscripts(nonExistentDir, defaultConfig);

    assert.deepStrictEqual(result, [], 'Should return empty array for missing directory');
  });

  it('should return empty array if no transcripts found', () => {
    // projectsDir exists but is empty (created in beforeEach)
    const result = discoverTranscripts(projectsDir, defaultConfig);

    assert.deepStrictEqual(result, [], 'Should return empty array when no transcripts exist');
  });

  it('should ignore non-.jsonl files', () => {
    const jsonlFile = createTranscript('project/transcript.jsonl');

    // Create non-.jsonl files
    const jsonFile = path.join(projectsDir, 'project/data.json');
    fs.writeFileSync(jsonFile, '{}');

    const txtFile = path.join(projectsDir, 'project/notes.txt');
    fs.writeFileSync(txtFile, 'notes');

    const mdFile = path.join(projectsDir, 'project/README.md');
    fs.writeFileSync(mdFile, '# readme');

    const result = discoverTranscripts(projectsDir, defaultConfig);

    assert.strictEqual(result.length, 1, 'Should only find .jsonl file');
    assert.strictEqual(result[0], jsonlFile, 'Should return only the .jsonl file');
  });
});
