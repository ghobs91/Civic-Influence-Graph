/**
 * Content script: entity name detection (T069).
 * Scans visible page text, matches against cached entity names via
 * fuzzy matching, and highlights detected entities with overlay triggers.
 */

export interface EntityMatch {
  id: string;
  name: string;
  entityType: string;
  score: number;
}

export interface CachedEntity {
  id: string;
  name: string;
  entityType: string;
  variants: string[];
}

/**
 * Normalize a name for comparison: lowercase, collapse whitespace,
 * strip punctuation (except hyphens).
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple Dice coefficient for fuzzy string similarity (0–1).
 */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bi = a.slice(i, i + 2);
    bigrams.set(bi, (bigrams.get(bi) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bi = b.slice(i, i + 2);
    const count = bigrams.get(bi);
    if (count && count > 0) {
      bigrams.set(bi, count - 1);
      matches++;
    }
  }

  return (2 * matches) / (a.length - 1 + (b.length - 1));
}

const MATCH_THRESHOLD = 0.8;

/**
 * Match a text fragment against the entity cache.
 */
export function matchEntity(
  text: string,
  cache: CachedEntity[],
): EntityMatch | null {
  const normalized = normalizeName(text);
  if (normalized.length < 3) return null;

  let best: EntityMatch | null = null;

  for (const entity of cache) {
    // Check canonical name
    const nameNorm = normalizeName(entity.name);
    const score = diceSimilarity(normalized, nameNorm);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { id: entity.id, name: entity.name, entityType: entity.entityType, score };
    }

    // Check variants
    for (const variant of entity.variants) {
      const varNorm = normalizeName(variant);
      const vScore = diceSimilarity(normalized, varNorm);
      if (vScore >= MATCH_THRESHOLD && (!best || vScore > best.score)) {
        best = { id: entity.id, name: entity.name, entityType: entity.entityType, score: vScore };
      }
    }
  }

  return best;
}

/**
 * Extract candidate name phrases from a text node.
 * Looks for sequences of 2-4 capitalized words (likely proper names).
 */
export function extractCandidateNames(text: string): string[] {
  const pattern = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    matches.push(m[0]);
  }
  return matches;
}

/**
 * Scan visible text nodes in the document and find entity matches.
 */
export function scanPageForEntities(
  root: Element,
  cache: CachedEntity[],
): Array<{ node: Text; match: EntityMatch; offset: number }> {
  if (cache.length === 0) return [];

  const results: Array<{ node: Text; match: EntityMatch; offset: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    const text = textNode.textContent;
    if (!text || text.trim().length < 5) continue;

    const tag = textNode.parentElement?.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;

    const names = extractCandidateNames(text);
    for (const name of names) {
      const match = matchEntity(name, cache);
      if (match) {
        const offset = text.indexOf(name);
        results.push({ node: textNode, match, offset });
      }
    }
  }

  return results;
}

const OVERLAY_CLASS = 'cig-entity-highlight';

/**
 * Highlight detected entities in the DOM and attach click handlers
 * that message the background worker.
 */
export function highlightEntities(
  matches: Array<{ node: Text; match: EntityMatch; offset: number }>,
): HTMLElement[] {
  const elements: HTMLElement[] = [];

  for (const { node, match, offset } of matches) {
    const text = node.textContent;
    if (!text) continue;

    // Avoid double-highlighting
    if (node.parentElement?.classList.contains(OVERLAY_CLASS)) continue;

    const span = document.createElement('span');
    span.className = OVERLAY_CLASS;
    span.style.cssText =
      'background: rgba(59,130,246,0.15); border-bottom: 2px solid rgb(59,130,246); cursor: pointer; position: relative;';
    span.textContent = text.slice(offset, offset + match.name.length);
    span.dataset.entityId = match.id;
    span.dataset.entityName = match.name;
    span.dataset.entityType = match.entityType;
    span.title = `${match.name} (${match.entityType})`;

    span.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'ENTITY_CLICKED',
        payload: { id: match.id, name: match.name, entityType: match.entityType },
      });
    });

    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset + match.name.length);
    range.surroundContents(span);
    elements.push(span);
  }

  return elements;
}

/**
 * Main content script entry point.
 * Requests entity cache from the background worker, scans the page,
 * and highlights matches.
 */
export async function init(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ENTITY_CACHE' });
    if (!response?.entities || !Array.isArray(response.entities)) return;

    const cache: CachedEntity[] = response.entities;
    const matches = scanPageForEntities(document.body, cache);
    highlightEntities(matches);
  } catch {
    // Extension context may be invalidated if navigating away
  }
}

// Auto-run when injected (but only in actual browser context)
if (typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function') {
  init();
}
