import * as http from 'http';
import { AddressInfo } from 'net';
import { lookupTrust, TrustLookupResponse, trustQuery } from '../src/registry';

// Save original fetch
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('trustQuery', () => {
  it('percent-encodes the characters encodeURIComponent keeps: ( ) \' ! * ~', () => {
    expect(trustQuery("a(b)'!*~", 'n(p)m')).toBe('package=a%28b%29%27%21%2A%7E&source=n%28p%29m');
  });

  it('encodes a scoped name as before', () => {
    expect(trustQuery('@scope/my-package', 'npm')).toBe('package=%40scope%2Fmy-package&source=npm');
  });
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
      lookupTrust('https://registry.opena2a.org', 'some-package', 'npm', { retryDelayMs: 0 })
    ).rejects.toThrow('Registry returned unexpected status 500');
  });

  it('throws on network errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      lookupTrust('https://registry.opena2a.org', 'some-package', 'npm', { retryDelayMs: 0 })
    ).rejects.toThrow('Failed to connect to registry');
  });

  it('names the registry, not the parser error, when a 200 answer is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('<html>', { status: 200 }));

    await expect(
      lookupTrust('https://api.oa2a.org', 'some-package', 'npm', { retryDelayMs: 0 })
    ).rejects.toThrow(
      /^Registry at https:\/\/api\.oa2a\.org returned status 200 with a body that is not JSON\.$/
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
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

  describe('retries', () => {
    const found: TrustLookupResponse = {
      agentId: 'e3b58711-0f97-441c-8a83-4b1b5342a39f',
      name: 'hackmyagent',
      trustScore: 0.21666666666666667,
      trustLevel: 'discovered',
      profileUrl: 'https://registry.opena2a.org/agents/e3b58711-0f97-441c-8a83-4b1b5342a39f',
    };
    const ok = { ok: true, status: 200, json: async () => found };
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });

    it('retries a lookup that timed out and returns the next answer', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(ok);

      const result = await lookupTrust('https://api.oa2a.org', 'hackmyagent', 'npm', { retryDelayMs: 0 });
      expect(result).toEqual(found);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('retries a lookup whose body timed out and returns the next answer', async () => {
      const stalled = { ok: true, status: 200, json: () => Promise.reject(timeout) };
      global.fetch = jest.fn().mockResolvedValueOnce(stalled).mockResolvedValueOnce(ok);

      const result = await lookupTrust('https://api.oa2a.org', 'hackmyagent', 'npm', { retryDelayMs: 0 });
      expect(result).toEqual(found);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('reports a body that stops arriving as a failed read, not as a body that is not JSON', async () => {
      let requests = 0;
      const server = http.createServer((_request, response) => {
        requests++;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.write('{"agentId":');
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      try {
        await expect(
          lookupTrust(registryUrl, 'hackmyagent', 'npm', { attempts: 2, retryDelayMs: 0, timeoutMs: 1000 })
        ).rejects.toThrow(`Failed to read the answer from registry at ${registryUrl}: `);
        expect(requests).toBe(2);
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it.each([429, 500, 502, 503])('retries a %s and returns the next answer', async (status) => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status, statusText: 'Unavailable' })
        .mockResolvedValueOnce(ok);

      const result = await lookupTrust('https://api.oa2a.org', 'hackmyagent', 'npm', { retryDelayMs: 0 });
      expect(result).toEqual(found);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('fails after the last attempt when every attempt times out', async () => {
      global.fetch = jest.fn().mockRejectedValue(timeout);

      await expect(
        lookupTrust('https://api.oa2a.org', 'hackmyagent', 'npm', { attempts: 3, retryDelayMs: 0 })
      ).rejects.toThrow('Failed to connect to registry at https://api.oa2a.org: The operation was aborted due to timeout');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('makes three attempts by default', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

      await expect(
        lookupTrust('https://api.oa2a.org', 'hackmyagent', 'npm', { retryDelayMs: 0 })
      ).rejects.toThrow('Registry returned unexpected status 503');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('waits longer before each retry', async () => {
      jest.useFakeTimers();
      try {
        global.fetch = jest.fn().mockRejectedValue(timeout);
        const lookup = lookupTrust('https://api.oa2a.org', 'hackmyagent', 'npm', { retryDelayMs: 1000 });
        const settled = lookup.catch((error: Error) => error);

        await jest.advanceTimersByTimeAsync(999);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(1);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        await jest.advanceTimersByTimeAsync(1999);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        await jest.advanceTimersByTimeAsync(1);
        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(await settled).toBeInstanceOf(Error);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not retry a status that another attempt would not change', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });

      await expect(
        lookupTrust('https://api.oa2a.org', 'hackmyagent', 'npm', { retryDelayMs: 0 })
      ).rejects.toThrow('Registry returned unexpected status 400');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry a package with no trust profile', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      await expect(
        lookupTrust('https://api.oa2a.org', 'hackmyagent', 'npm', { retryDelayMs: 0 })
      ).resolves.toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
