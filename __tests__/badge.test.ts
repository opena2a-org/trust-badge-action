import { badgeMarkdown, resolveBadge } from '../src/badge';
import { updateBadge } from '../src/readme';
import { TrustLookupResponse } from '../src/registry';

const REGISTRY = 'https://api.oa2a.org';

// A lookup response as the registry returns it today: an agent id, no badge fields, and a
// profileUrl on a host that does not resolve.
const lookup: TrustLookupResponse = {
  agentId: 'e3b58711-0f97-441c-8a83-4b1b5342a39f',
  name: '@scope/my-agent',
  trustScore: 0.67,
  trustLevel: 'discovered',
  profileUrl: 'https://registry.opena2a.org/agents/e3b58711-0f97-441c-8a83-4b1b5342a39f',
};

describe('resolveBadge', () => {
  it('builds the image from the agent id the lookup returned and the link from the package and source inputs', () => {
    const badge = resolveBadge(REGISTRY, '@scope/my-agent', 'npm', lookup);
    expect(badge).toEqual({
      imageUrl: 'https://api.oa2a.org/v1/trust/e3b58711-0f97-441c-8a83-4b1b5342a39f/badge.svg',
      linkUrl: 'https://api.oa2a.org/v1/trust/lookup?package=%40scope%2Fmy-agent&source=npm',
    });
  });

  it('never builds the image from the package query, a route the registry does not serve', () => {
    const badge = resolveBadge(REGISTRY, '@scope/my-agent', 'npm', lookup);
    expect(badge.imageUrl).not.toContain('/v1/trust/badge?');
    const unscoped = resolveBadge(REGISTRY, 'my-agent', 'npm', { ...lookup, agentId: 'not-an-id' });
    expect(unscoped.imageUrl).not.toContain('/v1/trust/badge?');
  });

  it('never writes a link to the profile host', () => {
    const badge = resolveBadge(REGISTRY, '@scope/my-agent', 'npm', lookup);
    expect(badgeMarkdown(badge)).not.toContain('registry.opena2a.org');
  });

  it('uses the source input', () => {
    const badge = resolveBadge(REGISTRY, 'my_python_agent', 'pypi', lookup);
    expect(badge.imageUrl).toBe('https://api.oa2a.org/v1/trust/e3b58711-0f97-441c-8a83-4b1b5342a39f/badge.svg');
    expect(badge.linkUrl).toBe('https://api.oa2a.org/v1/trust/lookup?package=my_python_agent&source=pypi');
  });

  it.each([
    ['a short id', 'abc123'],
    ['an id that would close the markdown image', 'x)](https://example.com/y'],
    ['an id with a path in it', '../../lookup'],
    ['a UUID with something after it', 'e3b58711-0f97-441c-8a83-4b1b5342a39f/../x'],
    ['an empty id', ''],
    ['an id that is not a string', 42],
  ])('names the package in the image instead of writing %s', (_label, agentId) => {
    const badge = resolveBadge(REGISTRY, 'my_python_agent', 'pypi', {
      ...lookup,
      agentId: agentId as string,
    });
    expect(badge).toEqual({
      imageUrl: 'https://api.oa2a.org/v1/trust/badge/my_python_agent?source=pypi',
      linkUrl: 'https://api.oa2a.org/v1/trust/lookup?package=my_python_agent&source=pypi',
    });
  });

  it.each([
    ['a scoped npm name', '@scope/my-agent', 'npm'],
    ['an owner/repo name', 'my-org/my-agent', 'github'],
  ])('writes no image by name for %s without an agent id, a route the registry answers with 404', (_label, name, source) => {
    expect(() => resolveBadge(REGISTRY, name, source, { ...lookup, agentId: 'abc123' })).toThrow(
      `The registry lookup for ${name} returned no agent id, and the registry serves no badge image by name for a package name that contains "/".`
    );
  });

  it('still writes the agent-id image for a scoped name when the lookup returned an agent id', () => {
    const badge = resolveBadge(REGISTRY, '@scope/my-agent', 'npm', lookup);
    expect(badge.imageUrl).toBe('https://api.oa2a.org/v1/trust/e3b58711-0f97-441c-8a83-4b1b5342a39f/badge.svg');
  });

  it('uses the badge image and link the lookup returns when it returns both', () => {
    const badge = resolveBadge(REGISTRY, '@scope/my-agent', 'npm', {
      ...lookup,
      badgeImageUrl: 'https://api.oa2a.org/v1/trust/badge?package=%40scope%2Fmy-agent&source=npm',
      badgeLinkUrl: 'https://api.oa2a.org/v1/trust/badge-link?package=%40scope%2Fmy-agent&source=npm',
    });
    expect(badge).toEqual({
      imageUrl: 'https://api.oa2a.org/v1/trust/badge?package=%40scope%2Fmy-agent&source=npm',
      linkUrl: 'https://api.oa2a.org/v1/trust/badge-link?package=%40scope%2Fmy-agent&source=npm',
    });
  });

  it('falls back to the built pair when the lookup returns only one of the two', () => {
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', {
      ...lookup,
      badgeImageUrl: 'https://api.oa2a.org/v1/trust/badge?package=my-agent&source=npm',
    });
    expect(badge.imageUrl).toBe('https://api.oa2a.org/v1/trust/e3b58711-0f97-441c-8a83-4b1b5342a39f/badge.svg');
    expect(badge.linkUrl).toBe('https://api.oa2a.org/v1/trust/lookup?package=my-agent&source=npm');
  });

  it.each([
    ['a non-https URL', 'http://api.oa2a.org/v1/trust/badge?package=my-agent&source=npm'],
    ['a value that is not a URL', 'not a url'],
    ['a value that would close the markdown link', 'https://api.oa2a.org/x)](https://example.com/y'],
    ['a URL with a NUL character', 'https://api.oa2a.org/x\u0000y'],
    ['a URL with an escape character', 'https://api.oa2a.org/x\u001bcy'],
    ['a URL with a unit separator', 'https://api.oa2a.org/x\u001fy'],
    ['a URL with a DEL character', 'https://api.oa2a.org/x\u007fy'],
    ['a URL with a "|", which would split the pull request table cell', 'https://api.oa2a.org/x|y'],
  ])('ignores %s from the lookup', (_label, value) => {
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', {
      ...lookup,
      badgeImageUrl: value,
      badgeLinkUrl: value,
    });
    expect(badge).toEqual({
      imageUrl: 'https://api.oa2a.org/v1/trust/e3b58711-0f97-441c-8a83-4b1b5342a39f/badge.svg',
      linkUrl: 'https://api.oa2a.org/v1/trust/lookup?package=my-agent&source=npm',
    });
  });
});

