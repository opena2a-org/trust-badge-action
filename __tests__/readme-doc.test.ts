import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';
import { badgeMarkdown, resolveBadge } from '../src/badge';
import { detectPackageName } from '../src/detect';
import { updateBadge } from '../src/readme';
import { TrustLookupResponse } from '../src/registry';

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
  it('shows the uses: step for this action within its first 30 lines', () => {
    const lines = readme().split('\n');
    const stepLine = lines.findIndex((line) => /uses: +opena2a-org\/trust-badge-action@/.test(line)) + 1;
    expect(stepLine).toBeGreaterThanOrEqual(1);
    expect(stepLine).toBeLessThanOrEqual(30);
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

  it('shows the image that names the package when the lookup returns no agent id', () => {
    const badge = resolveBadge(REGISTRY, 'my-agent', 'npm', lookup(''));
    const imageUrl = badge.imageUrl
      .replace('/badge/my-agent', '/badge/<package-name>')
      .replace('source=npm', 'source=<package-source>');
    expect(imageUrl).toBe(`${REGISTRY}/v1/trust/badge/<package-name>?source=<package-source>`);
    expect(readme()).toContain(`\`${imageUrl}\``);
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
