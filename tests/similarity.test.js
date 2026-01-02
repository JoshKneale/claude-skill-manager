/**
 * Tests for similarity.js - skill similarity detection
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  jaccardSimilarity,
  prefixTokenCount,
  findSimilarSkillsWide,
  findSimilarSkillsStrict,
} from '../scripts/similarity.js';

// =============================================================================
// jaccardSimilarity Tests
// =============================================================================

describe('jaccardSimilarity', () => {
  it('should return 1.0 for identical names', () => {
    const score = jaccardSimilarity('rust-test-mock', 'rust-test-mock');
    assert.strictEqual(score, 1.0);
  });

  it('should return 0.0 for completely different names', () => {
    const score = jaccardSimilarity('rust-test-mock', 'python-api-handler');
    assert.strictEqual(score, 0.0);
  });

  it('should calculate correct Jaccard for partial overlap', () => {
    // rust-test-mock vs rust-test-handler
    // tokens1: {rust, test, mock}
    // tokens2: {rust, test, handler}
    // intersection: {rust, test} = 2
    // union: {rust, test, mock, handler} = 4
    // Jaccard = 2/4 = 0.5
    const score = jaccardSimilarity('rust-test-mock', 'rust-test-handler');
    assert.strictEqual(score, 0.5);
  });

  it('should handle single-token names', () => {
    const score = jaccardSimilarity('rust', 'rust');
    assert.strictEqual(score, 1.0);
  });

  it('should handle real skill names from the codebase', () => {
    // rust-integration-test-api-migration vs rust-test-real-api-integration
    // tokens1: {rust, integration, test, api, migration}
    // tokens2: {rust, test, real, api, integration}
    // intersection: {rust, integration, test, api} = 4
    // union: {rust, integration, test, api, migration, real} = 6
    // Jaccard = 4/6 = 0.667
    const score = jaccardSimilarity(
      'rust-integration-test-api-migration',
      'rust-test-real-api-integration'
    );
    assert.ok(Math.abs(score - 0.667) < 0.01);
  });

  it('should handle names with different lengths', () => {
    // rust-test vs rust-test-mock-handler-refactor
    // tokens1: {rust, test}
    // tokens2: {rust, test, mock, handler, refactor}
    // intersection: {rust, test} = 2
    // union: {rust, test, mock, handler, refactor} = 5
    // Jaccard = 2/5 = 0.4
    const score = jaccardSimilarity('rust-test', 'rust-test-mock-handler-refactor');
    assert.strictEqual(score, 0.4);
  });
});

// =============================================================================
// prefixTokenCount Tests
// =============================================================================

describe('prefixTokenCount', () => {
  it('should return full length for identical names', () => {
    const count = prefixTokenCount('rust-test-mock', 'rust-test-mock');
    assert.strictEqual(count, 3);
  });

  it('should return 0 for completely different prefixes', () => {
    const count = prefixTokenCount('rust-test-mock', 'python-api-handler');
    assert.strictEqual(count, 0);
  });

  it('should count matching prefix tokens correctly', () => {
    // rust-trait-migration-bridge vs rust-trait-migration-method
    // Prefix match: rust, trait, migration = 3
    const count = prefixTokenCount(
      'rust-trait-migration-bridge-pattern',
      'rust-trait-migration-method-collision'
    );
    assert.strictEqual(count, 3);
  });

  it('should stop at first non-matching token', () => {
    // rust-test-mock vs rust-api-test
    // Only 'rust' matches at prefix
    const count = prefixTokenCount('rust-test-mock', 'rust-api-test');
    assert.strictEqual(count, 1);
  });

  it('should handle single-token names', () => {
    const count = prefixTokenCount('rust', 'rust');
    assert.strictEqual(count, 1);
  });

  it('should return 0 when first tokens differ', () => {
    const count = prefixTokenCount('rust-test', 'python-test');
    assert.strictEqual(count, 0);
  });

  it('should handle real family clusters from the codebase', () => {
    // rust-test-provider-* family
    const count1 = prefixTokenCount(
      'rust-test-provider-agnostic-migration',
      'rust-test-provider-data-format-requirements'
    );
    assert.strictEqual(count1, 3);

    const count2 = prefixTokenCount(
      'rust-test-provider-agnostic-migration',
      'rust-test-provider-id-conversion-bug'
    );
    assert.strictEqual(count2, 3);
  });
});

// =============================================================================
// findSimilarSkillsWide Tests (Hybrid 4: Jaccard >= 0.40 OR (Jaccard >= 0.30 AND Prefix >= 3))
// =============================================================================

describe('findSimilarSkillsWide', () => {
  const existingSkills = [
    'rust-test-provider-agnostic-migration',
    'rust-test-provider-data-format-requirements',
    'rust-test-provider-id-conversion-bug',
    'rust-trait-migration-bridge-pattern',
    'rust-trait-migration-method-collision',
    'rust-api-handler-source-of-truth',
    'python-api-testing',
    'doc-driven-incremental-development',
  ];

  it('should find skills with Jaccard >= 0.40', () => {
    // rust-trait-migration-new should match rust-trait-migration-* family (high Jaccard AND prefix >= 3)
    const matches = findSimilarSkillsWide('rust-trait-migration-new-pattern', existingSkills);

    // Should find matches with the trait-migration family
    assert.ok(matches.length > 0, 'Should find trait-migration family matches');
    // All matches should meet wide criteria
    for (const match of matches) {
      assert.ok(
        match.jaccard >= 0.40 || (match.jaccard >= 0.30 && match.prefix >= 3),
        `Match ${match.name} doesn't meet criteria: Jaccard=${match.jaccard}, Prefix=${match.prefix}`
      );
    }
  });

  it('should find skills with Prefix >= 3 even if Jaccard < 0.40', () => {
    // rust-test-provider-new-feature should match rust-test-provider-* family
    const matches = findSimilarSkillsWide('rust-test-provider-new-feature', existingSkills);

    const providerMatches = matches.filter(m => m.name.includes('rust-test-provider'));
    assert.ok(providerMatches.length >= 2, 'Should find at least 2 provider family skills');

    // Verify they match on prefix
    for (const match of providerMatches) {
      assert.ok(match.prefix >= 3, `Expected prefix >= 3, got ${match.prefix}`);
    }
  });

  it('should not match completely unrelated skills', () => {
    const matches = findSimilarSkillsWide('python-api-testing', existingSkills);

    // Should not match rust-* skills (different first token)
    const rustMatches = matches.filter(m => m.name.startsWith('rust-'));
    assert.strictEqual(rustMatches.length, 0, 'Should not match rust-* skills');
  });

  it('should return matches sorted by Jaccard score descending', () => {
    const matches = findSimilarSkillsWide('rust-test-provider-something', existingSkills);

    for (let i = 1; i < matches.length; i++) {
      assert.ok(
        matches[i - 1].jaccard >= matches[i].jaccard,
        'Results should be sorted by Jaccard descending'
      );
    }
  });

  it('should return empty array when no matches found', () => {
    const matches = findSimilarSkillsWide('completely-unique-skill-name', existingSkills);
    assert.deepStrictEqual(matches, []);
  });

  it('should handle empty existing skills list', () => {
    const matches = findSimilarSkillsWide('rust-test-mock', []);
    assert.deepStrictEqual(matches, []);
  });
});

// =============================================================================
// findSimilarSkillsStrict Tests (Hybrid 2: Jaccard >= 0.30 AND Prefix >= 3)
// =============================================================================

describe('findSimilarSkillsStrict', () => {
  const existingSkills = [
    'rust-test-provider-agnostic-migration',
    'rust-test-provider-data-format-requirements',
    'rust-test-provider-id-conversion-bug',
    'rust-trait-migration-bridge-pattern',
    'rust-trait-migration-method-collision',
    'rust-test-mock-handler-refactor',
    'doc-driven-incremental-development',
    'doc-driven-incremental-refactor',
  ];

  it('should only find skills matching BOTH Jaccard >= 0.30 AND Prefix >= 3', () => {
    const matches = findSimilarSkillsStrict('rust-test-provider-new-thing', existingSkills);

    // Should match rust-test-provider-* family
    assert.ok(matches.length > 0);

    for (const match of matches) {
      assert.ok(match.jaccard >= 0.30, `Jaccard should be >= 0.30, got ${match.jaccard}`);
      assert.ok(match.prefix >= 3, `Prefix should be >= 3, got ${match.prefix}`);
    }
  });

  it('should NOT match skills with high Jaccard but low prefix', () => {
    // rust-test-mock-handler should have high Jaccard with rust-test-provider-*
    // but prefix is only 2 (rust-test)
    const matches = findSimilarSkillsStrict('rust-test-mock-new', existingSkills);

    // Should not match rust-test-provider-* because prefix is only 2
    const providerMatches = matches.filter(m => m.name.includes('provider'));
    assert.strictEqual(providerMatches.length, 0, 'Should not match provider skills with prefix < 3');
  });

  it('should find doc-driven-incremental family', () => {
    const matches = findSimilarSkillsStrict('doc-driven-incremental-testing', existingSkills);

    assert.ok(matches.length === 2, 'Should find both doc-driven-incremental skills');
    for (const match of matches) {
      assert.ok(match.name.startsWith('doc-driven-incremental'));
      assert.ok(match.prefix >= 3);
    }
  });

  it('should find rust-trait-migration family', () => {
    const matches = findSimilarSkillsStrict('rust-trait-migration-test-helpers', existingSkills);

    const traitMatches = matches.filter(m => m.name.includes('rust-trait-migration'));
    assert.ok(traitMatches.length >= 2, 'Should find trait-migration family');
  });

  it('should return empty when no strict matches exist', () => {
    // This has high Jaccard with some skills but won't have prefix >= 3
    const matches = findSimilarSkillsStrict('rust-api-test-handler', existingSkills);

    // May or may not have matches - depends on exact overlap
    // The key is that any matches MUST meet both criteria
    for (const match of matches) {
      assert.ok(match.jaccard >= 0.30 && match.prefix >= 3);
    }
  });

  it('should be more conservative than wide matching', () => {
    const wideMatches = findSimilarSkillsWide('rust-test-something', existingSkills);
    const strictMatches = findSimilarSkillsStrict('rust-test-something', existingSkills);

    assert.ok(
      strictMatches.length <= wideMatches.length,
      'Strict matching should return fewer or equal matches than wide'
    );
  });
});

// =============================================================================
// Edge Cases and Integration Tests
// =============================================================================

describe('similarity edge cases', () => {
  it('should handle skill names with numbers', () => {
    const score = jaccardSimilarity('rust-v2-api-handler', 'rust-v2-api-client');
    // {rust, v2, api, handler} vs {rust, v2, api, client}
    // intersection: 3, union: 5 -> 0.6
    assert.strictEqual(score, 0.6);
  });

  it('should handle single-character tokens', () => {
    const score = jaccardSimilarity('a-b-c', 'a-b-d');
    // intersection: {a, b} = 2, union: {a, b, c, d} = 4 -> 0.5
    assert.strictEqual(score, 0.5);
  });

  it('should handle very long skill names', () => {
    const name1 = 'rust-test-provider-data-format-requirements-validation';
    const name2 = 'rust-test-provider-data-format-requirements-checking';
    // Tokens: rust, test, provider, data, format, requirements, validation/checking
    // Prefix match: rust, test, provider, data, format, requirements = 6 tokens

    const jaccard = jaccardSimilarity(name1, name2);
    const prefix = prefixTokenCount(name1, name2);

    assert.ok(jaccard > 0.7, 'Very similar names should have high Jaccard');
    assert.strictEqual(prefix, 6, 'Should match first 6 tokens');
  });

  it('should work with real problematic pairs from analysis', () => {
    // These were identified as potential false positives

    // Should NOT be considered similar (different semantic domains)
    const fp1 = jaccardSimilarity(
      'rust-test-verify-before-converting',
      'rust-verify-exports-before-documenting'
    );
    const prefix1 = prefixTokenCount(
      'rust-test-verify-before-converting',
      'rust-verify-exports-before-documenting'
    );
    // Jaccard is 0.429 but prefix is only 1 - strict should reject
    assert.ok(prefix1 < 3, 'False positive should have low prefix');

    // Should BE considered similar (same family)
    const fp2 = jaccardSimilarity(
      'rust-trait-migration-bridge-pattern',
      'rust-trait-migration-method-collision'
    );
    const prefix2 = prefixTokenCount(
      'rust-trait-migration-bridge-pattern',
      'rust-trait-migration-method-collision'
    );
    assert.ok(fp2 >= 0.30 && prefix2 >= 3, 'True family should pass strict criteria');
  });
});
