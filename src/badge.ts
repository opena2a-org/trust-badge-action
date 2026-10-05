import { TrustLookupResponse, trustQuery } from './registry';

export interface TrustBadge {
  imageUrl: string;
  linkUrl: string;
}

// An absolute https URL with nothing that could end the markdown image or link it is written into.
const SAFE_BADGE_URL = /^https:\/\/[^\s()[\]<>"'`\\]+$/;

function isSafeBadgeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !SAFE_BADGE_URL.test(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the badge image and the page it links to for a package.
 *
 * The registry's lookup response names both (badgeImageUrl, badgeLinkUrl), so the route form is
 * decided in one place. When the lookup does not return both, the badge is built from the
 * package and source inputs:
 *   image: <registry>/v1/trust/badge?package=<name>&source=<source>
 *   link:  <registry>/v1/trust/lookup?package=<name>&source=<source>
 */
export function resolveBadge(
  registryUrl: string,
  packageName: string,
  source: string,
  trustData: TrustLookupResponse
): TrustBadge {
  if (isSafeBadgeUrl(trustData.badgeImageUrl) && isSafeBadgeUrl(trustData.badgeLinkUrl)) {
    return { imageUrl: trustData.badgeImageUrl, linkUrl: trustData.badgeLinkUrl };
  }
  const query = trustQuery(packageName, source);
  return {
    imageUrl: `${registryUrl}/v1/trust/badge?${query}`,
    linkUrl: `${registryUrl}/v1/trust/lookup?${query}`,
  };
}

/**
 * Generate the badge markdown: the badge image wrapped in its link.
 */
export function badgeMarkdown(badge: TrustBadge): string {
  return `[![OpenA2A Trust Score](${badge.imageUrl})](${badge.linkUrl})`;
}
