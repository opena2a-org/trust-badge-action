import { TrustLookupResponse, encodeUrlComponent, trustQuery } from './registry';

export interface TrustBadge {
  imageUrl: string;
  linkUrl: string;
}

// An absolute https URL with no whitespace, no control character, nothing that could end the
// markdown image or link it is written into, and no "|", which would split the pull request table
// cell the link is also written into.
const SAFE_BADGE_URL = /^https:\/\/[^\s\x00-\x1f\x7f()[\]<>"'`\\|]+$/;

// A badge URL from the lookup is written only when it is safe and on the registry's own origin.
function isRegistryBadgeUrl(value: unknown, registryUrl: string): value is string {
  if (typeof value !== 'string' || !SAFE_BADGE_URL.test(value)) {
    return false;
  }
  try {
    return new URL(value).origin === new URL(registryUrl).origin;
  } catch {
    return false;
  }
}

// An agent id in the form the registry issues. Nothing else is written into the image path.
const AGENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAgentId(value: unknown): value is string {
  return typeof value === 'string' && AGENT_ID.test(value);
}

/**
 * Resolve the badge image and the page it links to for a package.
 *
 * When the registry's lookup response carries both badgeImageUrl and badgeLinkUrl, each on the
 * origin of registryUrl, they are used as returned. The registry returns neither today, so the
 * badge is built from routes it serves:
 *   image: <registry>/v1/trust/<agentId>/badge.svg, with the agent id the lookup returned
 *   link:  <registry>/v1/trust/lookup?package=<name>&source=<source>
 * An agent id that is not a UUID is never written; the image then names the package instead:
 *   image: <registry>/v1/trust/badge/<name>?source=<source>
 * The name and source are percent-encoded, ( ) ' ! * ~ included.
 * The registry serves that route only for a name without "/" (it answers 404 for a scoped npm name
 * or an owner/repo name, and 400 for the package query), so for such a name without an agent id
 * there is no badge image to write and this throws.
 */
export function resolveBadge(
  registryUrl: string,
  packageName: string,
  source: string,
  trustData: TrustLookupResponse
): TrustBadge {
  if (
    isRegistryBadgeUrl(trustData.badgeImageUrl, registryUrl) &&
    isRegistryBadgeUrl(trustData.badgeLinkUrl, registryUrl)
  ) {
    return { imageUrl: trustData.badgeImageUrl, linkUrl: trustData.badgeLinkUrl };
  }
  let imageUrl: string;
  if (isAgentId(trustData.agentId)) {
    imageUrl = `${registryUrl}/v1/trust/${trustData.agentId}/badge.svg`;
  } else if (!packageName.includes('/')) {
    imageUrl = `${registryUrl}/v1/trust/badge/${encodeUrlComponent(packageName)}?source=${encodeUrlComponent(source)}`;
  } else {
    throw new Error(
      `The registry lookup for ${packageName} returned no agent id, and the registry serves no badge image by name for a package name that contains "/". README not changed.`
    );
  }
  return {
    imageUrl,
    linkUrl: `${registryUrl}/v1/trust/lookup?${trustQuery(packageName, source)}`,
  };
}

/**
 * Generate the badge markdown: the badge image wrapped in its link.
 */
export function badgeMarkdown(badge: TrustBadge): string {
  return `[![OpenA2A Trust Score](${badge.imageUrl})](${badge.linkUrl})`;
}
