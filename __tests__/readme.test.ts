import { findBadgePosition, hasTrustBadge, updateBadge, wrapWithMarkers } from '../src/readme';

describe('wrapWithMarkers', () => {
  it('wraps badge markdown with HTML comment markers', () => {
    const badge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/abc/badge.svg)](https://registry.opena2a.org/agents/abc)';
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
    const content = '# My Project\n[![Trust](https://api.oa2a.org/v1/trust/abc123/badge.svg)](https://registry.opena2a.org/agents/abc123)';
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
  const badge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/abc/badge.svg)](https://registry.opena2a.org/agents/abc)';

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
    const oldBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old/badge.svg)](https://registry.opena2a.org/agents/old)';
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

  it('replaces a package badge without markers instead of adding a second one', () => {
    const existingBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge?package=old-name&source=npm)](https://api.oa2a.org/v1/trust/lookup?package=old-name&source=npm)';
    const content = `# My Project\n${existingBadge}\n\nDescription.`;
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).not.toContain('old-name');
    expect(result.match(/\[!\[OpenA2A Trust/g)).toHaveLength(1);
  });

  it('replaces a package-name badge without markers instead of adding a second one', () => {
    const existingBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/old-name?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=old-name&source=npm)';
    const content = `# My Project\n${existingBadge}\n\nDescription.`;
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).not.toContain('old-name');
    expect(result.match(/\[!\[OpenA2A Trust/g)).toHaveLength(1);
  });

  it('replaces the earlier README example badge without markers', () => {
    const existingBadge = '[![OpenA2A Trust](https://api.oa2a.org/badge/my-package)](https://registry.opena2a.org/package/my-package)';
    const content = `# My Project\n${existingBadge}\n\nDescription.`;
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).not.toContain('my-package');
    expect(result.match(/\[!\[OpenA2A Trust/g)).toHaveLength(1);
  });

  it('replaces badge URL pattern without markers', () => {
    const existingBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
    const content = `# My Project\n${existingBadge}\n\nDescription.`;
    const result = updateBadge(content, badge);
    expect(result).toContain(badge);
    expect(result).not.toContain('old-id');
    expect(result).toContain('<!-- opena2a-trust-badge -->');
  });

  it.each([
    ['the package form', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge?package=old-name&source=npm)](https://api.oa2a.org/v1/trust/lookup?package=old-name&source=npm)'],
    ['the package-name form', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/old-name?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=old-name&source=npm)'],
    ['the earlier README example form', '[![OpenA2A Trust](https://api.oa2a.org/badge/old-name)](https://registry.opena2a.org/package/old-name)'],
    ['the agent-id form', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-name/badge.svg)](https://registry.opena2a.org/agents/old-name)'],
  ])('keeps other badges on the same line when it replaces an unmarked badge in %s', (_label, existingBadge) => {
    const npmBadge = '[![npm](https://img.shields.io/npm/v/p)](https://www.npmjs.com/package/p)';
    const licenseBadge = '[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)';
    const content = `# My Project\n${npmBadge} ${licenseBadge} ${existingBadge}\n\nDescription.`;
    const result = updateBadge(content, badge);
    expect(result).toContain(npmBadge);
    expect(result).toContain(licenseBadge);
    expect(result).toContain(badge);
    expect(result).not.toContain('old-name');
    expect(result.match(/\[!\[OpenA2A Trust/g)).toHaveLength(1);
  });

  it('keeps prose that precedes an unmarked badge on the same line', () => {
    const existingBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge?package=old-name&source=npm)](https://api.oa2a.org/v1/trust/lookup?package=old-name&source=npm)';
    const content = `# My Project\nSee [![build](https://img.shields.io/badge/build-passing-green)](./ci) and ${existingBadge}\n`;
    const result = updateBadge(content, badge);
    expect(result).toContain('See [![build](https://img.shields.io/badge/build-passing-green)](./ci) and ');
    expect(result).toContain(badge);
    expect(result).not.toContain('old-name');
  });

  describe('a badge whose link URL holds parentheses', () => {
    const existingBadge = '[![Trust](https://api.oa2a.org/v1/trust/old/badge.svg)](https://registry.opena2a.org/agents/old?x=(1))';

    it('replaces the badge instead of adding a second one', () => {
      const content = `# T\n\n${existingBadge}\n`;
      expect(updateBadge(content, badge)).toBe(`# T\n\n${wrapWithMarkers(badge)}\n`);
      expect(hasTrustBadge(content)).toBe(true);
    });

    it('ends the badge at the parenthesis that closes its link', () => {
      const content = `# T\n\n${existingBadge} (see the registry)\n`;
      expect(updateBadge(content, badge)).toBe(
        `# T\n\n<!-- opena2a-trust-badge -->\n${badge}<!-- /opena2a-trust-badge --> (see the registry)\n`
      );
    });
  });

  describe('code fences', () => {
    const example = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/example?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=example&source=npm)';

    it.each([
      ['a backtick fence', '```markdown', '```'],
      ['a tilde fence', '~~~', '~~~'],
      ['a longer fence', '````', '````'],
      ['an indented fence', '   ```', '   ```'],
    ])('leaves an unmarked badge inside %s alone', (_label, open, close) => {
      const fence = `${open}\n${example}\n${close}`;
      const content = `# My Project\n\n${fence}\n`;
      const result = updateBadge(content, badge);
      expect(result).toContain(fence);
      expect(result).toBe(`# My Project\n${wrapWithMarkers(badge)}\n\n${fence}\n`);
    });

    it('leaves an unmarked badge inside a fence in a blockquote alone', () => {
      const fence = `> \`\`\`markdown\n> ${example}\n> \`\`\``;
      const content = `# My Project\n\n${fence}\n`;
      expect(updateBadge(content, badge)).toBe(`# My Project\n${wrapWithMarkers(badge)}\n\n${fence}\n`);
    });

    it('leaves a badge inside a fence that is never closed alone', () => {
      const content = `# My Project\n\n\`\`\`\n${example}\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(`# My Project\n${wrapWithMarkers(badge)}\n\n\`\`\`\n${example}\n`);
    });

    it('replaces the badge after a fence when the fence holds an example of it', () => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const fence = `\`\`\`\n${example}\n\`\`\``;
      const content = `# My Project\n\n${fence}\n\n${own}\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(`# My Project\n\n${fence}\n\n${wrapWithMarkers(badge)}\n`);
    });

    it('leaves markers inside a fence alone', () => {
      const fence = '```markdown\n<!-- opena2a-trust-badge -->\n<!-- /opena2a-trust-badge -->\n```';
      const content = `# My Project\n\n${fence}\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(`# My Project\n${wrapWithMarkers(badge)}\n\n${fence}\n`);
      expect(hasTrustBadge(content)).toBe(false);
    });

    it('does not count a badge line or a heading inside a fence when placing the badge', () => {
      const content = `Intro text.\n\n\`\`\`bash\n# install\n${example}\n\`\`\`\n`;
      expect(findBadgePosition(content)).toBe(0);
    });

    it('treats a closing fence with a CRLF line ending as closed', () => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const content = `# My Project\r\n\r\n\`\`\`\r\n${example}\r\n\`\`\`\r\n\r\n${own}\r\n`;
      const result = updateBadge(content, badge);
      expect(result).toContain(example);
      expect(result).not.toContain('old-id');
    });

    it.each([
      ['an HTML <pre> block', `<pre>\n${example}\n</pre>`],
      ['a <pre> block with attributes, in upper case', `<PRE lang="markdown">\n${example}\n</PRE>`],
      ['a <pre> block on one line', `<pre>${example}</pre>`],
      ['a <pre> block in a blockquote', `> <pre>\n> ${example}\n> </pre>`],
      ['an indented code block', `Add this to your README:\n\n    ${example}`],
      ['an indented code block that holds a fence', `Add this to your README:\n\n    \`\`\`markdown\n    ${example}\n    \`\`\``],
      ['a fence indented four columns in an ordered list item', `1. Add this to your README:\n    \`\`\`markdown\n    ${example}\n    \`\`\``],
      ['a fence in a nested list item', `- Setup\n  - Add this to your README:\n    \`\`\`markdown\n    ${example}\n    \`\`\``],
      ['an HTML comment', `<!--\n${example}\n-->`],
      ['an HTML comment on one line', `<!-- ${example} -->`],
      ['the rest of a line that an HTML comment starts', `<!-- example -->${example}`],
      ['a <div> block', `<div>\n${example}\n</div>`],
      ['a <p> block with attributes', `<p align="center">\n${example}\n</p>`],
      ['a block tag that interrupts a paragraph', `Text\n<div>\n${example}`],
      ['a block tag line with trailing content', `<div><span>\n${example}`],
      ['a <div> block in a list item', `- <div>\n  x\n  ${example}`],
      ['a processing instruction', `<?php\n${example}\n?>`],
      ['a declaration', `<!DOCTYPE\n${example}\n>`],
      ['a CDATA section', `<![CDATA[\n${example}\n]]>`],
      ['a block opened by a line that holds one other tag', `<a href="https://example.com">\n${example}\n</a>`],
      ['a block opened by a lone closing </pre> line', `</pre>\n${example}`],
      ['a block opened by a lone closing </script> line', `</script>\n${example}`],
      ['a block opened by a lone closing </style> line', `</style>\n${example}`],
      ['a block opened by a lone closing </TEXTAREA> line', `</TEXTAREA>\n${example}`],
      ['an indented code block that starts a list item', `-     ${example}`],
      ['an indented code block that starts an ordered list item', `1.      ${example}`],
      ['an indented code block after a list marker and two tabs', `-\t\t${example}`],
    ])('leaves an unmarked badge inside %s alone', (_label, block) => {
      const content = `# My Project\n\n${block}\n`;
      expect(updateBadge(content, badge)).toBe(`# My Project\n${wrapWithMarkers(badge)}\n\n${block}\n`);
    });

    it('reads a ``` line indented four columns after a blank line as indented code, not a fence', () => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const indented = 'Indented example:\n\n    ```';
      const content = `# My Project\n\n${indented}\n\n${own}\n`;
      expect(updateBadge(content, badge)).toBe(`# My Project\n\n${indented}\n\n${wrapWithMarkers(badge)}\n`);
    });

    it.each([
      ['in a list item after a blank line', '- Badges:\n\n    '],
      ['continuing a paragraph', 'Badges:\n    '],
    ])('replaces a badge indented four columns %s, which is not code', (_label, before) => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const content = `# My Project\n\n${before}${own}\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(
        `# My Project\n\n${before}<!-- opena2a-trust-badge -->\n    ${badge}\n    <!-- /opena2a-trust-badge -->\n`
      );
      expect(updateBadge(result, badge)).toBe(result);
    });

    it.each([
      ['a list item', '- text\n', '  '],
      ['a nested list item', '- a\n  - b\n', '    '],
      ['a list item, indented with a tab', '- text\n', '\t'],
    ])('keeps a badge alone on a continuation line of %s, and its end marker, in that item', (_label, item, indent) => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const content = `# P\n\n${item}${indent}${own}\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(
        `# P\n\n${item}${indent}<!-- opena2a-trust-badge -->\n${indent}${badge}\n${indent}<!-- /opena2a-trust-badge -->\n`
      );
      expect(updateBadge(result, badge)).toBe(result);
    });

    it.each([
      ['a byte order mark', '', '﻿', ''],
      ['a no-break space', '# P\n\n', ' ', ''],
      ['spaces and a no-break space in a list item', '# P\n\n- text\n', '   ', '  '],
    ])('keeps only the spaces and tabs before a badge alone on its line after %s as its indentation', (_label, head, prefix, indent) => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const content = `${head}${prefix}${own}\n\n# End\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(
        `${head}${prefix}<!-- opena2a-trust-badge -->\n${indent}${badge}\n${indent}<!-- /opena2a-trust-badge -->\n\n# End\n`
      );
      expect(updateBadge(result, badge)).toBe(result);
    });

    it.each([
      ['after a one-line HTML comment', '<!-- badges: start -->\n', '\n<!-- badges: end -->'],
      ['in a <div> block that a blank line ends', '<div align="center">\n\n', '\n\n</div>'],
      ['on a line after a closing </pre>', `<pre>\n${example}\n</pre>\n`, ''],
      ['after a tag line that continues a paragraph', 'Badges:\n<a href="https://example.com">\n', ''],
      ['after a lone closing </pre> line that continues a paragraph', 'Badges:\n</pre>\n', ''],
    ])('replaces a badge %s, which is not code', (_label, before, after) => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const content = `# My Project\n\n${before}${own}${after}\n`;
      expect(updateBadge(content, badge)).toBe(
        `# My Project\n\n${before}${wrapWithMarkers(badge)}${after}\n`
      );
    });

    it('replaces a badge in a list item after a marker and four spaces, which is not code', () => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const content = `# My Project\n\n-    ${own}\n`;
      expect(updateBadge(content, badge)).toBe(
        `# My Project\n\n-    <!-- opena2a-trust-badge -->\n     ${badge}<!-- /opena2a-trust-badge -->\n`
      );
    });

    it.each([
      ['an HTML block', '- <div>\n  x\n'],
      ['a fenced code block', '- ```\n  x\n'],
    ])('ends %s in a list item at a line indented less than the item, and replaces the badge there', (_label, item) => {
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
      const content = `# My Project\n\n${item}${own}\n`;
      expect(updateBadge(content, badge)).toBe(`# My Project\n\n${item}${wrapWithMarkers(badge)}\n`);
      expect(hasTrustBadge(content)).toBe(true);
    });

    it('keeps markers inside a <div> block as the place for the badge', () => {
      const block = '<div>\n<!-- opena2a-trust-badge -->\nold\n<!-- /opena2a-trust-badge -->\n</div>';
      const content = `# My Project\n\n${block}\n`;
      expect(updateBadge(content, badge)).toBe(
        `# My Project\n\n<div>\n${wrapWithMarkers(badge)}\n</div>\n`
      );
      expect(hasTrustBadge(content)).toBe(true);
    });

    it('does not close a fence on a fence line indented four columns past the block', () => {
      const fence = `\`\`\`\n    \`\`\`\n${example}\n\`\`\``;
      const content = `# My Project\n\n${fence}\n`;
      expect(updateBadge(content, badge)).toBe(`# My Project\n${wrapWithMarkers(badge)}\n\n${fence}\n`);
    });

    it.each([
      ['a heading', '## Usage'],
      ['a thematic break', '***'],
    ])('reads a badge indented four columns directly after %s as indented code', (_label, line) => {
      const block = `${line}\n    ${example}`;
      const content = `# My Project\n\n${block}\n`;
      expect(updateBadge(content, badge)).toBe(`# My Project\n${wrapWithMarkers(badge)}\n\n${block}\n`);
    });
  });

  describe('on a README built to slow the badge pattern down', () => {
    it.each([
      ['repeated badge prefixes with no closing parenthesis', '[![x](https://api.oa2a.org/v1/trust/badge/'],
      ['repeated image openings with no closing bracket', '[!['],
      ['repeated empty fenced code blocks', '```\n```\n'],
      ['repeated indented code blocks', 'Text\n\n    code\n\n'],
      ['repeated badges whose link holds a pair of parentheses and never closes', '[![x](https://api.oa2a.org/v1/trust/badge/a)](l(p)'],
      ['repeated badges with an empty link', '[![x](https://api.oa2a.org/v1/trust/badge/a)]()'],
      ['repeated HTML comment openings', '<!--'],
      ['one tag with repeated attributes and no closing bracket', '<a x=1 '],
    ])('updates 300 KB of %s within a second', (_label, unit) => {
      const content = unit.repeat(Math.ceil(300_000 / unit.length));
      const started = Date.now();
      const result = updateBadge(content, badge);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(result).toContain(wrapWithMarkers(badge));
    });

    it('reads a line that holds one tag with a million attributes', () => {
      const attributes = ' x=y'.repeat(1_000_000);
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';

      // With no closing bracket the line is paragraph text, not a tag
      const unclosed = `# P\n\n<a${attributes}\n`;
      expect(updateBadge(unclosed, badge)).toBe(`# P\n${wrapWithMarkers(badge)}\n\n<a${attributes}\n`);

      // A complete tag starts an HTML block, which holds the badge on the line after it
      const block = `<a${attributes}>\n${own}`;
      expect(updateBadge(`# P\n\n${block}\n`, badge)).toBe(`# P\n${wrapWithMarkers(badge)}\n\n${block}\n`);
    });
  });

  describe('with the package the badge is written for', () => {
    const owner = { packageName: '@scope/my-agent', agentId: 'E3B58711-0F97-441C-8A83-4B1B5342A39F' };

    it.each([
      ['the agent-id form', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/e3b58711-0f97-441c-8a83-4b1b5342a39f/badge.svg)](https://registry.opena2a.org/agents/e3b58711-0f97-441c-8a83-4b1b5342a39f)'],
      ['the package form', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge?package=%40scope%2Fmy-agent&source=npm)](https://api.oa2a.org/v1/trust/lookup?package=%40scope%2Fmy-agent&source=npm)'],
      ['the package-name form', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/%40scope%2Fmy-agent?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=%40scope%2Fmy-agent&source=npm)'],
      ['the earlier README example form', '[![OpenA2A Trust](https://api.oa2a.org/badge/@scope/my-agent)](https://registry.opena2a.org/package/@scope/my-agent)'],
    ])('replaces its own badge in %s', (_label, existingBadge) => {
      const content = `# My Project\n${existingBadge}\n\nDescription.`;
      const result = updateBadge(content, badge, owner);
      expect(result).toBe(`# My Project\n${wrapWithMarkers(badge)}\n\nDescription.`);
      expect(hasTrustBadge(content, owner)).toBe(true);
    });

    it.each([
      ['an agent-id badge for another agent', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/2d619697-fd82-44ba-bf31-68d0d06ad697/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=other&source=npm)'],
      ['a package badge for another package', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge?package=other&source=npm)](https://api.oa2a.org/v1/trust/lookup?package=other&source=npm)'],
      ['a package-name badge for another package', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/other?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=other&source=npm)'],
      ['an earlier README example badge for another package', '[![OpenA2A Trust](https://api.oa2a.org/badge/other)](https://registry.opena2a.org/package/other)'],
      ['a badge for a package whose name only starts the same', '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/%40scope%2Fmy-agent-extra?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=%40scope%2Fmy-agent-extra&source=npm)'],
    ])('keeps %s and adds its own badge', (_label, otherBadge) => {
      const content = `# My Project\n${otherBadge}\n\nDescription.`;
      const result = updateBadge(content, badge, owner);
      expect(result).toBe(`# My Project\n${otherBadge}\n${wrapWithMarkers(badge)}\n\nDescription.`);
      expect(hasTrustBadge(content, owner)).toBe(false);
    });

    it('replaces its own badge and keeps the one for another package before it', () => {
      const other = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/other?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=other&source=npm)';
      const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/%40scope%2Fmy-agent?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=%40scope%2Fmy-agent&source=npm)';
      const content = `# My Project\n${other}\n${own}\n\nDescription.`;
      const result = updateBadge(content, badge, owner);
      expect(result).toBe(`# My Project\n${other}\n${wrapWithMarkers(badge)}\n\nDescription.`);
    });
  });

  describe('a badge on a line with other badges', () => {
    const npmBadge = '[![npm](https://img.shields.io/npm/v/p)](https://www.npmjs.com/package/p)';
    const licenseBadge = '[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)';
    const inlineWrapped = `<!-- opena2a-trust-badge -->${badge}<!-- /opena2a-trust-badge -->`;

    it('keeps the markers and the badge on that line', () => {
      const existingBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=p&source=npm)';
      const content = `${npmBadge} ${licenseBadge} ${existingBadge}\n\n# My Project\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(`${npmBadge} ${licenseBadge} ${inlineWrapped}\n\n# My Project\n`);
    });

    // A line whose content starts with a marker is an HTML block, which GitHub shows as raw text:
    // the badge and the rest of the line would show as markdown source, not as images
    const startsWithMarker = (result: string): string[] =>
      result
        .split('\n')
        .filter((line) => /^(?:[ \t>]|(?:[-+*]|\d{1,9}[.)])[ \t])*<!--/.test(line))
        .filter((line) => !/^[ \t>]*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+)*<!-- \/?opena2a-trust-badge -->$/.test(line));

    it.each([
      ['at the start of the line', '', ''],
      ['after indentation', '  ', '  '],
      ['in a list item', '- ', '  '],
      ['in an ordered list item in a blockquote', '> 1. ', '>    '],
    ])('puts the start marker on a line of its own when the badge comes first %s', (_label, prefix, continuation) => {
      const existingBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=p&source=npm)';
      const content = `# My Project\n\n${prefix}${existingBadge} ${npmBadge}\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(
        `# My Project\n\n${prefix}<!-- opena2a-trust-badge -->\n${continuation}${badge}<!-- /opena2a-trust-badge --> ${npmBadge}\n`
      );
      expect(startsWithMarker(result)).toEqual([]);
      expect(updateBadge(result, badge)).toBe(result);
    });

    it('puts the start marker on a line of its own for a badge alone in a blockquote', () => {
      const existingBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=p&source=npm)';
      const result = updateBadge(`# My Project\n\n> ${existingBadge}\n`, badge);
      expect(result).toBe(`# My Project\n\n> <!-- opena2a-trust-badge -->\n> ${badge}<!-- /opena2a-trust-badge -->\n`);
      expect(updateBadge(result, badge)).toBe(result);
    });

    it.each([
      ['with other badges after it', ` ${npmBadge}`],
      ['alone on its line', ''],
    ])('moves the start marker of an earlier inline badge that starts its line onto a line of its own, %s', (_label, rest) => {
      const content = `# My Project\n\n<!-- opena2a-trust-badge -->[![T](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)<!-- /opena2a-trust-badge -->${rest}\n`;
      const result = updateBadge(content, badge);
      expect(result).toBe(
        `# My Project\n\n<!-- opena2a-trust-badge -->\n${badge}<!-- /opena2a-trust-badge -->${rest}\n`
      );
      expect(startsWithMarker(result)).toEqual([]);
    });

    it('is idempotent and keeps updating the badge on that line', () => {
      const existingBadge = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=p&source=npm)';
      const content = `# My Project\n\n${npmBadge} ${existingBadge} ${licenseBadge}\n\nDescription.`;
      const firstRun = updateBadge(content, badge);
      expect(updateBadge(firstRun, badge)).toBe(firstRun);

      const newer = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/new-id/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=p&source=npm)';
      const secondRun = updateBadge(firstRun, newer);
      expect(secondRun).toBe(
        `# My Project\n\n${npmBadge} <!-- opena2a-trust-badge -->${newer}<!-- /opena2a-trust-badge --> ${licenseBadge}\n\nDescription.`
      );
    });

    it('keeps markers on their own lines when they are on their own lines', () => {
      const content = `# My Project\n<!-- opena2a-trust-badge -->\nold\n<!-- /opena2a-trust-badge -->\n`;
      expect(updateBadge(content, badge)).toBe(`# My Project\n${wrapWithMarkers(badge)}\n`);
    });

    it('keeps the line break after a start marker that follows text on its line', () => {
      const content = 'text <!-- opena2a-trust-badge -->\n  old<!-- /opena2a-trust-badge -->\n';
      const result = updateBadge(content, badge);
      expect(result).toBe(`text <!-- opena2a-trust-badge -->\n  ${badge}<!-- /opena2a-trust-badge -->\n`);
      expect(updateBadge(result, badge)).toBe(result);
    });

    it('keeps four columns of indentation after a start marker in a paragraph, which the badge continues', () => {
      const content = 'text <!-- opena2a-trust-badge -->\n    old<!-- /opena2a-trust-badge -->\n';
      const result = updateBadge(content, badge);
      expect(result).toBe(`text <!-- opena2a-trust-badge -->\n    ${badge}<!-- /opena2a-trust-badge -->\n`);
      expect(updateBadge(result, badge)).toBe(result);
    });

    it.each([
      [
        'starts its line',
        '<!-- opena2a-trust-badge -->\n    a\nb<!-- /opena2a-trust-badge -->\n',
        `<!-- opena2a-trust-badge -->\n${badge}<!-- /opena2a-trust-badge -->\n`,
      ],
      [
        'starts a list item',
        '- <!-- opena2a-trust-badge -->\n      old\n  <!-- /opena2a-trust-badge -->\n',
        `- <!-- opena2a-trust-badge -->\n  ${badge}\n  <!-- /opena2a-trust-badge -->\n`,
      ],
      [
        'ends a heading',
        '# T <!-- opena2a-trust-badge -->\n    old\n<!-- /opena2a-trust-badge -->\n',
        `# T <!-- opena2a-trust-badge -->\n${badge}\n<!-- /opena2a-trust-badge -->\n`,
      ],
      [
        'starts a line in a blockquote',
        '> <!-- opena2a-trust-badge -->\n>     old\n> <!-- /opena2a-trust-badge -->\n',
        `> <!-- opena2a-trust-badge -->\n> ${badge}\n> <!-- /opena2a-trust-badge -->\n`,
      ],
    ])('gives the badge the indentation of a start marker that %s when the kept indentation would make it code', (_label, content, expected) => {
      const result = updateBadge(content, badge);
      expect(result).toBe(expected);
      expect(updateBadge(result, badge)).toBe(result);
    });
  });

  describe('in a README with CRLF line endings', () => {
    const own = '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/old-id/badge.svg)](https://registry.opena2a.org/agents/old-id)';
    const wrapped = `<!-- opena2a-trust-badge -->\r\n${badge}\r\n<!-- /opena2a-trust-badge -->`;
    const npmBadge = '[![npm](https://img.shields.io/npm/v/p)](https://www.npmjs.com/package/p)';

    it.each([
      ['inserts the badge after the heading', '# P\r\n\r\nDescription.\r\n', `# P\r\n${wrapped}\r\n\r\nDescription.\r\n`],
      ['inserts the badge after the other badges', `# P\r\n${npmBadge}\r\n`, `# P\r\n${npmBadge}\r\n${wrapped}\r\n`],
      ['inserts the badge at the top', 'Description.\r\n', `${wrapped}\r\n\r\nDescription.\r\n`],
      ['replaces a badge alone on its line', `# P\r\n\r\n${own}\r\n`, `# P\r\n\r\n${wrapped}\r\n`],
      ['replaces a badge alone on a list continuation line', `# P\r\n\r\n- text\r\n  ${own}\r\n`, `# P\r\n\r\n- text\r\n  <!-- opena2a-trust-badge -->\r\n  ${badge}\r\n  <!-- /opena2a-trust-badge -->\r\n`],
      ['replaces a badge that starts a line with other text', `# P\r\n\r\n${own} x\r\n`, `# P\r\n\r\n<!-- opena2a-trust-badge -->\r\n${badge}<!-- /opena2a-trust-badge --> x\r\n`],
      ['moves an inline start marker that starts its line onto a line of its own', `# P\r\n\r\n<!-- opena2a-trust-badge -->${own}<!-- /opena2a-trust-badge --> x\r\n`, `# P\r\n\r\n<!-- opena2a-trust-badge -->\r\n${badge}<!-- /opena2a-trust-badge --> x\r\n`],
      ['replaces an orphaned start marker through the blank line', '# P\r\n<!-- opena2a-trust-badge -->\r\nold\r\n\r\nDescription.\r\n', `# P\r\n${wrapped}\r\n\r\nDescription.\r\n`],
      ['replaces an orphaned start marker with no blank line after it to the end of its line', '# P\r\n<!-- opena2a-trust-badge -->\r\nold\r\nmore\r\n', `# P\r\n${wrapped}\r\nold\r\nmore\r\n`],
      ['inserts the badge in content that starts with a line break', '\r\n# P\r\n\r\ntext\r\n', `\r\n# P\r\n${wrapped}\r\n\r\ntext\r\n`],
      ['moves a badge that kept indentation would make code to the start marker\'s indentation', '<!-- opena2a-trust-badge -->\r\n    old\r\n<!-- /opena2a-trust-badge -->\r\n', `${wrapped}\r\n`],
    ])('%s and ends every line it adds with CRLF', (_label, content, expected) => {
      const result = updateBadge(content, badge);
      expect(result).toBe(expected);
      expect(result.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
      expect(updateBadge(result, badge)).toBe(result);
    });

    it('places the badge before the CR that ends a line', () => {
      expect(findBadgePosition('# P\r\n\r\nDescription.\r\n')).toBe('# P'.length);
    });
  });
});
