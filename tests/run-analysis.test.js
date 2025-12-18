/**
 * Tests for runAnalysis function
 * Run with: npm test
 *
 * These tests verify that runAnalysis:
 * 1. Spawns claude with correct arguments (--model sonnet, -p, --system-prompt-file)
 * 2. Returns { exitCode: number, outputFile?: string }
 * 3. Handles saveOutput mode (saves to individual file) vs normal mode (discards output)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('runAnalysis', () => {
  let tmpDir;
  let transcriptPath;
  let outputsDir;

  beforeEach(() => {
    // Create temp directory for test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-analysis-test-'));
    transcriptPath = path.join(tmpDir, 'test-transcript.jsonl');
    outputsDir = path.join(tmpDir, 'outputs');

    // Create a dummy transcript file
    fs.writeFileSync(transcriptPath, '{"type":"summary"}\n');
  });

  afterEach(() => {
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

    await runAnalysis(transcriptPath, { spawner: mockSpawner });

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

    await runAnalysis(transcriptPath, { spawner: mockSpawner });

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

    await runAnalysis(transcriptPath, { spawner: mockSpawner });

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

    const result = await runAnalysis(transcriptPath, { spawner: mockSpawner });

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

    const result = await runAnalysis(transcriptPath, { spawner: mockSpawner });

    assert.strictEqual(typeof result, 'object', 'result should be an object');
    assert.strictEqual(result.exitCode, 1, 'exitCode should be 1 on failure');
  });

  describe('saveOutput mode', () => {
    it('should save claude output to individual file when saveOutput=true', async () => {
      const { runAnalysis } = await import('../scripts/trigger.js');

      const mockSpawner = (cmd, args, options) => {
        const stdoutListeners = [];
        const stderrListeners = [];

        const mockChild = {
          on: (event, cb) => {
            if (event === 'close') {
              setImmediate(() => {
                // Emit some output before closing
                stdoutListeners.forEach(listener => listener(Buffer.from('mock stdout output')));
                stderrListeners.forEach(listener => listener(Buffer.from('mock stderr output')));
                cb(0);
              });
            }
            return mockChild;
          },
          stdout: {
            on: (event, cb) => {
              if (event === 'data') {
                stdoutListeners.push(cb);
              }
            },
          },
          stderr: {
            on: (event, cb) => {
              if (event === 'data') {
                stderrListeners.push(cb);
              }
            },
          },
        };
        return mockChild;
      };

      const result = await runAnalysis(transcriptPath, {
        saveOutput: true,
        outputsDir,
        originalTranscriptPath: '/path/to/original-transcript.jsonl',
        spawner: mockSpawner,
      });

      // Should return outputFile path
      assert.ok(result.outputFile, 'result should include outputFile path');
      assert.ok(result.outputFile.includes('original-transcript'), 'outputFile should include transcript basename');
      assert.ok(result.outputFile.endsWith('.log'), 'outputFile should end with .log');

      // File should exist and contain output
      assert.ok(fs.existsSync(result.outputFile), 'output file should exist');
      const content = fs.readFileSync(result.outputFile, 'utf8');
      assert.ok(content.includes('mock stdout output'), 'output file should contain stdout');
      assert.ok(content.includes('mock stderr output'), 'output file should contain stderr');
    });

    it('should create outputs directory if it does not exist', async () => {
      const { runAnalysis } = await import('../scripts/trigger.js');

      const nonExistentOutputsDir = path.join(tmpDir, 'new-outputs');
      assert.strictEqual(fs.existsSync(nonExistentOutputsDir), false, 'outputs dir should not exist yet');

      const mockSpawner = (cmd, args, options) => {
        const stdoutListeners = [];

        const mockChild = {
          on: (event, cb) => {
            if (event === 'close') {
              setImmediate(() => {
                stdoutListeners.forEach(listener => listener(Buffer.from('output')));
                cb(0);
              });
            }
            return mockChild;
          },
          stdout: {
            on: (event, cb) => {
              if (event === 'data') stdoutListeners.push(cb);
            },
          },
          stderr: { on: () => {} },
        };
        return mockChild;
      };

      const result = await runAnalysis(transcriptPath, {
        saveOutput: true,
        outputsDir: nonExistentOutputsDir,
        originalTranscriptPath: transcriptPath,
        spawner: mockSpawner,
      });

      assert.ok(fs.existsSync(nonExistentOutputsDir), 'outputs dir should be created');
      assert.ok(result.outputFile, 'should return outputFile');
    });

    it('should use timestamp-basename format for output filename', async () => {
      const { runAnalysis } = await import('../scripts/trigger.js');

      const mockSpawner = (cmd, args, options) => {
        const stdoutListeners = [];

        const mockChild = {
          on: (event, cb) => {
            if (event === 'close') {
              setImmediate(() => {
                stdoutListeners.forEach(listener => listener(Buffer.from('output')));
                cb(0);
              });
            }
            return mockChild;
          },
          stdout: {
            on: (event, cb) => {
              if (event === 'data') stdoutListeners.push(cb);
            },
          },
          stderr: { on: () => {} },
        };
        return mockChild;
      };

      const result = await runAnalysis(transcriptPath, {
        saveOutput: true,
        outputsDir,
        originalTranscriptPath: '/some/path/my-session.jsonl',
        spawner: mockSpawner,
      });

      // Filename should be YYYY-MM-DD-HH-MM-SS-basename.log
      const filename = path.basename(result.outputFile);
      assert.match(filename, /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-my-session\.log$/, 'filename should match timestamp-basename.log pattern');
    });
  });

  describe('normal mode (saveOutput=false)', () => {
    it('should discard claude output when saveOutput is not set', async () => {
      const { runAnalysis } = await import('../scripts/trigger.js');

      let stdioConfig = null;

      const mockSpawner = (cmd, args, options) => {
        stdioConfig = options.stdio;
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

      const result = await runAnalysis(transcriptPath, { spawner: mockSpawner });

      // In normal mode, stdio should be 'ignore'
      assert.deepStrictEqual(stdioConfig, ['ignore', 'ignore', 'ignore'], 'stdio should be ignore in normal mode');
      assert.strictEqual(result.outputFile, undefined, 'outputFile should not be set');
    });

    it('should not create any output files when saveOutput=false', async () => {
      const { runAnalysis } = await import('../scripts/trigger.js');

      fs.mkdirSync(outputsDir, { recursive: true });
      const filesBefore = fs.readdirSync(outputsDir);

      const mockSpawner = (cmd, args, options) => {
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

      await runAnalysis(transcriptPath, {
        saveOutput: false,
        outputsDir,
        spawner: mockSpawner,
      });

      const filesAfter = fs.readdirSync(outputsDir);
      assert.strictEqual(filesAfter.length, filesBefore.length, 'no new files should be created');
    });
  });
});
