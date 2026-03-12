import { findBadgePosition, hasTrustBadge, updateBadge, wrapWithMarkers } from '../src/readme';

describe('wrapWithMarkers', () => {
  it('wraps badge markdown with HTML comment markers', () => {
    const badge = '[![OpenA2A Trust Score](https://registry.opena2a.org/v1/trust/abc/badge.svg)](https://registry.opena2a.org/agents/abc)';
    const result = wrapWithMarkers(badge);
    expect(result).toContain('<!-- opena2a-trust-badge -->');
    expect(result).toContain('<!-- /opena2a-trust-badge -->');
    expect(result).toContain(badge);
  });
});

describe('hasTrustBadge', () => {
  it('returns true when markers exist', () => {
    const content = '# My Project\n<!-- opena2a-trust-badge -->\nbadge here\n<!-- /opena2a-trust-badge -->';
    expect(hasTrustBadge(content)).toBe(true);
  });

  it('returns true when badge URL pattern exists without markers', () => {
    const content = '# My Project\n[![Trust](https://registry.opena2a.org/v1/trust/abc123/badge.svg)](https://registry.opena2a.org/agents/abc123)';
    expect(hasTrustBadge(content)).toBe(true);
  });

  it('returns false when no badge exists', () => {
    const content = '# My Project\n\nSome description.';
    expect(hasTrustBadge(content)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(hasTrustBadge('')).toBe(false);
  });
});

describe('findBadgePosition', () => {
  it('returns marker position when markers exist', () => {
    const content = '# Title\n<!-- opena2a-trust-badge -->\nold badge\n<!-- /opena2a-trust-badge -->';
    const pos = findBadgePosition(content);
    expect(pos).toBe(content.indexOf('<!-- opena2a-trust-badge -->'));
  });

  it('returns position after last badge line', () => {
    const content = '# Title\n[![Build](https://img.shields.io/build.svg)](https://ci.example.com)\n[![Coverage](https://img.shields.io/coverage.svg)](https://cov.example.com)\n\nDescription here.';
    const pos = findBadgePosition(content);
    // Should point to end of the last badge line
    const lines = content.split('\n');
    const expectedEnd = lines.slice(0, 3).join('\n').length;
    expect(pos).toBe(expectedEnd);
  });

  it('returns position after first heading when no badges exist', () => {
    const content = '# My Project\n\nSome description.';
    const pos = findBadgePosition(content);
    expect(pos).toBe('# My Project'.length);
  });

  it('returns 0 for content with no headings or badges', () => {
    const content = 'Just some text\nwithout headings.';
    const pos = findBadgePosition(content);
    expect(pos).toBe(0);
  });

  it('returns 0 for empty content', () => {
    expect(findBadgePosition('')).toBe(0);
  });
});

describe('updateBadge', () => {
  const badge = '[![OpenA2A Trust Score](https://registry.opena2a.org/v1/trust/abc/badge.svg)](https://registry.opena2a.org/agents/abc)';

  it('inserts badge after first heading when none exists', () => {
    const content = '# My Project\n\nA description of the project.';
    const result = updateBadge(content, badge);
    expect(result).toContain('<!-- opena2a-trust-badge -->');
    expect(result).toContain(badge);
    expect(result).toContain('A description of the project.');
    // Badge should come after the heading
    expect(result.indexOf('# My Project')).toBeLessThan(result.indexOf(badge));
  });

  it('replaces existing badge between markers', () => {
    const oldBadge = '[![OpenA2A Trust Score](https://registry.opena2a.org/v1/trust/old/badge.svg)](https://registry.opena2a.org/agents/old)';
    const content = `# My Project\n<!-- opena2a-trust-badge -->\n${oldBadge}\n<!-- /opena2a-trust-badge -->\n\nDescription.`;
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).not.toContain('old/badge.svg');
    expect(result).toContain('Description.');
  });

  it('inserts after other badges', () => {
    const content = '# My Project\n[![Build](https://img.shields.io/build.svg)](https://ci.example.com)\n\nDescription.';
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).toContain('[![Build]');
    // Trust badge should come after the build badge
    expect(result.indexOf('[![Build]')).toBeLessThan(result.indexOf('opena2a-trust-badge'));
  });

  it('handles README with no headings', () => {
    const content = 'Just some text without headings.';
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).toContain('Just some text');
    // Badge should be at the top
    expect(result.indexOf(badge)).toBeLessThan(result.indexOf('Just some text'));
  });

  it('handles empty README', () => {
    const result = updateBadge('', badge);
    expect(result).toContain(badge);
    expect(result).toContain('<!-- opena2a-trust-badge -->');
  });

  it('preserves existing content', () => {
    const content = '# My Project\n\n## Installation\n\n```bash\nnpm install my-project\n```\n\n## Usage\n\nUse it.';
    const result = updateBadge(content, badge);
    expect(result).toContain('## Installation');
    expect(result).toContain('npm install my-project');
    expect(result).toContain('## Usage');
    expect(result).toContain('Use it.');
  });

  it('is idempotent -- running twice produces same result', () => {
    const content = '# My Project\n\nDescription.';
    const firstRun = updateBadge(content, badge);
    const secondRun = updateBadge(firstRun, badge);
    expect(secondRun).toBe(firstRun);
  });

  it('handles orphaned start marker (no end marker)', () => {
    const content = '# My Project\n<!-- opena2a-trust-badge -->\nold stale badge line\n\nDescription.';
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).toContain('<!-- opena2a-trust-badge -->');
    expect(result).toContain('<!-- /opena2a-trust-badge -->');
    expect(result).not.toContain('old stale badge line');
    expect(result).toContain('Description.');
  });

  it('replaces badge URL pattern without markers', () => {
    const existingBadge = '[![OpenA2A Trust Score](https://registry.opena2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
    const content = `# My Project\n${existingBadge}\n\nDescription.`;
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).not.toContain('old-id');
    expect(result).toContain('<!-- opena2a-trust-badge -->');
  });
});
