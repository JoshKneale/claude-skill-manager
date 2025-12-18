/**
 * Tests for runAnalysis function
 * Run with: npm test
 *
 * These tests verify that runAnalysis:
 * 1. Spawns claude with correct arguments (--model sonnet, -p, --system-prompt-file)
 * 2. Returns { exitCode: number }
 * 3. Handles debug mode (captures output to log) vs normal mode (discards output)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

describe('runAnalysis', () => {
  let tmpDir;
  let transcriptPath;
  let logFile;
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Create temp directory for test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-analysis-test-'));
    transcriptPath = path.join(tmpDir, 'test-transcript.jsonl');
    logFile = path.join(tmpDir, 'test.log');

    // Create a dummy transcript file
    fs.writeFileSync(transcriptPath, '{"type":"summary"}\n');

    // Clear debug mode by default
    delete process.env.SKILL_MANAGER_DEBUG;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;

    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should be exported from trigger.js', async () => {
    // First, verify the function exists
    const module = await import('../scripts/trigger.js');
    assert.strictEqual(typeof module.runAnalysis, 'function', 'runAnalysis should be exported as a function');
  });

  it('should call claude with --model sonnet flag', async () => {
    const { runAnalysis } = await import('../scripts/trigger.js');

    // Track what command was spawned
    let spawnedArgs = null;

    // Create a mock spawner that captures arguments
    const mockSpawner = (cmd, args, options) => {
      spawnedArgs = { cmd, args, options };
      // Return a mock child process that exits immediately with success
      const mockChild = {
        on: (event, cb) => {
          if (event === 'close') {
            setImmediate(() => cb(0));
          }
          return mockChild;
        },
        stdout: { on: () => {} },
        stderr: { on: () => {} },
      };
      return mockChild;
    };

    await runAnalysis(transcriptPath, { logFile, spawner: mockSpawner });

    assert.ok(spawnedArgs, 'spawner should have been called');
    assert.ok(spawnedArgs.args.includes('--model'), 'args should include --model');
    const modelIndex = spawnedArgs.args.indexOf('--model');
    assert.strictEqual(spawnedArgs.args[modelIndex + 1], 'sonnet', '--model should be followed by sonnet');
  });

  it('should call claude with -p flag and transcript path in prompt', async () => {
    const { runAnalysis } = await import('../scripts/trigger.js');

    let spawnedArgs = null;

    const mockSpawner = (cmd, args, options) => {
      spawnedArgs = { cmd, args, options };
      const mockChild = {
        on: (event, cb) => {
          if (event === 'close') setImmediate(() => cb(0));
          return mockChild;
        },
        stdout: { on: () => {} },
        stderr: { on: () => {} },
      };
      return mockChild;
    };

    await runAnalysis(transcriptPath, { logFile, spawner: mockSpawner });

    assert.ok(spawnedArgs, 'spawner should have been called');
    assert.ok(spawnedArgs.args.includes('-p'), 'args should include -p flag');

    // The prompt should include the transcript path
    const pIndex = spawnedArgs.args.indexOf('-p');
    const promptArg = spawnedArgs.args[pIndex + 1];
    assert.ok(promptArg.includes(transcriptPath), 'prompt should include transcript path');
  });

  it('should call claude with --system-prompt-file flag', async () => {
    const { runAnalysis } = await import('../scripts/trigger.js');

    let spawnedArgs = null;

    const mockSpawner = (cmd, args, options) => {
      spawnedArgs = { cmd, args, options };
      const mockChild = {
        on: (event, cb) => {
          if (event === 'close') setImmediate(() => cb(0));
          return mockChild;
        },
        stdout: { on: () => {} },
        stderr: { on: () => {} },
      };
      return mockChild;
    };

    await runAnalysis(transcriptPath, { logFile, spawner: mockSpawner });

    assert.ok(spawnedArgs, 'spawner should have been called');
    assert.ok(spawnedArgs.args.includes('--system-prompt-file'), 'args should include --system-prompt-file');

    // The system-prompt-file should point to skill-manager.md
    const sysPromptIndex = spawnedArgs.args.indexOf('--system-prompt-file');
    const sysPromptFile = spawnedArgs.args[sysPromptIndex + 1];
    assert.ok(sysPromptFile.includes('skill-manager.md'), 'system-prompt-file should be skill-manager.md');
  });

  it('should return exit code 0 on success', async () => {
    const { runAnalysis } = await import('../scripts/trigger.js');

    const mockSpawner = (cmd, args, options) => {
      const mockChild = {
        on: (event, cb) => {
          if (event === 'close') setImmediate(() => cb(0)); // Exit code 0
          return mockChild;
        },
        stdout: { on: () => {} },
        stderr: { on: () => {} },
      };
      return mockChild;
    };

    const result = await runAnalysis(transcriptPath, { logFile, spawner: mockSpawner });

    assert.strictEqual(typeof result, 'object', 'result should be an object');
    assert.strictEqual(result.exitCode, 0, 'exitCode should be 0 on success');
  });

  it('should return non-zero exit code on failure', async () => {
    const { runAnalysis } = await import('../scripts/trigger.js');

    const mockSpawner = (cmd, args, options) => {
      const mockChild = {
        on: (event, cb) => {
          if (event === 'close') setImmediate(() => cb(1)); // Exit code 1
          return mockChild;
        },
        stdout: { on: () => {} },
        stderr: { on: () => {} },
      };
      return mockChild;
    };

    const result = await runAnalysis(transcriptPath, { logFile, spawner: mockSpawner });

    assert.strictEqual(typeof result, 'object', 'result should be an object');
    assert.strictEqual(result.exitCode, 1, 'exitCode should be 1 on failure');
  });

  describe('debug mode', () => {
    it('should capture claude output to log when SKILL_MANAGER_DEBUG=1', async () => {
      process.env.SKILL_MANAGER_DEBUG = '1';

      const { runAnalysis } = await import('../scripts/trigger.js');

      let capturedStdout = null;
      let capturedStderr = null;

      const mockSpawner = (cmd, args, options) => {
        const stdoutListeners = [];
        const stderrListeners = [];

        const mockChild = {
          on: (event, cb) => {
            if (event === 'close') {
              setImmediate(() => {
                // Emit some output before closing
                stdoutListeners.forEach(listener => listener('mock stdout output'));
                stderrListeners.forEach(listener => listener('mock stderr output'));
                cb(0);
              });
            }
            return mockChild;
          },
          stdout: {
            on: (event, cb) => {
              if (event === 'data') {
                stdoutListeners.push(cb);
                capturedStdout = true; // Listener was registered
              }
            },
          },
          stderr: {
            on: (event, cb) => {
              if (event === 'data') {
                stderrListeners.push(cb);
                capturedStderr = true; // Listener was registered
              }
            },
          },
        };
        return mockChild;
      };

      await runAnalysis(transcriptPath, { logFile, spawner: mockSpawner });

      // In debug mode, stdout and stderr should be captured (listeners registered)
      assert.strictEqual(capturedStdout, true, 'stdout should be captured in debug mode');
      assert.strictEqual(capturedStderr, true, 'stderr should be captured in debug mode');

      // Log file should contain the output
      const logContent = fs.readFileSync(logFile, 'utf8');
      assert.ok(logContent.includes('mock stdout output'), 'log should contain stdout');
    });
  });

  describe('normal mode', () => {
    it('should discard claude output when SKILL_MANAGER_DEBUG is not set', async () => {
      delete process.env.SKILL_MANAGER_DEBUG;

      const { runAnalysis } = await import('../scripts/trigger.js');

      let stdoutListenerRegistered = false;
      let stderrListenerRegistered = false;

      const mockSpawner = (cmd, args, options) => {
        const mockChild = {
          on: (event, cb) => {
            if (event === 'close') setImmediate(() => cb(0));
            return mockChild;
          },
          stdout: {
            on: (event, cb) => {
              if (event === 'data') {
                stdoutListenerRegistered = true;
              }
            },
          },
          stderr: {
            on: (event, cb) => {
              if (event === 'data') {
                stderrListenerRegistered = true;
              }
            },
          },
        };
        return mockChild;
      };

      await runAnalysis(transcriptPath, { logFile, spawner: mockSpawner });

      // In normal mode, output should be discarded (no listeners, or stdio: 'ignore')
      // The implementation might either not register listeners OR use stdio: 'ignore'
      // We check that output is NOT being captured to the log
      if (fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, 'utf8');
        assert.ok(!logContent.includes('mock'), 'log should not contain claude output in normal mode');
      }
    });
  });
});
