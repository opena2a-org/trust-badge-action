const MARKER_START = '<!-- opena2a-trust-badge -->';
const MARKER_END = '<!-- /opena2a-trust-badge -->';

// An unmarked OpenA2A badge in any form this action or its README has written: the agent-id badge
// (/v1/trust/<id>/badge.svg), the package badges (/v1/trust/badge/<name>?source=... and
// /v1/trust/badge?package=...) and the earlier README example (/badge/<name>). The alt text stops
// at its closing bracket, so a match never starts at an earlier image on the same line. The image
// URL is captured. No part can run past a "[" in the alt text or a "(" in a URL, so a match attempt
// never re-scans the text of the next badge and the time stays linear in the length of the README.
const BADGE_URL_PATTERN = /\[!\[[^[\]]*\]\((https:\/\/(?:api\.oa2a\.org|registry\.opena2a\.org)\/(?:v1\/trust\/badge\?[^()]*|v1\/trust\/badge\/[^()]+|v1\/trust\/[^()]+\/badge\.svg|badge\/[^()]+))\)\]\([^()]+\)/g;

// The blockquote markers at the start of a line: ">" after at most three spaces, and the one space
// or tab after it.
const BLOCKQUOTE = /^(?: {0,3}>[ \t]?)*/;

// After its indentation, the opening or closing line of a fenced code block: ``` or ~~~, then the
// info string.
const FENCE = /^(`{3,}|~{3,})(.*)$/;

// After its indentation, the first line of a raw HTML block (<pre>, <script>, <style> or
// <textarea>), and the closing tag that ends one. GitHub shows the text in between as it is, never
// as markdown.
const RAW_HTML_START = /^<(?:pre|script|style|textarea)(?:[ \t>]|$)/i;
const RAW_HTML_END = /<\/(?:pre|script|style|textarea)>/i;

// After its indentation, a list item marker and the spaces after it.
const LIST_MARKER = /^(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/;

// After its indentation, a line that ends the paragraph before it and starts no other: a heading,
// a thematic break or a heading underline.
const PARAGRAPH_END = /^(?:#{1,6}(?:[ \t].*)?|(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|=+[ \t]*)$/;

/**
 * The package a README badge is written for. An unmarked badge is replaced only when its image
 * names this package or agent id.
 */
export interface BadgeOwner {
  packageName: string;
  agentId?: string;
}

type Range = [start: number, end: number];

type OpenBlock =
  | { kind: 'fence'; start: number; fence: string; base: number }
  | { kind: 'html'; start: number }
  | { kind: 'indented'; start: number; end: number; base: number };

// The width of the spaces and tabs a line starts with, a tab advancing to the next multiple of four
// columns, and the text after them.
function splitIndentation(line: string): { width: number; text: string } {
  let width = 0;
  let i = 0;
  for (; i < line.length && (line[i] === ' ' || line[i] === '\t'); i++) {
    width = line[i] === '\t' ? width + 4 - (width % 4) : width + 1;
  }
  return { width, text: line.slice(i) };
}

/**
 * The character ranges of the code in the content, read the way GitHub renders it: fenced code
 * blocks (``` or ~~~ indented at most three columns past the list item they are in), indented code
 * blocks (four columns or more past it, where the line does not continue a paragraph) and raw HTML
 * blocks such as <pre>. Text in code is an example, never a badge or a marker this action owns. A
 * block that is never closed runs to the end of the content.
 */
