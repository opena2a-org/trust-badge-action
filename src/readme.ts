const MARKER_START = '<!-- opena2a-trust-badge -->';
const MARKER_END = '<!-- /opena2a-trust-badge -->';

// An unmarked OpenA2A badge in any form this action or its README has written: the agent-id badge
// (/v1/trust/<id>/badge.svg), the package badges (/v1/trust/badge/<name>?source=... and
// /v1/trust/badge?package=...) and the earlier README example (/badge/<name>). The alt text stops
// at its closing bracket, so a match never starts at an earlier image on the same line. The image
// URL is captured.
const BADGE_URL_PATTERN = /\[!\[[^\]]*\]\((https:\/\/(?:api\.oa2a\.org|registry\.opena2a\.org)\/(?:v1\/trust\/badge\?[^)]*|v1\/trust\/badge\/[^)]+|v1\/trust\/[^)]+\/badge\.svg|badge\/[^)]+))\)\]\([^)]+\)/g;

// The opening or closing line of a fenced code block: ``` or ~~~ after any indentation or
// blockquote markers, then the info string.
const FENCE = /^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})(.*)$/;

/**
 * The package a README badge is written for. An unmarked badge is replaced only when its image
 * names this package or agent id.
 */
export interface BadgeOwner {
  packageName: string;
  agentId?: string;
}

type Range = [start: number, end: number];

/**
 * The character ranges of the fenced code blocks in the content. Text inside a fence is an
 * example, never a badge or a marker this action owns. A fence that is never closed runs to the
 * end of the content.
 */
function fencedRanges(content: string): Range[] {
  const ranges: Range[] = [];
  let open: { fence: string; start: number } | null = null;
  let offset = 0;
  for (const line of content.split('\n')) {
    const match = FENCE.exec(line.replace(/\r$/, ''));
    if (open === null) {
      // A backtick fence's info string cannot itself contain a backtick.
      if (match && !(match[1][0] === '`' && match[2].includes('`'))) {
        open = { fence: match[1], start: offset };
      }
    } else if (
      match &&
      match[1][0] === open.fence[0] &&
      match[1].length >= open.fence.length &&
      match[2].trim() === ''
    ) {
      ranges.push([open.start, offset + line.length]);
      open = null;
    }
    offset += line.length + 1;
  }
  if (open !== null) {
    ranges.push([open.start, content.length]);
  }
  return ranges;
}

function isFenced(index: number, fences: Range[]): boolean {
  return fences.some(([start, end]) => index >= start && index < end);
}

// The first index of `search` at or after `from` that is outside every fence, or -1.
function indexOutsideFences(content: string, search: string, fences: Range[], from = 0): number {
  let index = content.indexOf(search, from);
  while (index !== -1 && isFenced(index, fences)) {
    index = content.indexOf(search, index + 1);
  }
  return index;
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Whether a badge image URL names the owner's package (package query, package path, or the earlier
 * /badge/<name> example) or the owner's agent id (/v1/trust/<id>/badge.svg).
 */
function namesOwner(imageUrl: string, owner: BadgeOwner): boolean {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return false;
  }
  if (url.pathname === '/v1/trust/badge') {
    return url.searchParams.get('package') === owner.packageName;
  }
  const named = /^\/(?:v1\/trust\/)?badge\/(.+)$/.exec(url.pathname);
  if (named) {
    return decode(named[1]) === owner.packageName;
  }
  const agent = /^\/v1\/trust\/([^/]+)\/badge\.svg$/.exec(url.pathname);
  return (
    agent !== null &&
    Boolean(owner.agentId) &&
    decode(agent[1])?.toLowerCase() === owner.agentId?.toLowerCase()
  );
}

/**
 * The first unmarked OpenA2A badge outside the fences whose image names the owner, or any such
 * badge when no owner is given.
 */
function findUnmarkedBadge(
  content: string,
  fences: Range[],
  owner?: BadgeOwner
): { index: number; text: string } | null {
  for (const match of content.matchAll(BADGE_URL_PATTERN)) {
    const index = match.index ?? 0;
    if (!isFenced(index, fences) && (owner === undefined || namesOwner(match[1], owner))) {
      return { index, text: match[0] };
    }
  }
  return null;
}

