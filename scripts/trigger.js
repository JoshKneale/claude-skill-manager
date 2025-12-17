#!/usr/bin/env node
// Cross-platform trigger for Skill Manager

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// =============================================================================
// Configuration Loading
// =============================================================================

/**
 * Load configuration from environment variables with defaults
 * @returns {{ TRANSCRIPT_COUNT: number, LOOKBACK_DAYS: number, TRUNCATE_LINES: number, MIN_TRANSCRIPT_LINES: number, SKIP_SUBAGENTS: boolean }}
 */
export function loadConfig() {
  return {
    TRANSCRIPT_COUNT: parseInt(process.env.SKILL_MANAGER_COUNT, 10) || 1,
    LOOKBACK_DAYS: parseInt(process.env.SKILL_MANAGER_LOOKBACK_DAYS, 10) || 7,
    TRUNCATE_LINES: parseInt(process.env.SKILL_MANAGER_TRUNCATE_LINES, 10) || 30,
    MIN_TRANSCRIPT_LINES: parseInt(process.env.SKILL_MANAGER_MIN_LINES, 10) || 10,
    SKIP_SUBAGENTS: process.env.SKILL_MANAGER_SKIP_SUBAGENTS !== '0', // default: true
  };
}

// =============================================================================
// Path Construction
// =============================================================================

/**
 * Build standard paths used by skill manager
 * @returns {{ STATE_DIR: string, STATE_FILE: string, LOG_FILE: string, PROJECTS_DIR: string }}
 */
export function buildPaths() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const stateDir = `${homeDir}/.claude/skill-manager`;
  const today = new Date().toISOString().slice(0, 10);

  return {
    STATE_DIR: stateDir,
    STATE_FILE: `${stateDir}/analyzed.json`,
    LOG_FILE: `${stateDir}/skill-manager-${today}.log`,
    PROJECTS_DIR: `${homeDir}/.claude/projects`,
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
// Locking
// =============================================================================

/**
 * Acquire lock atomically using directory creation (portable across platforms)
 * Equivalent to: mkdir "$LOCK_DIR" 2>/dev/null && echo $$ > "${LOCK_DIR}/pid"
 * @param {string} stateDir - The state directory path
 * @returns {boolean} - true if lock acquired, false if already held
 */
export function acquireLock(stateDir) {
  const lockDir = path.join(stateDir, 'skill-manager.lock.d');

  try {
    // mkdir without recursive: true will fail if directory exists (atomic)
    fs.mkdirSync(lockDir);
    // Write PID to lock directory
    fs.writeFileSync(path.join(lockDir, 'pid'), String(process.pid));
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Lock already held by another process
      return false;
    }
    throw err;
  }
}

/**
 * Release lock by removing the lock directory
 * Equivalent to: rm -rf "$LOCK_DIR"
 * @param {string} stateDir - The state directory path
 */
export function releaseLock(stateDir) {
  const lockDir = path.join(stateDir, 'skill-manager.lock.d');

  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore errors - lock may already be released
  }
}

// =============================================================================
// Directory Management
// =============================================================================

/**
 * Ensure required directories exist (creates recursively if needed)
 * Equivalent to: mkdir -p "$STATE_DIR"
 */
