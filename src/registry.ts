export interface TrustLookupResponse {
  agentId: string;
  name: string;
  trustScore: number;
  trustLevel: string;
  profileUrl: string;
  badgeImageUrl?: string;
  badgeLinkUrl?: string;
}

export interface LookupOptions {
  // Attempts made before the lookup fails, counting the first one.
  attempts?: number;
  // Wait before the first retry; each later retry waits twice as long as the one before it.
  retryDelayMs?: number;
  // Time allowed for each attempt.
  timeoutMs?: number;
}

const DEFAULT_LOOKUP_OPTIONS: Required<LookupOptions> = {
  attempts: 3,
  retryDelayMs: 2000,
  timeoutMs: 15000,
};

/**
 * encodeURIComponent, with ( ) ' ! * ~ percent-encoded as well, so no character of the value is
 * read as markdown syntax where the URL is written into a badge or a link.
 */
export function encodeUrlComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[()'!*~]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * The query that names a package to the registry's trust routes.
 */
export function trustQuery(packageName: string, source: string): string {
  return `package=${encodeUrlComponent(packageName)}&source=${encodeUrlComponent(source)}`;
}

// A failure that a later attempt can succeed past: no response (network error or timeout), a rate
// limit, or a server error.
class TransientLookupError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Look up trust information for a package from the OpenA2A Registry.
 * Returns null if the package has no trust profile (404).
 * A network error, a timeout, a 429 or a 5xx is retried with backoff; the lookup throws when the
 * last attempt fails the same way, and at once on any other unexpected status code.
 */
export async function lookupTrust(
  registryUrl: string,
  packageName: string,
  source: string,
  options: LookupOptions = {}
): Promise<TrustLookupResponse | null> {
  const { attempts, retryDelayMs, timeoutMs } = { ...DEFAULT_LOOKUP_OPTIONS, ...options };
  const url = `${registryUrl}/v1/trust/lookup?${trustQuery(packageName, source)}`;

  for (let attempt = 1; ; attempt++) {
    try {
      return await lookupOnce(url, registryUrl, timeoutMs);
    } catch (error) {
      if (!(error instanceof TransientLookupError) || attempt >= attempts) {
        throw error;
      }
      await sleep(retryDelayMs * 2 ** (attempt - 1));
    }
  }
}

async function lookupOnce(
  url: string,
  registryUrl: string,
  timeoutMs: number
): Promise<TrustLookupResponse | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'opena2a-trust-badge-action/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TransientLookupError(`Failed to connect to registry at ${registryUrl}: ${message}`);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = `Registry returned unexpected status ${response.status}: ${response.statusText}`;
    throw response.status === 429 || response.status >= 500
      ? new TransientLookupError(message)
      : new Error(message);
  }

  try {
    return (await response.json()) as TrustLookupResponse;
  } catch {
    throw new Error(
      `Registry at ${registryUrl} returned status ${response.status} with a body that is not JSON.`
    );
  }
}
