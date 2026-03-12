/**
 * Wrap badge markdown with HTML comment markers for future updates.
 */
export declare function wrapWithMarkers(badgeMarkdown: string): string;
/**
 * Check if the README already contains an OpenA2A trust badge.
 */
export declare function hasTrustBadge(content: string): boolean;
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
export declare function findBadgePosition(content: string): number;
/**
 * Insert or replace the trust badge in README content.
 * The operation is idempotent: running it twice produces the same result.
 */
export declare function updateBadge(content: string, badgeMarkdown: string): string;