export function ensureDirectories() {
  const { STATE_DIR } = buildPaths();
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * Initialize state file if missing or corrupted
 * Creates {version:1,transcripts:{}} if file doesn't exist or contains invalid JSON
 * Equivalent to:
 *   if [ ! -f "$STATE_FILE" ]; then echo '{"version":1,"transcripts":{}}' > "$STATE_FILE"; fi
 *   if ! jq empty "$STATE_FILE" 2>/dev/null; then echo '{"version":1,"transcripts":{}}' > "$STATE_FILE"; fi
 * @param {string} stateFilePath - Path to the state file
 */
export function initStateFile(stateFilePath) {
  const initialState = { version: 1, transcripts: {} };

  // Check if file exists
  if (!fs.existsSync(stateFilePath)) {
    fs.writeFileSync(stateFilePath, JSON.stringify(initialState));
    return;
  }

  // File exists - validate it's valid JSON
  try {
    const content = fs.readFileSync(stateFilePath, 'utf8');
    JSON.parse(content);
    // Valid JSON - don't modify
  } catch (err) {
    // Invalid JSON or empty file - reinitialize
    fs.writeFileSync(stateFilePath, JSON.stringify(initialState));
  }
}

/**
 * Read and parse state file
 * @param {string} stateFilePath - Path to the state file
 * @returns {{ version: number, transcripts: Object }|null} - Parsed state object, or null if file doesn't exist
 * @throws {SyntaxError} - If file contains invalid JSON
 */
export function readStateFile(stateFilePath) {
  try {
    const content = fs.readFileSync(stateFilePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Validate that a state file exists and has correct structure
 * @param {string} stateFilePath - Path to the state file
 * @returns {boolean} - true if valid, false otherwise
 */
export function validateStateFile(stateFilePath) {
  try {
    const content = fs.readFileSync(stateFilePath, 'utf8');
    const state = JSON.parse(content);

    // Check version is a number
    if (typeof state.version !== 'number') {
      return false;
    }

    // Check transcripts is a plain object (not null, not array)
    if (
      state.transcripts === null ||
      typeof state.transcripts !== 'object' ||
      Array.isArray(state.transcripts)
    ) {
      return false;
    }

    return true;
  } catch (err) {
    // File doesn't exist, can't be read, or invalid JSON
    return false;
  }
}

/**
 * Write state file atomically using temp file + rename pattern
 * @param {string} stateFilePath - Path to the state file
 * @param {{ version: number, transcripts: Object }} state - State object to write
 */
export function writeStateFile(stateFilePath, state) {
  // Ensure parent directory exists
  const parentDir = path.dirname(stateFilePath);
  fs.mkdirSync(parentDir, { recursive: true });

  // Write to temp file first (atomic write pattern)
  const tempFile = `${stateFilePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(state));
    // Atomic rename
    fs.renameSync(tempFile, stateFilePath);
  } catch (err) {
    // Clean up temp file on error
    try {
      fs.unlinkSync(tempFile);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Delete log files older than 7 days
 * Equivalent to: find "$STATE_DIR" -name "skill-manager-*.log" -mtime +7 -delete 2>/dev/null || true
 * @param {string} stateDir - The state directory path
 */
export function cleanupOldLogs(stateDir) {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - SEVEN_DAYS_MS;

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
}

// =============================================================================
// File Modification Time
// =============================================================================

/**
 * Get file modification time in seconds (Unix timestamp)
 * @param {string} filePath - Path to the file
 * @returns {number|null} - mtime in seconds, or null if file doesn't exist
 */
export function getMtime(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Math.floor(stat.mtimeMs / 1000);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

// =============================================================================
// Transcript Discovery
// =============================================================================

/**
 * Recursively find all .jsonl files in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} results - Accumulator for results
 * @returns {string[]} - Array of file paths
 */
function findJsonlFiles(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // Directory doesn't exist or can't be read
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findJsonlFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Discover recent transcript files from projects directory
 * Equivalent to: find "$PROJECTS_DIR" -name "*.jsonl" -mtime -$LOOKBACK_DAYS -type f
 * @param {string} projectsDir - Path to projects directory
 * @param {number} lookbackDays - Only include transcripts modified within N days
 * @returns {string[]} - Array of transcript paths, sorted by mtime descending, limited to 50
 */
export function discoverTranscripts(projectsDir, lookbackDays) {
  // Find all .jsonl files recursively
  const allFiles = findJsonlFiles(projectsDir);

  if (allFiles.length === 0) {
    return [];
  }

  // Calculate cutoff time
  const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  // Get mtime for each file and filter by lookback window
  const filesWithMtime = [];
  for (const filePath of allFiles) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs >= cutoffMs) {
        filesWithMtime.push({ path: filePath, mtimeMs: stat.mtimeMs });
      }
    } catch (err) {
      // File may have been deleted - skip it
    }
  }

  // Sort by mtime descending (newest first)
  filesWithMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Limit to 50 and return just the paths
  return filesWithMtime.slice(0, 50).map((f) => f.path);
}

// =============================================================================
// Transcript Filtering
// =============================================================================

/**
 * Check if a transcript is a skill-manager session (should be skipped)
 * Reads first ~2KB and looks for skill-manager markers to avoid analyzing our own sessions
 * @param {string} transcriptPath - Path to the transcript file
 * @returns {boolean} - true if this is a skill-manager session, false otherwise
 */
export function isSkillManagerSession(transcriptPath) {
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    const buffer = Buffer.alloc(2048);
    const bytesRead = fs.readSync(fd, buffer, 0, 2048, 0);
    fs.closeSync(fd);

    const head = buffer.toString('utf8', 0, bytesRead);

    // Check for skill-manager specific markers
    return (
      head.includes('Extract skills from transcript at:') ||
      head.includes('skill-manager.md') ||
      head.includes('Skill Manager') && head.includes('analyzing a Claude Code conversation transcript')
    );
  } catch (err) {
    // If we can't read the file, don't skip it (let later stages handle the error)
    return false;
  }
}

/**
 * Check if a transcript is too short to be worth analyzing
 * Counts non-empty lines in the JSONL file
 * @param {string} transcriptPath - Path to the transcript file
 * @param {number} minLines - Minimum number of lines required (default: 10)
 * @returns {boolean} - true if transcript is too short, false otherwise
 */
export function isMinimalTranscript(transcriptPath, minLines = 10) {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lineCount = content.split('\n').filter(line => line.trim()).length;
    return lineCount < minLines;
  } catch (err) {
    // If we can't read the file, don't skip it (let later stages handle the error)
    return false;
  }
}

/**
 * Check if a transcript is a sub-agent session (spawned by Task tool)
 * Sub-agents have filenames starting with "agent-"
 * @param {string} transcriptPath - Path to the transcript file
 * @returns {boolean} - true if this is a sub-agent session, false otherwise
 */
export function isSubagentSession(transcriptPath) {
  const filename = path.basename(transcriptPath);
  return filename.startsWith('agent-');
}

/**
 * Filter transcripts to only those not already in state file
 * Also skips skill-manager's own sessions, minimal transcripts, and optionally sub-agents
 * Equivalent to: checking if jq -e --arg path "$transcript" '.transcripts[$path]' returns false
 * @param {string[]} transcripts - Array of transcript paths to filter
 * @param {{ version: number, transcripts: Object }} state - State object with transcripts map
 * @param {number} limit - Maximum number of unanalyzed transcripts to return
 * @param {{ minLines?: number, skipSubagents?: boolean }} [options] - Filter options
 * @returns {string[]} - Array of unanalyzed transcript paths, limited to `limit`
 */
export function filterUnanalyzed(transcripts, state, limit, options = {}) {
  const { minLines = 10, skipSubagents = true } = options;
  const result = [];

  for (const transcript of transcripts) {
    // Check if transcript path exists as key in state.transcripts
    if (!(transcript in state.transcripts)) {
      // Skip skill-manager's own sessions
      if (isSkillManagerSession(transcript)) {
        continue;
      }
      // Skip sub-agent sessions if configured
      if (skipSubagents && isSubagentSession(transcript)) {
        continue;
      }
      // Skip transcripts that are too short
      if (isMinimalTranscript(transcript, minLines)) {
        continue;
      }
      result.push(transcript);
      // Stop once we have enough
      if (result.length >= limit) {
        break;
      }
    }
  }

  return result;
}

// =============================================================================
// State Management
// =============================================================================

/**
 * Mark a transcript as completed in state
 * Sets status to "completed", adds analyzed_at timestamp, removes in_progress fields
 * @param {{ version: number, transcripts: Object }} state - Current state object
 * @param {string} transcriptPath - Path to the transcript file
 * @returns {{ version: number, transcripts: Object }} - New state object (does not mutate original)
 */
export function markTranscriptCompleted(state, transcriptPath) {
  // Get existing entry or empty object
  const existingEntry = state.transcripts[transcriptPath] || {};

  // Build new entry: remove in_progress fields (started_at), add completed fields
  const { started_at, ...rest } = existingEntry;

  const newEntry = {
    ...rest,
    status: 'completed',
    analyzed_at: new Date().toISOString(),
  };

  return {
    ...state,
    transcripts: {
      ...state.transcripts,
      [transcriptPath]: newEntry,
    },
  };
}

/**
 * Mark a transcript as failed in state
 * Sets status to "failed", adds failed_at timestamp, exit_code, removes in_progress fields
 * @param {{ version: number, transcripts: Object }} state - Current state object
 * @param {string} transcriptPath - Path to the transcript file
 * @param {number} exitCode - The exit code from the failed process
 * @returns {{ version: number, transcripts: Object }} - New state object (does not mutate original)
 */
export function markTranscriptFailed(state, transcriptPath, exitCode) {
  // Get existing entry or empty object
  const existingEntry = state.transcripts[transcriptPath] || {};

  // Build new entry: remove in_progress fields (started_at), add failed fields
  const { started_at, ...rest } = existingEntry;

  const newEntry = {
    ...rest,
    status: 'failed',
    failed_at: new Date().toISOString(),
    exit_code: exitCode,
  };

  return {
    ...state,
    transcripts: {
      ...state.transcripts,
      [transcriptPath]: newEntry,
    },
  };
}

/**
 * Mark a transcript as in_progress in state
 * Sets status to "in_progress", adds started_at timestamp
 * @param {{ version: number, transcripts: Object }} state - Current state object
 * @param {string} transcriptPath - Path to the transcript file
 * @returns {{ version: number, transcripts: Object }} - New state object (does not mutate original)
 */
export function markTranscriptInProgress(state, transcriptPath) {
  const newEntry = {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  };

  return {
    ...state,
    transcripts: {
      ...state.transcripts,
      [transcriptPath]: newEntry,
    },
  };
}

// =============================================================================
// Transcript Preprocessing
// =============================================================================

/**
 * Truncate text content if it exceeds the threshold
 * Keeps first N and last N lines, inserts truncation marker
 * @param {string} text - The text to potentially truncate
 * @param {number} truncateLines - Number of lines to keep at start and end
 * @returns {string} - Original or truncated text
 */
function truncateText(text, truncateLines) {
  const lines = text.split('\n');
  const threshold = truncateLines * 2;

  if (lines.length <= threshold) {
    return text;
  }

  const truncatedCount = lines.length - threshold;
  const firstLines = lines.slice(0, truncateLines);
  const lastLines = lines.slice(-truncateLines);
  const marker = `... [truncated ${truncatedCount} lines] ...`;

  return [...firstLines, '', marker, '', ...lastLines].join('\n');
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

  // Write to temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `preprocessed-transcript-${Date.now()}-${process.pid}.jsonl`
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
 * Run skill extraction analysis on a preprocessed transcript
 * Spawns claude CLI with appropriate flags and handles output based on debug mode
 *
 * @param {string} transcriptPath - Path to the preprocessed transcript file
 * @param {Object} options
 * @param {string} options.logFile - Path to log file (used in debug mode)
 * @param {string} [options.commandFile] - Path to command file (defaults to ../commands/skill-manager.md)
 * @param {function} [options.spawner] - Optional spawn function for testing (defaults to child_process.spawn)
 * @returns {Promise<{ exitCode: number }>} - Exit code from claude process
 */
export async function runAnalysis(transcriptPath, options) {
  const { logFile, commandFile = getCommandFilePath(), spawner = spawn } = options;
  const isDebugMode = process.env.SKILL_MANAGER_DEBUG === '1';

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

  return new Promise((resolve) => {
    const child = spawner('claude', args, {
      stdio: isDebugMode ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'ignore'],
    });

    // In debug mode, capture output to log file
    if (isDebugMode && child.stdout && child.stderr) {
      child.stdout.on('data', (data) => {
        fs.appendFileSync(logFile, data.toString());
      });
      child.stderr.on('data', (data) => {
        fs.appendFileSync(logFile, data.toString());
      });
    }

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 0 });
    });
  });
}

// =============================================================================
// Transcript Processing
// =============================================================================

/**
 * Process a single transcript through the skill extraction pipeline
 * - Checks if file exists (skips if missing)
 * - Marks transcript as in_progress
 * - Preprocesses transcript to reduce tokens
 * - Runs analysis via runAnalysis callback
 * - Cleans up temp files
 * - Marks as completed or failed
 *
 * @param {Object} options
 * @param {string} options.transcriptPath - Path to the transcript file
 * @param {{ version: number, transcripts: Object }} options.state - Current state object
 * @param {string} options.stateFile - Path to the state file
 * @param {function(string): void} options.log - Logging function
 * @param {function(string): { exitCode: number }} options.runAnalysis - Function to run analysis on preprocessed file
 * @param {{ TRUNCATE_LINES: number }} options.config - Configuration options
 * @returns {Promise<{ success?: boolean, skipped?: boolean, reason?: string, transcriptPath: string, exitCode?: number }>}
 */
export async function processTranscript({ transcriptPath, state, stateFile, log, runAnalysis, config }) {
  // Check if file exists
  if (!fs.existsSync(transcriptPath)) {
    log(`  Skipped (file missing): ${transcriptPath}`);
    return { skipped: true, reason: 'file_missing', transcriptPath };
  }

  log(`Processing: ${transcriptPath}`);

  // Mark as in_progress
  const inProgressState = markTranscriptInProgress(state, transcriptPath);
  writeStateFile(stateFile, inProgressState);

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
    result = await runAnalysis(preprocessedFile);
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

  // Update state based on result
  if (exitCode === 0) {
    log(`  Completed in ${duration}s: ${transcriptPath}`);
    const completedState = markTranscriptCompleted(inProgressState, transcriptPath);
    writeStateFile(stateFile, completedState);
    return { success: true, transcriptPath };
  } else {
    log(`  Failed (exit ${exitCode}) in ${duration}s: ${transcriptPath}`);
    const failedState = markTranscriptFailed(inProgressState, transcriptPath, exitCode);
    writeStateFile(stateFile, failedState);
    return { success: false, transcriptPath, exitCode };
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Main entry point for skill manager
 * Orchestrates the full transcript analysis pipeline:
 * 1. Initialize directories and state
 * 2. Clean up old logs
 * 3. Check dependencies
 * 4. Discover and filter transcripts
 * 5. Acquire lock and process transcripts
 * 6. Release lock on completion or error
 *
 * @param {Object} options
 * @param {string} options.stateDir - Path to state directory
 * @param {string} options.projectsDir - Path to projects directory
 * @param {function(string): void} options.log - Logging function
 * @param {function(string): Promise<{ exitCode: number }>} options.runAnalysis - Function to run analysis
 * @param {{ TRANSCRIPT_COUNT: number, LOOKBACK_DAYS: number, TRUNCATE_LINES: number }} options.config - Configuration
 * @param {{ resume: function, on: function }} [options.stdin] - Optional stdin stream for hook compliance
 * @returns {Promise<number|undefined>} - Exit code (0 for success/graceful exit)
 */
export async function main({ stateDir, projectsDir, log, runAnalysis, config, stdin }) {
  // Drain stdin for hook compliance (prevents hanging)
  if (stdin) {
    stdin.resume();
  }

  // 1. Ensure directories exist
  fs.mkdirSync(stateDir, { recursive: true });

  // 2. Clean up old logs
  cleanupOldLogs(stateDir);

  // 3. Initialize state file
  const stateFile = path.join(stateDir, 'analyzed.json');
  initStateFile(stateFile);

  // 4. Discover transcripts
  const transcripts = discoverTranscripts(projectsDir, config.LOOKBACK_DAYS);

  if (transcripts.length === 0) {
    log('No transcripts found in projects directory');
    return 0;
  }

  // 5. Read state and filter to unanalyzed transcripts
  const state = readStateFile(stateFile);
  const unanalyzed = filterUnanalyzed(transcripts, state, config.TRANSCRIPT_COUNT, {
    minLines: config.MIN_TRANSCRIPT_LINES,
    skipSubagents: config.SKIP_SUBAGENTS,
  });

  if (unanalyzed.length === 0) {
    log('All transcripts already analyzed');
    return 0;
  }

  // 6. Acquire lock
  const lockAcquired = acquireLock(stateDir);
  if (!lockAcquired) {
    log('Another instance is already running (lock held)');
    return 0;
  }

  // 7. Process transcripts (with lock held)
  try {
    for (const transcriptPath of unanalyzed) {
      // Re-read state for each transcript (in case it changed)
      const currentState = readStateFile(stateFile);

      await processTranscript({
        transcriptPath,
        state: currentState,
        stateFile,
        log,
        runAnalysis,
        config,
      });
    }
  } finally {
    // 8. Always release lock
    releaseLock(stateDir);
  }

  log('=== Processing complete ===');
  return 0;
}

// =============================================================================
// Script Entry Point
// =============================================================================

// Detect if running directly (not imported as module)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  // Check for --background flag (child process mode)
  if (process.argv.includes('--background')) {
    // Running as background worker - do the actual work
    const paths = buildPaths();
    const config = loadConfig();
    const logFn = (...args) => log(paths.LOG_FILE, ...args);

    main({
      stateDir: paths.STATE_DIR,
      projectsDir: paths.PROJECTS_DIR,
      log: logFn,
      runAnalysis: (transcriptPath) => runAnalysis(transcriptPath, { logFile: paths.LOG_FILE }),
      config,
      stdin: process.stdin,
    }).catch((err) => {
      logFn('Error:', err.message);
      process.exit(1);
    });
  } else {
    // Parent process - spawn child and exit immediately
    const paths = buildPaths();
    const logFn = (...args) => log(paths.LOG_FILE, ...args);

    logFn('=== SessionEnd triggered ===');

    // Drain stdin for hook compliance
    process.stdin.resume();
    process.stdin.on('end', () => {
      // Spawn detached child process
      const child = spawn(process.execPath, [process.argv[1], '--background'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      logFn('Background processing started');
      process.exit(0);
    });
  }
}
