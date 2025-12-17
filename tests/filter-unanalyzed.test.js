/**
 * Tests for filterUnanalyzed function
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { filterUnanalyzed } from '../scripts/trigger.js';

describe('filterUnanalyzed', () => {
  it('should filter out transcripts present in state file', () => {
    const transcripts = [
      '/home/user/.claude/projects/proj-a/transcript.jsonl',
      '/home/user/.claude/projects/proj-b/transcript.jsonl',
      '/home/user/.claude/projects/proj-c/transcript.jsonl',
    ];

    const state = {
      version: 1,
      transcripts: {
        '/home/user/.claude/projects/proj-a/transcript.jsonl': {
          status: 'completed',
          analyzed_at: '2024-01-15T10:00:00Z',
        },
        '/home/user/.claude/projects/proj-c/transcript.jsonl': {
          status: 'completed',
          analyzed_at: '2024-01-14T10:00:00Z',
        },
      },
    };

    const result = filterUnanalyzed(transcripts, state, 10);

    assert.strictEqual(result.length, 1, 'Should only return unanalyzed transcript');
    assert.strictEqual(
      result[0],
      '/home/user/.claude/projects/proj-b/transcript.jsonl',
      'Should return only proj-b which is not in state'
    );
  });

  it('should keep transcripts not in state file', () => {
    const transcripts = [
      '/path/to/new-transcript-1.jsonl',
      '/path/to/new-transcript-2.jsonl',
      '/path/to/new-transcript-3.jsonl',
    ];

    const state = {
      version: 1,
      transcripts: {
        '/path/to/old-transcript.jsonl': {
          status: 'completed',
          analyzed_at: '2024-01-10T10:00:00Z',
        },
      },
    };

    const result = filterUnanalyzed(transcripts, state, 10);

    assert.strictEqual(result.length, 3, 'Should keep all transcripts not in state');
    assert.deepStrictEqual(result, transcripts, 'Should return all transcripts unchanged');
  });

  it('should respect TRANSCRIPT_COUNT limit', () => {
    const transcripts = [
      '/path/to/transcript-1.jsonl',
      '/path/to/transcript-2.jsonl',
      '/path/to/transcript-3.jsonl',
      '/path/to/transcript-4.jsonl',
      '/path/to/transcript-5.jsonl',
    ];

    const state = {
      version: 1,
      transcripts: {},
    };

    // Limit to 2
    const result = filterUnanalyzed(transcripts, state, 2);

    assert.strictEqual(result.length, 2, 'Should limit to TRANSCRIPT_COUNT');
    assert.strictEqual(result[0], transcripts[0], 'Should return first unanalyzed');
    assert.strictEqual(result[1], transcripts[1], 'Should return second unanalyzed');
  });

  it('should return empty array if all transcripts analyzed', () => {
    const transcripts = [
      '/path/to/transcript-a.jsonl',
      '/path/to/transcript-b.jsonl',
    ];

    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript-a.jsonl': {
          status: 'completed',
          analyzed_at: '2024-01-15T10:00:00Z',
        },
        '/path/to/transcript-b.jsonl': {
          status: 'failed',
          failed_at: '2024-01-14T10:00:00Z',
          exit_code: 1,
        },
      },
    };

    const result = filterUnanalyzed(transcripts, state, 10);

    assert.deepStrictEqual(result, [], 'Should return empty array when all are analyzed');
  });

  it('should check by exact path match', () => {
    const transcripts = [
      '/path/to/project/transcript.jsonl',
      '/path/to/project-2/transcript.jsonl',
      '/path/to/project/nested/transcript.jsonl',
    ];

    const state = {
      version: 1,
      transcripts: {
        // Partial match - should NOT filter out '/path/to/project/transcript.jsonl'
        '/path/to/project': { status: 'completed' },
        // Different path - should NOT filter out '/path/to/project-2/transcript.jsonl'
        '/path/to/project-2/other.jsonl': { status: 'completed' },
        // Exact match - SHOULD filter out this one
        '/path/to/project/nested/transcript.jsonl': { status: 'completed' },
      },
    };

    const result = filterUnanalyzed(transcripts, state, 10);

    assert.strictEqual(result.length, 2, 'Should only filter by exact path match');
    assert.ok(
      result.includes('/path/to/project/transcript.jsonl'),
      'Should include transcript (partial match in state does not filter it)'
    );
    assert.ok(
      result.includes('/path/to/project-2/transcript.jsonl'),
      'Should include project-2 transcript (different path in state)'
    );
    assert.ok(
      !result.includes('/path/to/project/nested/transcript.jsonl'),
      'Should NOT include nested transcript (exact match in state)'
    );
  });

  it('should handle empty transcripts array', () => {
    const state = {
      version: 1,
      transcripts: {
        '/some/path.jsonl': { status: 'completed' },
      },
    };

    const result = filterUnanalyzed([], state, 10);

    assert.deepStrictEqual(result, [], 'Should return empty array for empty input');
  });

  it('should handle empty state transcripts object', () => {
    const transcripts = ['/path/to/transcript.jsonl'];

    const state = {
      version: 1,
      transcripts: {},
    };

    const result = filterUnanalyzed(transcripts, state, 10);

    assert.deepStrictEqual(result, transcripts, 'Should return all transcripts when state is empty');
  });

  it('should include transcripts with any status in state (completed, failed, in_progress)', () => {
    const transcripts = [
      '/path/completed.jsonl',
      '/path/failed.jsonl',
      '/path/in_progress.jsonl',
      '/path/new.jsonl',
    ];

    const state = {
      version: 1,
      transcripts: {
        '/path/completed.jsonl': { status: 'completed', analyzed_at: '2024-01-15T10:00:00Z' },
        '/path/failed.jsonl': { status: 'failed', failed_at: '2024-01-14T10:00:00Z' },
        '/path/in_progress.jsonl': { status: 'in_progress', started_at: '2024-01-16T10:00:00Z' },
      },
    };

    const result = filterUnanalyzed(transcripts, state, 10);

    assert.strictEqual(result.length, 1, 'Should filter out all statuses');
    assert.strictEqual(result[0], '/path/new.jsonl', 'Should only return new transcript');
  });
});
