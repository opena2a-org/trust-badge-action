import { lookupTrust, TrustLookupResponse } from '../src/registry';

// Save original fetch
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('lookupTrust', () => {
  it('returns trust data for a successful lookup', async () => {
    const mockResponse: TrustLookupResponse = {
      agentId: 'abc-123',
      name: '@example/mcp-server',
      trustScore: 72,
      trustLevel: 'verified',
      profileUrl: 'https://registry.opena2a.org/agents/abc-123',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const result = await lookupTrust('https://api.oa2a.org', '@example/mcp-server', 'npm');
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.oa2a.org/v1/trust/lookup?package=%40example%2Fmcp-server&source=npm',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('returns null when package is not found (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await lookupTrust('https://api.oa2a.org', 'unknown-package', 'npm');
    expect(result).toBeNull();
  });

  it('throws on unexpected status codes', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      lookupTrust('https://registry.opena2a.org', 'some-package', 'npm')
    ).rejects.toThrow('Registry returned unexpected status 500');
  });

  it('throws on network errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      lookupTrust('https://registry.opena2a.org', 'some-package', 'npm')
    ).rejects.toThrow('Failed to connect to registry');
  });

  it('encodes package name and source in URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await lookupTrust('https://api.oa2a.org', '@scope/my-package', 'npm');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('%40scope%2Fmy-package'),
      expect.anything()
    );
  });

  it('handles pypi source', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await lookupTrust('https://api.oa2a.org', 'my-python-package', 'pypi');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('source=pypi'),
      expect.anything()
    );
  });
});