function codeRanges(content: string): Range[] {
  const ranges: Range[] = [];
  // The content columns of the list items a line can belong to, the innermost last.
  const lists: number[] = [];
  let block: OpenBlock | null = null;
  // Whether the line before is paragraph text, which a line indented four columns more continues.
  let paragraph = false;
  let offset = 0;
  for (const rawLine of content.split('\n')) {
    const lineStart = offset;
    const lineEnd = offset + rawLine.length;
    offset = lineEnd + 1;
    const line = rawLine.replace(/\r$/, '');
    let { width, text } = splitIndentation(line.replace(BLOCKQUOTE, ''));
    const blank = text.trim() === '';

    if (block?.kind === 'fence') {
      const close = width - block.base < 4 ? FENCE.exec(text) : null;
      if (
        close &&
        close[1][0] === block.fence[0] &&
        close[1].length >= block.fence.length &&
        close[2].trim() === ''
      ) {
        ranges.push([block.start, lineEnd]);
        block = null;
        paragraph = false;
      }
      continue;
    }
    if (block?.kind === 'html') {
      if (RAW_HTML_END.test(line)) {
        ranges.push([block.start, lineEnd]);
        block = null;
        paragraph = false;
      }
      continue;
    }
    if (block?.kind === 'indented') {
      if (blank || width - block.base >= 4) {
        if (!blank) {
          block.end = lineEnd;
        }
        continue;
      }
      // A line indented less ends the indented code block and is read on its own below
      ranges.push([block.start, block.end]);
      block = null;
    }

    if (blank) {
      paragraph = false;
      continue;
    }
    // A line indented less than a list item's content is not part of that item
    while (lists.length > 0 && width < lists[lists.length - 1]) {
      lists.pop();
    }
    let base = lists.length > 0 ? lists[lists.length - 1] : 0;
    if (width - base >= 4) {
      if (!paragraph) {
        block = { kind: 'indented', start: lineStart, end: lineEnd, base };
      }
      continue;
    }
    if (PARAGRAPH_END.test(text)) {
      paragraph = false;
      continue;
    }
    // A list item marker starts the content of a new item, which may itself open a fence
    for (let item = LIST_MARKER.exec(text); item; item = LIST_MARKER.exec(text)) {
      width += item[0].length;
      text = text.slice(item[0].length);
      lists.push(width);
      base = width;
    }
    const fence = FENCE.exec(text);
    // A backtick fence's info string cannot itself contain a backtick.
    if (fence && !(fence[1][0] === '`' && fence[2].includes('`'))) {
      block = { kind: 'fence', start: lineStart, fence: fence[1], base };
    } else if (RAW_HTML_START.test(text)) {
      if (RAW_HTML_END.test(text)) {
        ranges.push([lineStart, lineEnd]);
        paragraph = false;
      } else {
        block = { kind: 'html', start: lineStart };
      }
    } else {
      paragraph = text.trim() !== '';
    }
  }
  if (block !== null) {
    ranges.push([block.start, block.kind === 'indented' ? block.end : content.length]);
  }
  return ranges;
}

// Whether the index is in one of the ranges, which are in order and do not overlap.
function inCode(index: number, code: Range[]): boolean {
  let low = 0;
  let high = code.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end] = code[middle];
    if (index < start) {
      high = middle - 1;
    } else if (index >= end) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

// The first index of `search` at or after `from` that is outside the code, or -1.
function indexOutsideCode(content: string, search: string, code: Range[], from = 0): number {
  let index = content.indexOf(search, from);
  while (index !== -1 && inCode(index, code)) {
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
 * The first unmarked OpenA2A badge outside the code whose image names the owner, or any such
 * badge when no owner is given.
 */
function findUnmarkedBadge(
  content: string,
  code: Range[],
  owner?: BadgeOwner
): { index: number; text: string } | null {
  for (const match of content.matchAll(BADGE_URL_PATTERN)) {
    const index = match.index ?? 0;
    if (!inCode(index, code) && (owner === undefined || namesOwner(match[1], owner))) {
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
 * Check if the README already contains an OpenA2A trust badge outside its code: the
 * markers, or an unmarked badge for the owner (for any package when no owner is given).
 */
export function hasTrustBadge(content: string, owner?: BadgeOwner): boolean {
  const code = codeRanges(content);
  if (indexOutsideCode(content, MARKER_START, code) !== -1) {
    return true;
  }
  return findUnmarkedBadge(content, code, owner) !== null;
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
  // Lines inside code are examples and never place the badge
  const code = codeRanges(content);

  // Check for existing markers
  const markerIndex = indexOutsideCode(content, MARKER_START, code);
  if (markerIndex !== -1) {
    return markerIndex;
  }

  let lastBadgeLineEnd = -1;
  let firstHeadingEnd = -1;
  let offset = 0;

  for (const rawLine of content.split('\n')) {
    const lineEnd = offset + rawLine.length;
    const line = rawLine.trim();

    if (!inCode(offset, code)) {
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
 * Markers and badges inside code (fenced and indented code blocks, <pre>) are left alone. When an
 * owner is given, an unmarked badge is replaced only if its image names the owner's package or
 * agent id; a badge for another package stays as it is.
 */
export function updateBadge(content: string, badgeMarkdown: string, owner?: BadgeOwner): string {
  const code = codeRanges(content);
  const wrapped = wrapWithMarkers(badgeMarkdown);

  // Case 1: Markers exist -- replace content between them
  const markerStartIndex = indexOutsideCode(content, MARKER_START, code);
  if (markerStartIndex !== -1) {
    const markerEndIndex = indexOutsideCode(
      content,
      MARKER_END,
      code,
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
  const badge = findUnmarkedBadge(content, code, owner);
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