describe('resolveBadge with badge URLs from the lookup', () => {
  const builtPair = {
    imageUrl: 'https://api.oa2a.org/v1/trust/e3b58711-0f97-441c-8a83-4b1b5342a39f/badge.svg',
    linkUrl: 'https://api.oa2a.org/v1/trust/lookup?package=my-agent&source=npm',
  };

  it.each([
    ['both on another host', 'https://img.example.net/b.svg', 'https://www.example.net/p'],
    ['the image on another host', 'https://img.example.net/b.svg', 'https://api.oa2a.org/v1/trust/lookup?package=my-agent&source=npm'],
    ['the link on another host', 'https://api.oa2a.org/v1/trust/badge/my-agent?source=npm', 'https://www.example.net/p'],
    ['both on a subdomain of the registry host', 'https://x.api.oa2a.org/b.svg', 'https://x.api.oa2a.org/p'],
    ['both on another port of the registry host', 'https://api.oa2a.org:8443/b.svg', 'https://api.oa2a.org:8443/p'],
    ['both on a host that only starts with the registry host', 'https://api.oa2a.org.example.net/b.svg', 'https://api.oa2a.org.example.net/p'],
    ['both on another host behind registry-host userinfo', 'https://api.oa2a.org@example.net/b.svg', 'https://api.oa2a.org@example.net/p'],
  ])('builds the pair when the lookup returns %s', (_label, badgeImageUrl, badgeLinkUrl) => {
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', { ...lookup, badgeImageUrl, badgeLinkUrl });
    expect(badge).toEqual(builtPair);
  });

  it('accepts both on the origin of the registry URL, whatever its letter case', () => {
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', {
      ...lookup,
      badgeImageUrl: 'https://API.oa2a.org/v1/trust/badge/my-agent?source=npm',
      badgeLinkUrl: 'https://api.oa2a.org:443/v1/trust/lookup?package=my-agent&source=npm',
    });
    expect(badge).toEqual({
      imageUrl: 'https://API.oa2a.org/v1/trust/badge/my-agent?source=npm',
      linkUrl: 'https://api.oa2a.org:443/v1/trust/lookup?package=my-agent&source=npm',
    });
  });

  it('accepts both on the origin of a registry URL with its own host and path', () => {
    const badge = resolveBadge('https://registry.internal.example/api', 'my-agent', 'npm', {
      ...lookup,
      badgeImageUrl: 'https://registry.internal.example/b.svg',
      badgeLinkUrl: 'https://registry.internal.example/p',
    });
    expect(badge).toEqual({
      imageUrl: 'https://registry.internal.example/b.svg',
      linkUrl: 'https://registry.internal.example/p',
    });
  });
});

describe('resolveBadge encoding of the package name and source', () => {
  it('percent-encodes ( ) \' ! * ~ in the image path and the link query', () => {
    const badge = resolveBadge(REGISTRY, "a(b)'!*~", 'n(p)m', { ...lookup, agentId: 'not-an-id' });
    expect(badge).toEqual({
      imageUrl: 'https://api.oa2a.org/v1/trust/badge/a%28b%29%27%21%2A%7E?source=n%28p%29m',
      linkUrl: 'https://api.oa2a.org/v1/trust/lookup?package=a%28b%29%27%21%2A%7E&source=n%28p%29m',
    });
  });

  it('writes a badge for a name with parentheses that a later run finds and replaces', () => {
    const owner = { packageName: 'a(b)' };
    const first = badgeMarkdown(resolveBadge(REGISTRY, 'a(b)', 'npm', { ...lookup, agentId: 'not-an-id' }));
    const updated = badgeMarkdown(resolveBadge(REGISTRY, 'a(b)', 'npm', lookup));
    const result = updateBadge(`# My Project\n${first}\n\nDescription.`, updated, owner);
    expect(result).toContain(updated);
    expect(result).not.toContain(first);
    expect(result.match(/OpenA2A Trust Score/g)).toHaveLength(1);
  });
});

describe('badgeMarkdown', () => {
  it('writes the image wrapped in the link', () => {
    expect(
      badgeMarkdown({
        imageUrl: 'https://api.oa2a.org/v1/trust/badge?package=hackmyagent&source=npm',
        linkUrl: 'https://api.oa2a.org/v1/trust/lookup?package=hackmyagent&source=npm',
      })
    ).toBe(
      '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge?package=hackmyagent&source=npm)](https://api.oa2a.org/v1/trust/lookup?package=hackmyagent&source=npm)'
    );
  });
});
