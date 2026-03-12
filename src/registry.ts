export interface TrustLookupResponse {
  agentId: string;
  name: string;
  trustScore: number;
  trustLevel: string;
  profileUrl: string;
}

/**
 * Look up trust information for a package from the OpenA2A Registry.
 * Returns null if the package has no trust profile (404).
 * Throws on network errors or unexpected status codes.
 */
export async function lookupTrust(
  registryUrl: string,
  packageName: string,
  source: string
): Promise<TrustLookupResponse | null> {
  const url = `${registryUrl}/v1/trust/lookup?package=${encodeURIComponent(packageName)}&source=${encodeURIComponent(source)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'opena2a-trust-badge-action/1.0',
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to registry at ${registryUrl}: ${message}`);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Registry returned unexpected status ${response.status}: ${response.statusText}`
    );
  }

  const data = (await response.json()) as TrustLookupResponse;
  return data;
}
