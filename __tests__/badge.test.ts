import { badgeMarkdown, resolveBadge } from '../src/badge';
import { TrustLookupResponse } from '../src/registry';

const REGISTRY = 'https://api.oa2a.org';

// A lookup response as the registry returns it today: no badge fields, and a profileUrl on a
// host that does not resolve.
const lookup: TrustLookupResponse = {
  agentId: 'e3b58711-0f97-441c-8a83-4b1b5342a39f',
  name: '@scope/my-agent',
  trustScore: 0.67,
  trustLevel: 'discovered',
  profileUrl: 'https://registry.opena2a.org/agents/e3b58711-0f97-441c-8a83-4b1b5342a39f',
};

describe('resolveBadge', () => {
  it('builds the package badge and the lookup link from the package and source inputs', () => {
    const badge = resolveBadge(REGISTRY, '@scope/my-agent', 'npm', lookup);
    expect(badge).toEqual({
      imageUrl: 'https://api.oa2a.org/v1/trust/badge?package=%40scope%2Fmy-agent&source=npm',
      linkUrl: 'https://api.oa2a.org/v1/trust/lookup?package=%40scope%2Fmy-agent&source=npm',
    });
  });

  it('never writes the agent-id badge or a link to the profile host', () => {
    const badge = resolveBadge(REGISTRY, '@scope/my-agent', 'npm', lookup);
    const markdown = badgeMarkdown(badge);
    expect(markdown).not.toContain(lookup.agentId);
    expect(markdown).not.toContain('badge.svg');
    expect(markdown).not.toContain('registry.opena2a.org');
  });

  it('uses the source input', () => {
    const badge = resolveBadge(REGISTRY, 'my_python_agent', 'pypi', lookup);
    expect(badge.imageUrl).toBe('https://api.oa2a.org/v1/trust/badge?package=my_python_agent&source=pypi');
    expect(badge.linkUrl).toBe('https://api.oa2a.org/v1/trust/lookup?package=my_python_agent&source=pypi');
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
      imageUrl: 'https://api.oa2a.org/v1/trust/badge?package=my-agent&source=npm',
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
