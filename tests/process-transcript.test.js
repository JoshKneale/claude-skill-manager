/**
 * Tests for processTranscript function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Helper to create a temp directory for tests
function createTempDir() {
  const tmpDir = os.tmpdir();
  const testDir = path.join(tmpDir, `process-transcript-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Helper to create a temp JSONL file with given entries
function createTempJsonl(dir, entries) {
  const tmpFile = path.join(dir, `test-transcript-${Date.now()}.jsonl`);
  const content = entries.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

// Helper to create initial state
function createInitialState() {
  return { version: 1, transcripts: {} };
}

describe('processTranscript', () => {
  let testDir;
  let stateFile;
  let logMessages;
  let mockLog;
  let mockRunAnalysis;

  beforeEach(() => {
    testDir = createTempDir();
    stateFile = path.join(testDir, 'analyzed.json');
    fs.writeFileSync(stateFile, JSON.stringify(createInitialState()));

    // Capture log messages
    logMessages = [];
    mockLog = (msg) => logMessages.push(msg);

    // Mock runAnalysis - default to success
    mockRunAnalysis = mock.fn(() => ({ exitCode: 0 }));
  });

  afterEach(() => {
    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    mock.reset();
  });

  describe('file existence check', () => {
    it('should skip and log if transcript file no longer exists', async () => {
      // Import the function (will fail until implemented)
      const { processTranscript } = await import('../scripts/trigger.js');

      const nonExistentPath = path.join(testDir, 'does-not-exist.jsonl');
      const state = createInitialState();

      const result = await processTranscript({
        transcriptPath: nonExistentPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: mockRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      // Should indicate skip
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.reason, 'file_missing');

      // Should log the skip
      assert.ok(
        logMessages.some((msg) => msg.includes('missing') || msg.includes('Skipped')),
        'Should log that file was skipped due to missing'
      );

      // Should NOT mark in state
      const finalState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(finalState.transcripts[nonExistentPath], undefined);

      // Should NOT call runAnalysis
      assert.strictEqual(mockRunAnalysis.mock.calls.length, 0);
    });
  });

  describe('state management', () => {
    it('should mark transcript as in_progress before processing', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      // Create a real transcript file
      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();
      let stateAfterInProgress = null;

      // Mock runAnalysis to capture state mid-processing
      const captureStateRunAnalysis = mock.fn(() => {
        stateAfterInProgress = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        return { exitCode: 0 };
      });

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: captureStateRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      // State should have been in_progress when runAnalysis was called
      assert.ok(stateAfterInProgress, 'State should have been written before runAnalysis');
      assert.strictEqual(stateAfterInProgress.transcripts[transcriptPath].status, 'in_progress');
      assert.ok(stateAfterInProgress.transcripts[transcriptPath].started_at, 'Should have started_at timestamp');
    });

    it('should mark as completed on success', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: mockRunAnalysis, // Returns exitCode: 0
        config: { TRUNCATE_LINES: 30 },
      });

      const finalState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(finalState.transcripts[transcriptPath].status, 'completed');
      assert.ok(finalState.transcripts[transcriptPath].analyzed_at, 'Should have analyzed_at timestamp');
      assert.strictEqual(finalState.transcripts[transcriptPath].started_at, undefined, 'Should remove started_at');
    });

    it('should mark as failed with exit code on failure', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();

      // Mock failure
      const failingRunAnalysis = mock.fn(() => ({ exitCode: 1 }));

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: failingRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      const finalState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(finalState.transcripts[transcriptPath].status, 'failed');
      assert.strictEqual(finalState.transcripts[transcriptPath].exit_code, 1);
      assert.ok(finalState.transcripts[transcriptPath].failed_at, 'Should have failed_at timestamp');
      assert.strictEqual(finalState.transcripts[transcriptPath].started_at, undefined, 'Should remove started_at');
    });

    it('should mark as failed with non-zero exit code', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();

      // Mock failure with different exit code
      const failingRunAnalysis = mock.fn(() => ({ exitCode: 127 }));

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: failingRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      const finalState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(finalState.transcripts[transcriptPath].exit_code, 127);
    });
  });

  describe('preprocessing', () => {
    it('should preprocess transcript before analysis', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', userType: 'external', cwd: '/test', message: { role: 'user', content: 'hello' } },
        { type: 'file-history-snapshot', data: 'should be filtered' },
      ]);

      const state = createInitialState();
      let preprocessedPath = null;

      // Capture the path passed to runAnalysis
      const capturePathRunAnalysis = mock.fn((path) => {
        preprocessedPath = path;
        return { exitCode: 0 };
      });

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: capturePathRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      // runAnalysis should have been called with a preprocessed file path
      assert.ok(preprocessedPath, 'Should have called runAnalysis with a path');
      assert.notStrictEqual(preprocessedPath, transcriptPath, 'Should pass preprocessed path, not original');

      // Note: By the time we check, the file may be cleaned up (which is correct behavior)
      // So we just verify it was a different path
    });

    it('should clean up temp preprocessed file after analysis', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();
      let preprocessedPath = null;

      // Capture the path
      const capturePathRunAnalysis = mock.fn((path) => {
        preprocessedPath = path;
        // Verify file exists during analysis
        assert.ok(fs.existsSync(path), 'Preprocessed file should exist during analysis');
        return { exitCode: 0 };
      });

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: capturePathRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      // File should be cleaned up after processing
      assert.ok(preprocessedPath, 'Should have captured preprocessed path');
      assert.strictEqual(fs.existsSync(preprocessedPath), false, 'Preprocessed file should be deleted after analysis');
    });

    it('should clean up temp file even if analysis fails', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();
      let preprocessedPath = null;

      // Capture the path, then fail
      const failingRunAnalysis = mock.fn((path) => {
        preprocessedPath = path;
        return { exitCode: 1 };
      });

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: failingRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      // File should be cleaned up even on failure
      assert.ok(preprocessedPath, 'Should have captured preprocessed path');
      assert.strictEqual(fs.existsSync(preprocessedPath), false, 'Preprocessed file should be deleted even after failure');
    });
  });

  describe('logging', () => {
    it('should log size reduction statistics', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      // Create a transcript with metadata that will be stripped
      const transcriptPath = createTempJsonl(testDir, [
        {
          type: 'user',
          userType: 'external',
          isSidechain: false,
          cwd: '/very/long/path/to/project',
          version: '1.0.0',
          gitBranch: 'main',
          message: { role: 'user', content: 'hello world' },
        },
        {
          type: 'assistant',
          userType: 'external',
          isSidechain: false,
          cwd: '/very/long/path/to/project',
          version: '1.0.0',
          gitBranch: 'main',
          message: { role: 'assistant', content: 'hi there' },
        },
      ]);

      const state = createInitialState();

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: mockRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      // Should log size reduction info
      const sizeLog = logMessages.find(
        (msg) => msg.includes('bytes') || msg.includes('reduction') || msg.includes('Reduced')
      );
      assert.ok(sizeLog, `Should log size reduction. Got logs: ${JSON.stringify(logMessages)}`);
    });

    it('should log processing duration', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();

      // Simulate some processing time
      const slowRunAnalysis = mock.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { exitCode: 0 };
      });

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: slowRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      // Should log duration
      const durationLog = logMessages.find(
        (msg) => msg.includes('s:') || msg.includes('seconds') || msg.includes('duration') || msg.includes('Completed')
      );
      assert.ok(durationLog, `Should log processing duration. Got logs: ${JSON.stringify(logMessages)}`);
    });

    it('should log when starting processing', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();

      await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: mockRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      // Should log the transcript being processed
      const startLog = logMessages.find(
        (msg) => msg.includes('Processing') || msg.includes(transcriptPath)
      );
      assert.ok(startLog, `Should log start of processing. Got logs: ${JSON.stringify(logMessages)}`);
    });
  });

  describe('return value', () => {
    it('should return success result on successful processing', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();

      const result = await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: mockRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.transcriptPath, transcriptPath);
    });

    it('should return failure result on failed processing', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const state = createInitialState();
      const failingRunAnalysis = mock.fn(() => ({ exitCode: 1 }));

      const result = await processTranscript({
        transcriptPath,
        state,
        stateFile,
        log: mockLog,
        runAnalysis: failingRunAnalysis,
        config: { TRUNCATE_LINES: 30 },
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.transcriptPath, transcriptPath);
    });
  });
});
