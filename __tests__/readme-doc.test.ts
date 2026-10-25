import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';
import { badgeMarkdown, resolveBadge } from '../src/badge';
import { detectPackageName } from '../src/detect';
import { INPUT_NAMES } from '../src/main';
import { hasTrustBadge, updateBadge } from '../src/readme';
import { TrustLookupResponse, lookupTrust } from '../src/registry';

function readme(): string {
  return fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf-8');
}

function actionYml(): string {
  return fs.readFileSync(path.join(__dirname, '..', 'action.yml'), 'utf-8');
}

// The default action.yml gives an input, or '' for an input with none.
function inputDefaults(): Array<[string, string]> {
  const inputsBlock = actionYml().split(/^outputs:/m)[0].split(/^inputs:/m)[1];
  return [...inputsBlock.matchAll(/^ {2}([a-z-]+):\n((?: {4}.*\n)*)/gm)].map(([, name, body]) => [
    name,
    body.match(/^ {4}default: '([^']*)'/m)?.[1] ?? '',
  ]);
}

const REGISTRY = 'https://api.oa2a.org';

function lookup(agentId: string): TrustLookupResponse {
  return {
    agentId,
    name: 'my-agent',
    trustScore: 0.5,
    trustLevel: 'scanned',
    profileUrl: '',
  };
}

// Each manifest file the package name is read from, with content that names a package.
const MANIFESTS: Array<[string, string]> = [
  ['package.json', JSON.stringify({ name: 'manifest-package' })],
  ['pyproject.toml', '[project]\nname = "manifest-package"\n'],
  ['setup.py', 'setup(name="manifest-package")\n'],
  ['setup.cfg', '[metadata]\nname = manifest-package\n'],
];

