/**
 * Tests for main function (simplified version)
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Helper to create a temp directory for tests
function createTempDir() {
  const tmpDir = os.tmpdir();
  const testDir = path.join(tmpDir, `main-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Helper to create a temp JSONL file with given entries
function createTempJsonl(dir, entries, filename = null) {
  const tmpFile = path.join(dir, filename || `test-transcript-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const content = entries.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

// Default config for tests
const defaultTestConfig = {
  TRUNCATE_LINES: 30,
  MIN_LINES: 5,
  SAVE_OUTPUT: false,
};

describe('main', () => {
  let tempDir;
  let stateDir;
  let outputsDir;
  let logMessages;
  let mockLog;

  beforeEach(() => {
    // Create a unique temp directory structure for each test
    tempDir = createTempDir();
    stateDir = path.join(tempDir, '.claude', 'skill-manager');
    outputsDir = path.join(stateDir, 'outputs');
    fs.mkdirSync(stateDir, { recursive: true });

    // Capture log messages
    logMessages = [];
    mockLog = (msg) => logMessages.push(msg);
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    mock.reset();
  });

  describe('initialization', () => {
    it('should ensure directories exist', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Remove state dir to test creation
      fs.rmSync(stateDir, { recursive: true, force: true });
      assert.strictEqual(fs.existsSync(stateDir), false, 'State dir should not exist before main');

      // Create a transcript with enough lines
      const transcriptDir = createTempDir();
      const transcriptPath = createTempJsonl(transcriptDir, [
        { type: 'user', message: { content: '1' } },
        { type: 'assistant', message: { content: '2' } },
        { type: 'user', message: { content: '3' } },
        { type: 'assistant', message: { content: '4' } },
        { type: 'user', message: { content: '5' } },
        { type: 'assistant', message: { content: '6' } },
      ]);

      await main({
        transcriptPath,
        log: mockLog,
        config: defaultTestConfig,
        stateDir,
        outputsDir,
      });

      // State dir should now exist
      assert.strictEqual(fs.existsSync(stateDir), true, 'State dir should be created by main');

      // Clean up
      fs.rmSync(transcriptDir, { recursive: true, force: true });
    });

    it('should cleanup old logs', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create an old log file (8 days old)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 8);
      const oldLogFile = path.join(stateDir, `skill-manager-${oldDate.toISOString().slice(0, 10)}.log`);
      fs.writeFileSync(oldLogFile, 'old log content');

      // Set mtime to 8 days ago
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      fs.utimesSync(oldLogFile, new Date(eightDaysAgo), new Date(eightDaysAgo));

      assert.strictEqual(fs.existsSync(oldLogFile), true, 'Old log should exist before main');

      // Create a transcript with enough lines
      const transcriptDir = createTempDir();
      const transcriptPath = createTempJsonl(transcriptDir, [
        { type: 'user', message: { content: '1' } },
        { type: 'assistant', message: { content: '2' } },
        { type: 'user', message: { content: '3' } },
        { type: 'assistant', message: { content: '4' } },
        { type: 'user', message: { content: '5' } },
        { type: 'assistant', message: { content: '6' } },
      ]);

      await main({
        transcriptPath,
        log: mockLog,
        config: defaultTestConfig,
        stateDir,
        outputsDir,
      });

      // Old log should be cleaned up
      assert.strictEqual(fs.existsSync(oldLogFile), false, 'Old log should be deleted by main');

      // Clean up
      fs.rmSync(transcriptDir, { recursive: true, force: true });
    });
  });

  describe('transcript filtering', () => {
    it('should skip if transcript file missing', async () => {
      const { main } = await import('../scripts/trigger.js');

      const result = await main({
        transcriptPath: '/nonexistent/path/transcript.jsonl',
        log: mockLog,
        config: defaultTestConfig,
        stateDir,
        outputsDir,
      });

      // Should exit gracefully
      assert.strictEqual(result, 0, 'Should return 0 for missing file');

      // Should log about missing file
      const missedLog = logMessages.some(
        (msg) => msg.includes('missing') || msg.includes('Skipped')
      );
      assert.ok(missedLog, `Should log about missing file. Got: ${JSON.stringify(logMessages)}`);
    });

    it('should skip subagent sessions', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create a subagent transcript (starts with agent-)
      const transcriptDir = createTempDir();
      const transcriptPath = createTempJsonl(transcriptDir, [
        { type: 'user', message: { content: '1' } },
        { type: 'assistant', message: { content: '2' } },
        { type: 'user', message: { content: '3' } },
        { type: 'assistant', message: { content: '4' } },
        { type: 'user', message: { content: '5' } },
        { type: 'assistant', message: { content: '6' } },
      ], 'agent-test-session.jsonl');

      const result = await main({
        transcriptPath,
        log: mockLog,
        config: defaultTestConfig,
        stateDir,
        outputsDir,
      });

      // Should exit gracefully
      assert.strictEqual(result, 0, 'Should return 0 for subagent');

      // Should log about subagent
      const subagentLog = logMessages.some(
        (msg) => msg.includes('subagent') || msg.includes('Skipped')
      );
      assert.ok(subagentLog, `Should log about subagent. Got: ${JSON.stringify(logMessages)}`);

      // Clean up
      fs.rmSync(transcriptDir, { recursive: true, force: true });
    });

    it('should skip transcripts with too few lines', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create a transcript with fewer lines than MIN_LINES
      const transcriptDir = createTempDir();
      const transcriptPath = createTempJsonl(transcriptDir, [
        { type: 'user', message: { content: 'hello' } },
        { type: 'assistant', message: { content: 'hi' } },
      ]);

      const result = await main({
        transcriptPath,
        log: mockLog,
        config: { ...defaultTestConfig, MIN_LINES: 10 },
        stateDir,
        outputsDir,
      });

      // Should exit gracefully
      assert.strictEqual(result, 0, 'Should return 0 for short transcript');

      // Should log about minimum lines
      const minLinesLog = logMessages.some(
        (msg) => msg.includes('lines') || msg.includes('minimum') || msg.includes('Skipped')
      );
      assert.ok(minLinesLog, `Should log about minimum lines. Got: ${JSON.stringify(logMessages)}`);

      // Clean up
      fs.rmSync(transcriptDir, { recursive: true, force: true });
    });
  });

  describe('processing', () => {
    it('should process valid transcripts', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create a transcript with enough lines
      const transcriptDir = createTempDir();
      const transcriptPath = createTempJsonl(transcriptDir, [
        { type: 'user', message: { content: '1' } },
        { type: 'assistant', message: { content: '2' } },
        { type: 'user', message: { content: '3' } },
        { type: 'assistant', message: { content: '4' } },
        { type: 'user', message: { content: '5' } },
        { type: 'assistant', message: { content: '6' } },
      ]);

      await main({
        transcriptPath,
        log: mockLog,
        config: defaultTestConfig,
        stateDir,
        outputsDir,
      });

      // Should log processing
      const processingLog = logMessages.some(
        (msg) => msg.includes('Processing') || msg.includes('complete')
      );
      assert.ok(processingLog, `Should log processing. Got: ${JSON.stringify(logMessages)}`);

      // Clean up
      fs.rmSync(transcriptDir, { recursive: true, force: true });
    });
  });
});
