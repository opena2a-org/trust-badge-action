const MARKER_START = '<!-- opena2a-trust-badge -->';
const MARKER_END = '<!-- /opena2a-trust-badge -->';

const BADGE_URL_PATTERN = /\[!\[.*?\]\(https:\/\/registry\.opena2a\.org\/v1\/trust\/[^)]+\/badge\.svg\)\]\([^)]+\)/;

/**
 * Wrap badge markdown with HTML comment markers for future updates.
 */
export function wrapWithMarkers(badgeMarkdown: string): string {
  return `${MARKER_START}\n${badgeMarkdown}\n${MARKER_END}`;
}

/**
 * Check if the README already contains an OpenA2A trust badge.
 */
export function hasTrustBadge(content: string): boolean {
  if (content.includes(MARKER_START)) {
    return true;
  }
  return BADGE_URL_PATTERN.test(content);
}

/**
 * Find the best position to insert the badge in the README content.
 * Returns the character index where the badge should be inserted.
 *
 * Strategy:
 * 1. If markers exist, return the start of the marker block (for replacement).
 * 2. If other badges exist (lines starting with [![), insert after the last badge line.
 * 3. If a top-level heading exists, insert after the first heading line.
 * 4. Otherwise, insert at the beginning of the file.
 */
export function findBadgePosition(content: string): number {
  // Check for existing markers
  const markerIndex = content.indexOf(MARKER_START);
  if (markerIndex !== -1) {
    return markerIndex;
  }

  const lines = content.split('\n');
  let lastBadgeLineEnd = -1;
  let firstHeadingEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track badge lines: [![...](...)](...) pattern
    if (line.startsWith('[![') && line.includes('](')) {
      // Calculate character position at end of this line
      lastBadgeLineEnd = lines.slice(0, i + 1).join('\n').length;
    }

    // Track the first top-level heading
    if (firstHeadingEnd === -1 && line.startsWith('#')) {
      firstHeadingEnd = lines.slice(0, i + 1).join('\n').length;
    }
  }

  // Insert after the last badge
  if (lastBadgeLineEnd !== -1) {
    return lastBadgeLineEnd;
  }

  // Insert after the first heading
  if (firstHeadingEnd !== -1) {
    return firstHeadingEnd;
  }

  // Insert at the beginning
  return 0;
}

/**
 * Insert or replace the trust badge in README content.
 * The operation is idempotent: running it twice produces the same result.
 */
export function updateBadge(content: string, badgeMarkdown: string): string {
  const wrapped = wrapWithMarkers(badgeMarkdown);

  // Case 1: Markers exist -- replace content between them
  const markerStartIndex = content.indexOf(MARKER_START);
  if (markerStartIndex !== -1) {
    const markerEndIndex = content.indexOf(MARKER_END);
    if (markerEndIndex !== -1) {
      const before = content.substring(0, markerStartIndex);
      const after = content.substring(markerEndIndex + MARKER_END.length);
      return before + wrapped + after;
    }
  }

  // Case 2: Badge URL exists without markers -- replace the badge line
  const badgeMatch = content.match(BADGE_URL_PATTERN);
  if (badgeMatch && badgeMatch.index !== undefined) {
    const before = content.substring(0, badgeMatch.index);
    const after = content.substring(badgeMatch.index + badgeMatch[0].length);
    return before + wrapped + after;
  }

  // Case 3: Insert at the best position
  const position = findBadgePosition(content);
  if (position === 0) {
    // Insert at the top
    return wrapped + '\n\n' + content;
  }

  // Insert after the found position (add newlines for separation)
  const before = content.substring(0, position);
  const after = content.substring(position);
  return before + '\n' + wrapped + after;
}
