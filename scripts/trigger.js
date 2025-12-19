#!/usr/bin/env node
// Cross-platform trigger for Skill Manager
// Simplified version: reads transcript_path directly from SessionEnd hook input

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// =============================================================================
// Configuration Loading
// =============================================================================

/**
 * Load configuration from environment variables with defaults
 * @returns {{ TRUNCATE_LINES: number, MIN_LINES: number, SAVE_OUTPUT: boolean }}
 */
export function loadConfig() {
  // Parse TRUNCATE_LINES with validation (must be positive)
  const truncateLines = parseInt(process.env.SKILL_MANAGER_TRUNCATE_LINES, 10);
  const validTruncateLines = truncateLines > 0 ? truncateLines : 30;

  // Parse MIN_LINES with validation (must be non-negative)
  const minLines = parseInt(process.env.SKILL_MANAGER_MIN_LINES, 10);
  const validMinLines = minLines >= 0 && !isNaN(minLines) ? minLines : 10;

  // Parse SAVE_OUTPUT - accept '1', 'true', 'yes' (case-insensitive)
  const saveOutputEnv = (process.env.SKILL_MANAGER_SAVE_OUTPUT || '').toLowerCase();
  const saveOutput = saveOutputEnv === '1' || saveOutputEnv === 'true' || saveOutputEnv === 'yes';

  return {
    TRUNCATE_LINES: validTruncateLines,
    MIN_LINES: validMinLines,
    SAVE_OUTPUT: saveOutput,
  };
}

// =============================================================================
// Path Construction
// =============================================================================

/**
 * Expand tilde (~) in file paths to the user's home directory
 * @param {string} filePath - Path that may contain leading tilde
 * @returns {string} - Path with tilde expanded
 */
export function expandTilde(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return filePath;
  }
  if (filePath.startsWith('~/') || filePath === '~') {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return filePath.replace(/^~/, homeDir);
  }
  return filePath;
}

/**
 * Build standard paths used by skill manager
 * @returns {{ STATE_DIR: string, LOG_FILE: string, OUTPUTS_DIR: string }}
 * @throws {Error} If HOME or USERPROFILE environment variable is not set
 */
export function buildPaths() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    throw new Error('Neither HOME nor USERPROFILE environment variable is set');
  }
  const stateDir = `${homeDir}/.claude/skill-manager`;
  const today = new Date().toISOString().slice(0, 10);

  return {
    STATE_DIR: stateDir,
    LOG_FILE: `${stateDir}/skill-manager-${today}.log`,
    OUTPUTS_DIR: `${stateDir}/outputs`,
  };
}

// =============================================================================
// Logging
// =============================================================================

/**
 * Log a message to file with timestamp
 * Format: [YYYY-MM-DD HH:MM:SS] message
 * @param {string} logFile - Path to the log file
 * @param {...any} args - Message parts to log (joined with spaces)
 */
export function log(logFile, ...args) {
  // Format timestamp as [YYYY-MM-DD HH:MM:SS]
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    '-',
    String(now.getMonth() + 1).padStart(2, '0'),
    '-',
    String(now.getDate()).padStart(2, '0'),
    ' ',
    String(now.getHours()).padStart(2, '0'),
    ':',
    String(now.getMinutes()).padStart(2, '0'),
    ':',
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  // Join args with spaces
  const message = args.map(String).join(' ');
  const entry = `[${timestamp}] ${message}\n`;

  // Ensure parent directories exist
  const parentDir = path.dirname(logFile);
  fs.mkdirSync(parentDir, { recursive: true });

  // Append to log file
  fs.appendFileSync(logFile, entry);
}

// =============================================================================
// Log Cleanup
// =============================================================================

/**
 * Delete log files older than 7 days from stateDir and outputs subdirectory
 * @param {string} stateDir - The state directory path
 */
export function cleanupOldLogs(stateDir) {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - SEVEN_DAYS_MS;

  // Clean audit logs (skill-manager-*.log)
  let files;
  try {
    files = fs.readdirSync(stateDir);
  } catch (err) {
    // Directory doesn't exist or can't be read - silently ignore
    return;
  }

  for (const file of files) {
    // Only process files matching skill-manager-*.log pattern
    if (!file.startsWith('skill-manager-') || !file.endsWith('.log')) {
      continue;
    }

    const filePath = path.join(stateDir, file);

    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoffTime) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      // File may have been deleted or can't be accessed - silently ignore
    }
  }

  // Clean output files (outputs/*.log)
  const outputsDir = path.join(stateDir, 'outputs');
  let outputFiles;
  try {
    outputFiles = fs.readdirSync(outputsDir);
  } catch (err) {
    // Directory doesn't exist - nothing to clean
    return;
  }

  for (const file of outputFiles) {
    if (!file.endsWith('.log')) {
      continue;
    }

    const filePath = path.join(outputsDir, file);

    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoffTime) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      // File may have been deleted or can't be accessed - silently ignore
    }
  }
}

