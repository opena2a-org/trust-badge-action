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
export declare function lookupTrust(registryUrl: string, packageName: string, source: string): Promise<TrustLookupResponse | null>;