describe('README.md', () => {
  it('shows the uses: step for this action within the 30 lines after the ecosystem line', () => {
    const lines = readme().split('\n');
    // Counted from the ecosystem line (`> **[OpenA2A`), or from line 1 where there is none, so the
    // header block above it never pays for the start block.
    const ecosystemLine = lines.findIndex((line) => line.startsWith('> **[OpenA2A')) + 1;
    const stepLine = lines.findIndex((line) => /uses: +opena2a-org\/trust-badge-action@/.test(line)) + 1;
    expect(stepLine).toBeGreaterThanOrEqual(1);
    expect(stepLine - ecosystemLine).toBeLessThanOrEqual(30);
  });

  it.each(MANIFESTS)('names %s, a file the package name is detected from', (file, content) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-doc-'));
    try {
      fs.writeFileSync(path.join(dir, file), content);
      expect(detectPackageName(dir)).toBe('manifest-package');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(readme()).toContain(`\`${file}\``);
  });

  it('says the lookup source stays at the package-source default whatever file the name came from', () => {
    const sourceDefault = inputDefaults().find(([name]) => name === 'package-source')?.[1];
    expect(sourceDefault).toBe('npm');
    expect(readme()).toContain(`source stays \`${sourceDefault}\``);
  });

  it('shows the badge the action builds from the agent id the lookup returns', () => {
    const agentId = '00000000-0000-0000-0000-000000000000';
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', lookup(agentId));
    const imageUrl = badge.imageUrl.replace(agentId, '<agent-id>');
    const linkUrl = badge.linkUrl
      .replace('package=my-agent', 'package=<package-name>')
      .replace('source=npm', 'source=<package-source>');
    expect(readme()).toContain(`[![OpenA2A Trust Score](${imageUrl})](${linkUrl})`);
  });

  it('renders a badge built from an agent id above the badge example, and shows the example only as code', () => {
    const content = readme();
    const example = `[![OpenA2A Trust Score](${REGISTRY}/v1/trust/<agent-id>/badge.svg)](${REGISTRY}/v1/trust/lookup?package=<package-name>&source=<package-source>)`;
    const placeholders = { packageName: '<package-name>', agentId: '<agent-id>' };

    // Outside a code block the example is a badge for the literal agent id <agent-id>
    expect(hasTrustBadge(example, placeholders)).toBe(true);
    expect(hasTrustBadge(content, placeholders)).toBe(false);

    // Above it, outside any code block, is the badge the action writes from an agent id
    const live =
      /\[!\[OpenA2A Trust Score\]\(https:\/\/api\.oa2a\.org\/v1\/trust\/([0-9a-f-]{36})\/badge\.svg\)\]\(https:\/\/api\.oa2a\.org\/v1\/trust\/lookup\?package=([^&()]+)&source=([^&()]+)\)/.exec(
        content
      );
    expect(live).not.toBeNull();
    const [text, agentId, packageName, source] = live as RegExpExecArray;
    expect(badgeMarkdown(resolveBadge(REGISTRY, packageName, source, lookup(agentId)))).toBe(text);
    expect(hasTrustBadge(content, { packageName, agentId })).toBe(true);
    expect(content.indexOf(example)).toBeGreaterThan((live as RegExpExecArray).index);
  });

  it('shows the image that names the package when the lookup returns no agent id', () => {
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', lookup(''));
    const imageUrl = badge.imageUrl
      .replace('/badge/my-agent', '/badge/<package-name>')
      .replace('source=npm', 'source=<package-source>');
    expect(imageUrl).toBe(`${REGISTRY}/v1/trust/badge/<package-name>?source=<package-source>`);
    expect(readme()).toContain(`\`${imageUrl}\``);
  });

  it('says the badge links to the JSON trust lookup, the URL the action reads the trust score from', async () => {
    expect(readme()).toContain(
      "The badge links to the registry's JSON trust lookup for the package, the URL the action reads the trust score from, not to a web page."
    );
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', lookup('00000000-0000-0000-0000-000000000000'));
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    try {
      await lookupTrust(REGISTRY, 'my-agent', 'npm');
      expect(global.fetch).toHaveBeenCalledWith(
        badge.linkUrl,
        expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('lists the package sources the registry accepts in action.yml and in the inputs table', () => {
    // The sources the registry's 400 answer names for a source it does not know
    const sources = ['npm', 'pypi', 'github', 'dockerhub', 'a2as'];
    expect(actionYml()).toContain(`    description: 'Package source: ${sources.join(', ')}'\n`);
    const row = readme().split('\n').find((line) => line.startsWith('| `package-source` |'));
    expect(row).toContain(`| Package source: ${sources.map((source) => `\`${source}\``).join(', ')} |`);
  });

  it('names blocked, and what it means, with the other trust levels in the outputs table', () => {
    const row = readme().split('\n').find((line) => line.startsWith('| `trust-level` |'));
    expect(row).toContain(
      '| Level: discovered, scanned, claimed, verified, certified, or blocked for a package the registry has blocked'
    );
  });

  it('says in a Trust Score section where the score and level come from, the scale and the levels', () => {
    const section = readme()
      .split(/^## /m)
      .find((part) => part.startsWith('Trust Score\n'));
    expect(section).toBeDefined();
    const text = section as string;
    expect(text).toContain('come from the OpenA2A Registry');
    expect(text).toContain('computes neither');
    expect(text).toContain('from 0 to 1');
    expect(text).toContain('from 0 to 100 with the fraction dropped');

    // The example follows the rule the run checks the badge image against: the lookup's score times
    // 100 with the fraction dropped
    const example = /a score of (0\.\d+) shows as (\d+)/.exec(text);
    expect(example).not.toBeNull();
    const [, score, shown] = example as RegExpExecArray;
    expect(Math.trunc(Number(score) * 100)).toBe(Number(shown));

    // The levels the outputs table names
    const row = readme().split('\n').find((line) => line.startsWith('| `trust-level` |')) as string;
    for (const level of ['discovered', 'scanned', 'claimed', 'verified', 'certified', 'blocked']) {
      expect([level, row.includes(level), text.includes(level)]).toEqual([level, true, true]);
    }

    // Where the lookup answer the badge links to says whether and when the registry scanned the package
    expect(text).toContain('`scanSummary`');
    expect(text).toContain('`not_scanned`');
    expect(text).toContain('`lastScannedAt`');
    // The date is not promised for every scanned answer: the registry answers some with no lastScannedAt
    expect(text).toContain('`lastScannedAt` when the answer has one');
  });

  it('links the page that lists the documented behaviour the v1 tag does not have', () => {
    expect(readme()).toMatch(/uses: +opena2a-org\/trust-badge-action@v1\n/);
    expect(readme()).toContain('](docs/v1-tag.md)');
    const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'v1-tag.md'), 'utf-8');
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', lookup(''));
    const registryDefault = inputDefaults().find(([name]) => name === 'registry-url')?.[1];
    expect(registryDefault).toBe(REGISTRY);
    expect(page).toContain(`\`${registryDefault}\``);
    expect(page).toContain('`github-token`');
    expect(page).toContain(`\`${REGISTRY}/v1/trust/lookup?package=<package-name>&source=<package-source>\``);
    expect(badge.imageUrl).toBe(`${REGISTRY}/v1/trust/badge/my-agent?source=npm`);
    expect(page).toContain('`<registry-url>/v1/trust/badge/<package-name>?source=<package-source>`');
  });

  it('sets registry-url to the action.yml default in each @v1 step, and says why first in the v1 tag page', () => {
    const registryDefault = inputDefaults().find(([name]) => name === 'registry-url')?.[1];
    expect(registryDefault).toBe(REGISTRY);
    const depth = (line: string): number => line.length - line.trimStart().length;
    const lines = readme().split('\n');
    const starts = lines.flatMap((line, i) => (/uses: +opena2a-org\/trust-badge-action@v1/.test(line) ? [i] : []));
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) {
      // The step runs to the next list item or the end of its code block
      const rest = lines.slice(start + 1);
      const end = rest.findIndex((line) => /^\s*(- |```)/.test(line));
      const step = rest.slice(0, end === -1 ? rest.length : end);
      // Each registry-url value set in the step's with: block
      const values = step.flatMap((line, i) => {
        const value = /^ +registry-url: *(['"]?)([^\s'"#]+)\1\s*(?:#.*)?$/.exec(line)?.[2];
        const parent = step
          .slice(0, i)
          .reverse()
          .find((above) => above.trim() !== '' && depth(above) < depth(line));
        return value !== undefined && parent?.trim() === 'with:' ? [value] : [];
      });
      expect([lines[start], values]).toEqual([lines[start], [registryDefault]]);
    }

    // Before anything else, the page says that the registry host the v1 tag defaults to has no DNS record
    const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'v1-tag.md'), 'utf-8');
    const firstParagraph = page.split(/\n{2,}/).find((block) => !block.startsWith('#'));
    expect(firstParagraph).toContain('registry.opena2a.org');
    expect(firstParagraph).toContain('no DNS record');
  });

  it('says in the v1 tag page which badges the action leaves alone and where it replaces one', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'v1-tag.md'), 'utf-8');
    const row = page.split('\n').find((line) => line.startsWith('| An existing OpenA2A badge'));
    expect(row).toBeDefined();
    const readmeColumn = (row as string).split('|')[1];
    expect(readmeColumn).toContain('same package');
    expect(readmeColumn).toContain('in a code block, an HTML comment or an HTML block');

    const ownerId = '00000000-0000-0000-0000-000000000000';
    const otherId = '00000000-0000-0000-0000-000000000001';
    const badge = (agentId: string) =>
      `[![OpenA2A Trust Score](${REGISTRY}/v1/trust/${agentId}/badge.svg)](${REGISTRY}/agents/${agentId})`;
    const written = badgeMarkdown(resolveBadge(REGISTRY, 'my-agent', 'npm', lookup(ownerId)));
    const owner = { packageName: 'my-agent', agentId: ownerId };

    // Another package's badge stays, and the badge for this package is added after it
    expect(updateBadge(`# My Agent\n\n${badge(otherId)}\n`, written, owner)).toContain(
      `${badge(otherId)}\n<!-- opena2a-trust-badge -->\n${written}\n<!-- /opena2a-trust-badge -->`
    );

    // A badge in a code block stays as it is
    const fenced = `\`\`\`markdown\n${badge(ownerId)}\n\`\`\``;
    expect(updateBadge(`# My Agent\n\n${fenced}\n`, written, owner)).toContain(fenced);

    // The package's own badge is replaced on the line it is on
    expect(updateBadge(`# My Agent\n\nStatus: ${badge(ownerId)} and more\n`, written, owner)).toContain(
      `Status: <!-- opena2a-trust-badge -->${written}<!-- /opena2a-trust-badge --> and more`
    );
  });

  it('says in the v1 tag page that a single-quoted pyproject.toml name is read', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'v1-tag.md'), 'utf-8');
    const row = page
      .split('\n')
      .find((line) => line.startsWith('| A `pyproject.toml` name written as a single-quoted TOML string'));
    expect(row).toBeDefined();
    const readmeColumn = (row as string).split('|')[1];
    expect(readmeColumn).toContain("`name = 'my-pkg'`");
    expect(readmeColumn).toContain('`name = "my-pkg"`');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-doc-'));
    try {
      fs.writeFileSync(path.join(dir, 'pyproject.toml'), "[project]\nname = 'my-pkg'\n");
      expect(detectPackageName(dir)).toBe('my-pkg');
      fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[project]\nname = "my-pkg"\n');
      expect(detectPackageName(dir)).toBe('my-pkg');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says in the v1 tag page which pyproject.toml table the name is read from', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'v1-tag.md'), 'utf-8');
    const row = page
      .split('\n')
      .find((line) => line.startsWith('| The `pyproject.toml` name is the `name` key of the `[project]` table'));
    expect(row).toBeDefined();
    const [, readmeColumn, tagColumn] = (row as string).split('|');
    expect(readmeColumn).toContain('or of `[tool.poetry]` when there is no `[project]` name');
    expect(readmeColumn).toContain('such as `[[tool.uv.index]]`, is not read, and neither is a line inside a multi-line string');
    expect(tagColumn).toContain('whatever table it is in and inside a multi-line string too');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-doc-'));
    const detect = (content: string): string | null => {
      fs.writeFileSync(path.join(dir, 'pyproject.toml'), content);
      return detectPackageName(dir);
    };
    try {
      expect(detect('[[tool.uv.index]]\nname = "pytorch"\n\n[project]\nname = "my-pkg"\n')).toBe('my-pkg');
      expect(
        detect('[tool.poetry]\nname = "poetry-pkg"\n\n[project]\nversion = "1"\n\n[[tool.uv.index]]\nname = "pytorch"\n')
      ).toBe('poetry-pkg');
      expect(detect('[project]\ndescription = """\nname = "inner"\n"""\nname = "my-pkg"\n')).toBe('my-pkg');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says in the v1 tag page which branch the README is committed to', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'v1-tag.md'), 'utf-8');
    const row = page.split('\n').find((line) => line.startsWith('| The README is committed to the branch the run is for'));
    expect(row).toBeDefined();
    const [, readmeColumn, tagColumn] = (row as string).split('|');
    expect(readmeColumn).toContain('in place of the README of the commit the run checked out');
    expect(readmeColumn).toContain('`opena2a/update-trust-badge-<branch>` for a run on another branch');
    expect(readmeColumn).toContain('a tag, a pull request merge ref or a merge queue branch commits nothing');
    expect(tagColumn).toContain('committed to the default branch');
    expect(tagColumn).toContain('the pull request goes into the default branch');
  });

  it('says in the v1 tag page that readme-path is resolved against the workspace', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'v1-tag.md'), 'utf-8');
    const row = page.split('\n').find((line) => line.startsWith('| `readme-path` is resolved against the workspace'));
    expect(row).toBeDefined();
    const [, readmeColumn, tagColumn] = (row as string).split('|');
    expect(readmeColumn).toContain('`GITHUB_WORKSPACE`');
    expect(readmeColumn).toContain('resolves outside it fails the run');
    expect(readmeColumn).toContain('relative to the workspace');
    expect(tagColumn).toContain('process working directory with no workspace check');
    expect(tagColumn).toContain('sent as the repository path');
    expect(readme()).toContain('| `readme-path` | Path to the README file, relative to the repository root;');
    expect(readme()).toContain('- `readme-path` resolves outside the repository checkout, `GITHUB_WORKSPACE`.');
  });

  it('says in the v1 tag page that a github-token value is read though v1 does not declare the input', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'v1-tag.md'), 'utf-8');
    const row = page.split('\n').find((line) => line.startsWith('| A `github-token` input |'));
    expect(row).toBeDefined();
    expect(inputDefaults().map(([name]) => name)).toContain('github-token');
    const tagColumn = (row as string).split('|')[2];
    expect(tagColumn).toContain('not declared in `action.yml`');
    expect(tagColumn).toContain('still read when the `GITHUB_TOKEN` environment variable is unset');

    // getInput, which reads the github-token value, does not look at action.yml: a value for an
    // input action.yml does not declare is read too
    expect(inputDefaults().map(([name]) => name)).not.toContain('undeclared-input');
    process.env['INPUT_UNDECLARED-INPUT'] = 'given-value';
    try {
      expect(core.getInput('undeclared-input')).toBe('given-value');
    } finally {
      delete process.env['INPUT_UNDECLARED-INPUT'];
    }
  });

  it('lists each input of action.yml with the default action.yml gives it', () => {
    const inputs = inputDefaults();
    expect(inputs.length).toBeGreaterThan(0);
    const lines = readme().split('\n');
    for (const [name, defaultValue] of inputs) {
      const row = lines.find((line) => line.startsWith(`| \`${name}\` |`));
      expect(row).toBeDefined();
      const cells = (row as string).split('|').map((cell) => cell.trim());
      expect([name, cells[cells.length - 2]]).toEqual([name, defaultValue ? `\`${defaultValue}\`` : '']);
    }
  });
});

describe('action.yml', () => {
  it('runs the committed bundle, dist/index.js, on node24', () => {
    const runs = actionYml().split(/^runs:\n/m)[1];
    expect(runs).toMatch(/^ {2}using: 'node24'$/m);
    expect(runs).toMatch(/^ {2}main: 'dist\/index\.js'$/m);
  });
});

describe('the log outside a runner', () => {
  it('names each input action.yml declares by the INPUT_<NAME> variable getInput reads it from', () => {
    expect(INPUT_NAMES).toEqual(inputDefaults().map(([name]) => name));
    for (const name of INPUT_NAMES) {
      const variable = `INPUT_${name.toUpperCase()}`;
      process.env[variable] = 'given-value';
      try {
        expect([name, core.getInput(name)]).toEqual([name, 'given-value']);
      } finally {
        delete process.env[variable];
      }
    }
  });
});