// =============================================================================
// Hook Input Parsing
// =============================================================================

/**
 * Parse hook input from stdin
 * SessionEnd hooks receive: { transcript_path, session_id, reason, ... }
 * @param {NodeJS.ReadStream} stdin - The stdin stream
 * @returns {Promise<{ transcriptPath: string, sessionId: string, reason?: string } | null>}
 */
export function parseHookInput(stdin) {
  return new Promise((resolve) => {
    let data = '';

    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => {
      data += chunk;
    });

    stdin.on('end', () => {
      if (!data.trim()) {
        resolve(null);
        return;
      }

      try {
        const parsed = JSON.parse(data);
        resolve({
          transcriptPath: parsed.transcript_path || null,
          sessionId: parsed.session_id || null,
          reason: parsed.reason || null,
        });
      } catch (err) {
        resolve(null);
      }
    });

    stdin.on('error', () => {
      resolve(null);
    });

    stdin.resume();
  });
}

// =============================================================================
// Transcript Filtering
// =============================================================================

/**
 * Check if a transcript is from a subagent session (should be skipped)
 * @param {string} transcriptPath - Path to the transcript file
 * @returns {boolean} - true if this is a subagent session
 */
export function isSubagent(transcriptPath) {
  const filename = path.basename(transcriptPath);
  return filename.startsWith('agent-');
}

/**
 * Check if a transcript is from a skill-manager session (should be skipped to prevent infinite loops)
 * Looks for the skill extraction prompt in the first few entries of the transcript
 * @param {string} transcriptPath - Path to the transcript file
 * @returns {boolean} - true if this is a skill-manager session
 */