/**
 * Wrap badge markdown with HTML comment markers for future updates: on lines of their own, or on
 * one line when the badge sits on a line with other text.
 */
export function wrapWithMarkers(badgeMarkdown: string, inline = false): string {
  return inline
    ? `${MARKER_START}${badgeMarkdown}${MARKER_END}`
    : `${MARKER_START}\n${badgeMarkdown}\n${MARKER_END}`;
}

/**
 * Check if the README already contains an OpenA2A trust badge outside its code fences: the
 * markers, or an unmarked badge for the owner (for any package when no owner is given).
 */
export function hasTrustBadge(content: string, owner?: BadgeOwner): boolean {
  const fences = fencedRanges(content);
  if (indexOutsideFences(content, MARKER_START, fences) !== -1) {
    return true;
  }
  return findUnmarkedBadge(content, fences, owner) !== null;
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
  // Lines inside a fenced code block are examples and never place the badge
  const fences = fencedRanges(content);

  // Check for existing markers
  const markerIndex = indexOutsideFences(content, MARKER_START, fences);
  if (markerIndex !== -1) {
    return markerIndex;
  }

  let lastBadgeLineEnd = -1;
  let firstHeadingEnd = -1;
  let offset = 0;

  for (const rawLine of content.split('\n')) {
    const lineEnd = offset + rawLine.length;
    const line = rawLine.trim();

    if (!isFenced(offset, fences)) {
      // Track badge lines: [![...](...)](...) pattern
      if (line.startsWith('[![') && line.includes('](')) {
        lastBadgeLineEnd = lineEnd;
      }

      // Track the first top-level heading
      if (firstHeadingEnd === -1 && line.startsWith('#')) {
        firstHeadingEnd = lineEnd;
      }
    }

    offset = lineEnd + 1;
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
 *
 * Markers and badges inside fenced code blocks are left alone. When an owner is given, an
 * unmarked badge is replaced only if its image names the owner's package or agent id; a badge for
 * another package stays as it is.
 */
export function updateBadge(content: string, badgeMarkdown: string, owner?: BadgeOwner): string {
  const fences = fencedRanges(content);
  const wrapped = wrapWithMarkers(badgeMarkdown);

  // Case 1: Markers exist -- replace content between them
  const markerStartIndex = indexOutsideFences(content, MARKER_START, fences);
  if (markerStartIndex !== -1) {
    const markerEndIndex = indexOutsideFences(
      content,
      MARKER_END,
      fences,
      markerStartIndex + MARKER_START.length
    );
    if (markerEndIndex !== -1) {
      // Both markers present: replace everything between them, keeping markers that share a
      // line on that line
      const before = content.substring(0, markerStartIndex);
      const after = content.substring(markerEndIndex + MARKER_END.length);
      const inline = !content.substring(markerStartIndex, markerEndIndex).includes('\n');
      return before + wrapWithMarkers(badgeMarkdown, inline) + after;
    }
    // Orphaned start marker (no end marker): replace from start marker
    // to the next blank line or end of that line
    const afterStart = content.substring(markerStartIndex + MARKER_START.length);
    const blankLineIndex = afterStart.indexOf('\n\n');
    const endIndex = blankLineIndex !== -1
      ? markerStartIndex + MARKER_START.length + blankLineIndex
      : content.indexOf('\n', markerStartIndex + MARKER_START.length);
    const cutEnd = endIndex !== -1 ? endIndex : content.length;
    const before = content.substring(0, markerStartIndex);
    const after = content.substring(cutEnd);
    return before + wrapped + after;
  }

  // Case 2: Badge URL exists without markers -- replace the badge, on its own line or inline
  // among the other text of its line
  const badge = findUnmarkedBadge(content, fences, owner);
  if (badge) {
    const before = content.substring(0, badge.index);
    const after = content.substring(badge.index + badge.text.length);
    const afterLineEnd = after.indexOf('\n');
    const restOfLine =
      before.substring(before.lastIndexOf('\n') + 1) +
      (afterLineEnd === -1 ? after : after.substring(0, afterLineEnd));
    return before + wrapWithMarkers(badgeMarkdown, restOfLine.trim() !== '') + after;
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
