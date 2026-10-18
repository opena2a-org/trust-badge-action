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

// A failure that a later attempt can succeed past: no response or only part of one (network error
// or timeout), a rate limit, or a server error.
class TransientLookupError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The fields every trust profile carries and the type of each, checked in this order. The optional
// badgeImageUrl and badgeLinkUrl are checked where the badge is resolved.
const PROFILE_FIELDS = [
  ['agentId', 'string'],
  ['trustScore', 'number'],
  ['trustLevel', 'string'],
] as const;

// The first reason a parsed answer is not a trust profile, or undefined when it is one.
function notTrustProfileReason(body: unknown): string | undefined {
  if (body === null) {
    return 'the body is null';
  }
  if (Array.isArray(body)) {
    return 'the body is an array';
  }
  if (typeof body !== 'object') {
    return `the body is a ${typeof body}`;
  }
  for (const [field, type] of PROFILE_FIELDS) {
    const value = (body as Record<string, unknown>)[field];
    if (value === undefined) {
      return `"${field}" is missing`;
    }
    if (typeof value !== type) {
      return `"${field}" is not a ${type}`;
    }
  }
  return undefined;
}

// At most this many bytes of a failing answer's body are read for the registry's error text.
const MAX_ERROR_BODY_BYTES = 64 * 1024;
// At most this many characters of the registry's error text are quoted.
const MAX_ERROR_TEXT_LENGTH = 300;
// Control characters, and the bidirectional controls that change the order a log line reads in.
const CONTROL_CHARACTERS = /[\p{Cc}\p{Bidi_Control}]/gu;

// The registry's reason for a failing answer: the string "error" of a JSON body such as
// {"error":"invalid source: ..."}, with control characters dropped, cut to MAX_ERROR_TEXT_LENGTH
// characters. Undefined when the body cannot be read, is longer than MAX_ERROR_BODY_BYTES or
// carries no such text, so the caller's message stays as it is.
async function registryErrorText(response: Response): Promise<string | undefined> {
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      return undefined;
    }
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      bytes += chunk.value.byteLength;
      if (bytes > MAX_ERROR_BODY_BYTES) {
        await reader.cancel();
        return undefined;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
    if (typeof error !== 'string') {
      return undefined;
    }
    const quoted = Array.from(error.replace(CONTROL_CHARACTERS, '').trim())
      .slice(0, MAX_ERROR_TEXT_LENGTH)
      .join('');
    return quoted || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Look up trust information for a package from the OpenA2A Registry.
 * Returns null if the package has no trust profile (404).
 * A network error or a timeout (while the body is read as well), a 429 or a 5xx is retried with
 * backoff; the lookup throws when the last attempt fails the same way, and at once on any other
 * unexpected status code or on a body that is not JSON or not a trust profile. The message for a
 * failing status quotes the registry's error text when its answer carries one.
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
    const errorText = await registryErrorText(response);
    let message = `Registry returned unexpected status ${response.status}: ${response.statusText}`;
    if (errorText !== undefined) {
      message += ` (${errorText})`;
    }
    throw response.status === 429 || response.status >= 500
      ? new TransientLookupError(message)
      : new Error(message);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    // A body that is not JSON fails to parse with a SyntaxError, matched by name since the fetch
    // implementation can throw it from another realm. Anything else (a timeout or a dropped
    // connection while the body arrives) means the answer never arrived in full.
    if ((error as { name?: unknown } | null)?.name === 'SyntaxError') {
      throw new Error(
        `Registry at ${registryUrl} returned status ${response.status} with a body that is not JSON.`
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new TransientLookupError(
      `Failed to read the answer from registry at ${registryUrl}: ${message}`
    );
  }

  // Thrown outside the try above, so an answer that is not a trust profile fails at once and is
  // not read as an answer that never arrived in full.
  const reason = notTrustProfileReason(body);
  if (reason !== undefined) {
    throw new Error(
      `Registry at ${registryUrl} returned status ${response.status} with a JSON body that is not a trust profile: ${reason}.`
    );
  }
  return body as TrustLookupResponse;
}