export function isSkillManagerSession(transcriptPath) {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    // Check first few lines for the skill-manager prompt pattern
    const lines = content.split('\n').slice(0, 10);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        // Check if user message contains skill extraction prompt
        if (entry.type === 'user' && entry.message?.content) {
          const contentStr = typeof entry.message.content === 'string'
            ? entry.message.content
            : JSON.stringify(entry.message.content);
          if (contentStr.includes('Extract skills from transcript')) {
            return true;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Count the number of lines in a file
 * @param {string} filePath - Path to the file
 * @returns {number} - Number of lines, or 0 if file can't be read
 */
export function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').filter(line => line.trim()).length;
  } catch (err) {
    return 0;
  }
}

// =============================================================================
// Transcript Preprocessing
// =============================================================================

// Maximum characters for single-line or low-line content (50KB default)
const MAX_CHARS_SINGLE_LINE = 50000;

/**
 * Truncate text content if it exceeds the threshold
 * - For multi-line content: keeps first N and last N lines
 * - For single-line/low-line content: truncates by character count if very long
 * @param {string} text - The text to potentially truncate
 * @param {number} truncateLines - Number of lines to keep at start and end
 * @returns {string} - Original or truncated text
 */
function truncateText(text, truncateLines) {
  const lines = text.split('\n');
  const threshold = truncateLines * 2;

  // Multi-line truncation
  if (lines.length > threshold) {
    const truncatedCount = lines.length - threshold;
    const firstLines = lines.slice(0, truncateLines);
    const lastLines = lines.slice(-truncateLines);
    const marker = `... [truncated ${truncatedCount} lines] ...`;
    return [...firstLines, '', marker, '', ...lastLines].join('\n');
  }

  // Character-based truncation for single-line or low-line content that's very long
  // This handles cases like minified JS, base64, or other long single-line content
  if (text.length > MAX_CHARS_SINGLE_LINE) {
    const keepChars = Math.floor(MAX_CHARS_SINGLE_LINE / 2);
    const truncatedChars = text.length - MAX_CHARS_SINGLE_LINE;
    const firstPart = text.slice(0, keepChars);
    const lastPart = text.slice(-keepChars);
    const marker = `\n... [truncated ${truncatedChars} characters] ...\n`;
    return firstPart + marker + lastPart;
  }

  return text;
}

/**
 * Process a single content item (tool_result) for truncation
 * @param {Object} item - Content item from message.content array
 * @param {number} truncateLines - Number of lines to keep at start and end
 * @returns {Object} - Processed content item
 */
function processContentItem(item, truncateLines) {
  if (item.type !== 'tool_result') {
    return item;
  }

  // Handle string content
  if (typeof item.content === 'string') {
    return {
      ...item,
      content: truncateText(item.content, truncateLines),
    };
  }

  // Handle array content (multi-part tool results)
  if (Array.isArray(item.content)) {
    return {
      ...item,
      content: item.content.map((part) => {
        if (part.type === 'text' && typeof part.text === 'string') {
          return {
            ...part,
            text: truncateText(part.text, truncateLines),
          };
        }
        return part;
      }),
    };
  }

  return item;
}

/**
 * Process a single JSONL entry (one line from transcript)
 * - Filters out unwanted message types
 * - Removes redundant fields
 * - Truncates large tool results
 * @param {Object} entry - Parsed JSON entry
 * @param {number} truncateLines - Number of lines to keep at start and end
 * @returns {Object|null} - Processed entry, or null if should be filtered out
 */
function processEntry(entry, truncateLines) {
  // Filter out unwanted message types
  if (entry.type === 'file-history-snapshot' || entry.type === 'queue-operation') {
    return null;
  }

  // Create a new object without redundant fields
  const { userType, isSidechain, cwd, version, gitBranch, ...rest } = entry;

  // Remove message.role if message exists
  if (rest.message) {
    const { role, ...messageRest } = rest.message;
    rest.message = messageRest;

    // Process content array for truncation
    if (Array.isArray(rest.message.content)) {
      rest.message.content = rest.message.content.map((item) =>
        processContentItem(item, truncateLines)
      );
    }
  }

  return rest;
}

/**
 * Preprocess transcript to reduce token usage
 * - Removes file-history-snapshot and queue-operation entries
 * - Strips redundant per-message fields (userType, isSidechain, cwd, version, gitBranch)
 * - Removes message.role (redundant with type)
 * - Truncates large text content in tool results
 *
 * @param {string} inputFilePath - Path to the input JSONL transcript
 * @param {{ truncateLines: number }} options - Processing options
 * @returns {string} - Path to the preprocessed temp file (caller must clean up)
 */
export function preprocessTranscript(inputFilePath, options) {
  const { truncateLines = 30 } = options;

  // Read input file
  const inputContent = fs.readFileSync(inputFilePath, 'utf8');

  // Process each line
  const outputLines = [];

  for (const line of inputContent.split('\n')) {
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    // Parse JSON, skip malformed lines
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (err) {
      // Skip malformed JSON lines
      continue;
    }

    // Process the entry
    const processed = processEntry(entry, truncateLines);

    // Skip filtered entries
    if (processed === null) {
      continue;
    }

    // Add to output
    outputLines.push(JSON.stringify(processed));
  }

  // Write to temp file (include random suffix for uniqueness in concurrent calls)
  const tmpDir = os.tmpdir();
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const tmpFile = path.join(
    tmpDir,
    `preprocessed-transcript-${Date.now()}-${process.pid}-${randomSuffix}.jsonl`
  );
  fs.writeFileSync(tmpFile, outputLines.join('\n'));

  return tmpFile;
}

// =============================================================================
// Analysis Execution
// =============================================================================

/**
 * Get the path to the skill-manager command file
 * Resolves relative to this script's location
 * @returns {string} - Absolute path to skill-manager.md
 */
export function getCommandFilePath() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  return path.join(scriptDir, '..', 'commands', 'skill-manager.md');
}

/**
 * Generate a timestamp string for output filenames
 * Format: YYYY-MM-DD-HH-MM-SS
 * @returns {string}
 */
function generateOutputTimestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    '-',
    String(now.getMonth() + 1).padStart(2, '0'),
    '-',
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    '-',
    String(now.getMinutes()).padStart(2, '0'),
    '-',
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
}

/**
 * Run skill extraction analysis on a preprocessed transcript
 * Spawns claude CLI with appropriate flags and optionally saves output to file
 *
 * @param {string} transcriptPath - Path to the preprocessed transcript file
 * @param {Object} options
 * @param {boolean} [options.saveOutput] - Whether to save output to individual file
 * @param {string} [options.outputsDir] - Directory to save output files (required if saveOutput is true)
 * @param {string} [options.originalTranscriptPath] - Original transcript path for deriving output filename
 * @param {string} [options.commandFile] - Path to command file (defaults to ../commands/skill-manager.md)
 * @param {function} [options.spawner] - Optional spawn function for testing (defaults to child_process.spawn)
 * @returns {Promise<{ exitCode: number, outputFile?: string }>} - Exit code and optional output file path
 */
