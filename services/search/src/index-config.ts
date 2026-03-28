/**
 * OpenSearch index configuration for the cig-entities index.
 * Defines custom analyzers and field mappings per data-model.md.
 */

export const CIG_ENTITIES_INDEX = 'cig-entities';

export const indexSettings = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        cig_name_analyzer: {
          type: 'custom' as const,
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'cig_name_synonyms'],
        },
        cig_phonetic_analyzer: {
          type: 'custom' as const,
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'cig_double_metaphone'],
        },
        cig_ngram_analyzer: {
          type: 'custom' as const,
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'cig_edge_ngram'],
        },
      },
      filter: {
        cig_name_synonyms: {
          type: 'synonym' as const,
          synonyms: [
            'rob, robert',
            'bob, robert',
            'bill, william',
            'will, william',
            'jim, james',
            'jimmy, james',
            'mike, michael',
            'dick, richard',
            'rick, richard',
            'tom, thomas',
            'joe, joseph',
            'dan, daniel',
            'dave, david',
            'steve, steven, stephen',
            'chris, christopher',
            'matt, matthew',
            'pat, patrick, patricia',
            'tony, anthony',
            'ted, theodore, edward',
            'chuck, charles',
            'charlie, charles',
            'jack, john',
            'johnny, john',
            'beth, elizabeth',
            'liz, elizabeth',
            'kate, catherine, katherine',
            'jen, jennifer',
            'sue, susan',
            'peggy, margaret',
            'meg, margaret',
            'sam, samuel, samantha',
            'alex, alexander, alexandra',
            'andy, andrew',
            'ben, benjamin',
            'nick, nicholas',
            'greg, gregory',
          ],
        },
        cig_double_metaphone: {
          type: 'phonetic' as const,
          encoder: 'double_metaphone',
          replace: false,
        },
        cig_edge_ngram: {
          type: 'edge_ngram' as const,
          min_gram: 2,
          max_gram: 15,
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' as const },
      entity_type: { type: 'keyword' as const },
      canonical_name: {
        type: 'text' as const,
        analyzer: 'cig_name_analyzer',
        fields: {
          phonetic: { type: 'text' as const, analyzer: 'cig_phonetic_analyzer' },
          ngram: { type: 'text' as const, analyzer: 'cig_ngram_analyzer' },
          keyword: { type: 'keyword' as const },
        },
      },
      name_variants: {
        type: 'text' as const,
        analyzer: 'cig_name_analyzer',
        fields: {
          phonetic: { type: 'text' as const, analyzer: 'cig_phonetic_analyzer' },
        },
      },
      jurisdiction: { type: 'keyword' as const },
      sector: { type: 'keyword' as const },
      party: { type: 'keyword' as const },
      employer: { type: 'text' as const, analyzer: 'standard' },
      committee_name: {
        type: 'text' as const,
        analyzer: 'cig_name_analyzer',
      },
    },
  },
};
