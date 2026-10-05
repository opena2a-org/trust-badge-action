import { badgeMarkdown, resolveBadge } from '../src/badge';
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

  it('encodes the package name when the image names the package', () => {
    const badge = resolveBadge(REGISTRY, '@scope/my-agent', 'npm', { ...lookup, agentId: 'abc123' });
    expect(badge.imageUrl).toBe('https://api.oa2a.org/v1/trust/badge/%40scope%2Fmy-agent?source=npm');
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