export async function runAnalysis(transcriptPath, options) {
  const {
    saveOutput = false,
    outputsDir,
    originalTranscriptPath,
    commandFile = getCommandFilePath(),
    spawner = spawn,
  } = options;

  // Use --system-prompt-file instead of slash command (slash commands don't work with --print)
  // Minimal permissions: Read (transcript + existing skills), Write (skills dir only), Glob/Grep (find skills)
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const args = [
    '--model', 'sonnet',
    '-p', `Extract skills from transcript at: ${transcriptPath}`,
    '--system-prompt-file', commandFile,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', `Read,Write(${homeDir}/.claude/skills/**),Glob,Grep`,
  ];

  return new Promise((resolve, reject) => {
    const child = spawner('claude', args, {
      stdio: saveOutput ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'ignore'],
    });

    let outputFile;
    let outputChunks = [];

    // Handle spawn errors (e.g., command not found)
    child.on('error', (err) => {
      reject(err);
    });

    // When saving output, collect stdout/stderr
    if (saveOutput && child.stdout && child.stderr) {
      child.stdout.on('data', (data) => {
        outputChunks.push(data);
      });
      child.stderr.on('data', (data) => {
        outputChunks.push(data);
      });
    }

    child.on('close', (code) => {
      // Write collected output to individual file
      if (saveOutput && outputChunks.length > 0 && outputsDir) {
        const timestamp = generateOutputTimestamp();
        const basename = path.basename(originalTranscriptPath || transcriptPath, '.jsonl');
        outputFile = path.join(outputsDir, `${timestamp}-${basename}.log`);

        // Ensure outputs directory exists
        fs.mkdirSync(outputsDir, { recursive: true });
        fs.writeFileSync(outputFile, Buffer.concat(outputChunks));
      }

      resolve({ exitCode: code ?? 0, outputFile });
    });
  });
}

// =============================================================================
// Main Processing
// =============================================================================

/**
 * Process a single transcript through the skill extraction pipeline
 * @param {Object} options
 * @param {string} options.transcriptPath - Path to the transcript file
 * @param {function(...args): void} options.log - Logging function
 * @param {{ TRUNCATE_LINES: number, SAVE_OUTPUT: boolean }} options.config - Configuration
 * @param {string} options.outputsDir - Directory for output files
 * @param {function} [options.spawner] - Optional spawn function for testing (passed to runAnalysis)
 * @returns {Promise<{ success: boolean, exitCode?: number }>}
 */
export async function processTranscript({ transcriptPath, log, config, outputsDir, spawner }) {
  log(`Processing: ${transcriptPath}`);

  // Preprocess transcript
  log('  Preprocessing transcript...');
  const preprocessedFile = preprocessTranscript(transcriptPath, { truncateLines: config.TRUNCATE_LINES });

  // Log size reduction
  const originalSize = fs.statSync(transcriptPath).size;
  const preprocessedSize = fs.statSync(preprocessedFile).size;
  const reduction = originalSize > 0 ? Math.round(100 - (preprocessedSize * 100 / originalSize)) : 0;
  log(`  Reduced from ${originalSize} to ${preprocessedSize} bytes (${reduction}% reduction)`);

  // Run analysis and track duration
  log('  Starting skill extraction...');
  const startTime = Date.now();

  let result;
  try {
    result = await runAnalysis(preprocessedFile, {
      saveOutput: config.SAVE_OUTPUT,
      outputsDir,
      originalTranscriptPath: transcriptPath,
      spawner,
    });
  } finally {
    // Always clean up temp file
    try {
      fs.unlinkSync(preprocessedFile);
    } catch (err) {
      // Ignore cleanup errors
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  const { exitCode } = result;

  if (exitCode === 0) {
    log(`  Completed in ${duration}s`);
    return { success: true };
  } else {
    log(`  Failed (exit ${exitCode}) in ${duration}s`);
    return { success: false, exitCode };
  }
}

/**
 * Main entry point for skill manager (worker mode)
 * Processes a single transcript from hook input
 *
 * @param {Object} options
 * @param {string} options.transcriptPath - Path to the transcript file
 * @param {function(...args): void} options.log - Logging function
 * @param {{ TRUNCATE_LINES: number, MIN_LINES: number, SAVE_OUTPUT: boolean }} options.config - Configuration
 * @param {string} options.stateDir - Path to state directory
 * @param {string} options.outputsDir - Directory for output files
 * @param {function} [options.spawner] - Optional spawn function for testing (passed to processTranscript)
 * @returns {Promise<number>} - Exit code (0 for success)
 */
export async function main({ transcriptPath: rawTranscriptPath, log, config, stateDir, outputsDir, spawner }) {
  // Expand tilde in transcript path
  const transcriptPath = expandTilde(rawTranscriptPath);

  // Ensure state directory exists
  fs.mkdirSync(stateDir, { recursive: true });

  // Clean up old logs
  cleanupOldLogs(stateDir);

  // Check if transcript exists
  if (!fs.existsSync(transcriptPath)) {
    log(`Skipped (file missing): ${transcriptPath}`);
    return 0;
  }

  // Check if this is a subagent session
  if (isSubagent(transcriptPath)) {
    log(`Skipped (subagent): ${transcriptPath}`);
    return 0;
  }

  // Check if this is a skill-manager session (prevent infinite loops)
  if (isSkillManagerSession(transcriptPath)) {
    log(`Skipped (skill-manager session): ${transcriptPath}`);
    return 0;
  }

  // Check minimum lines
  const lineCount = countLines(transcriptPath);
  if (lineCount < config.MIN_LINES) {
    log(`Skipped (${lineCount} lines < ${config.MIN_LINES} minimum): ${transcriptPath}`);
    return 0;
  }

  // Process the transcript
  const result = await processTranscript({
    transcriptPath,
    log,
    config,
    outputsDir,
    spawner,
  });

  log('=== Processing complete ===');
  return result.success ? 0 : 1;
}

// =============================================================================
// Script Entry Point
// =============================================================================

// Detect if running directly (not imported as module)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const paths = buildPaths();
  const config = loadConfig();
  const logFn = (...args) => log(paths.LOG_FILE, ...args);

  // Detect execution context:
  // - TTY (interactive terminal): expect transcript path as argument
  // - Piped stdin (hook context): parse JSON from stdin, spawn detached child
  // - --worker flag with path: internal flag for spawned child process
  const isWorker = process.argv.includes('--worker');
  const isInteractive = process.stdin.isTTY;

  if (isWorker) {
    // Worker mode: transcript path passed as argument after --worker
    const workerIndex = process.argv.indexOf('--worker');
    const transcriptPath = process.argv[workerIndex + 1];

    if (!transcriptPath) {
      logFn('Error: No transcript path provided to worker');
      process.exit(1);
    }

    main({
      transcriptPath,
      log: logFn,
      config,
      stateDir: paths.STATE_DIR,
      outputsDir: paths.OUTPUTS_DIR,
    }).then((code) => {
      process.exit(code);
    }).catch((err) => {
      logFn('Error:', err.message);
      process.exit(1);
    });
  } else if (isInteractive) {
    // Interactive mode: require transcript path as argument
    const transcriptPath = process.argv[2];

    if (!transcriptPath) {
      console.error('Usage: trigger.js <transcript_path>');
      console.error('  Or pipe SessionEnd hook JSON to stdin');
      process.exit(1);
    }

    logFn('=== Manual run ===');

    main({
      transcriptPath,
      log: logFn,
      config,
      stateDir: paths.STATE_DIR,
      outputsDir: paths.OUTPUTS_DIR,
    }).then((code) => {
      process.exit(code);
    }).catch((err) => {
      logFn('Error:', err.message);
      process.exit(1);
    });
  } else {
    // Hook context - parse stdin, spawn detached child
    logFn('=== Skill extraction triggered ===');

    parseHookInput(process.stdin).then((input) => {
      if (!input || !input.transcriptPath) {
        logFn('No transcript_path in hook input, skipping');
        process.exit(0);
      }

      logFn(`Received transcript_path: ${input.transcriptPath}`);

      // Spawn detached child process with --worker flag and transcript path
      const child = spawn(process.execPath, [process.argv[1], '--worker', input.transcriptPath], {
        detached: true,
        stdio: 'ignore',
      });

      // Handle spawn errors (e.g., if node executable not found)
      child.on('error', (err) => {
        logFn(`Error spawning worker: ${err.message}`);
        process.exit(1);
      });

      child.unref();

      logFn('Background processing started');
      process.exit(0);
    });
  }
}
