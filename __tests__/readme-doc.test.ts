import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveBadge } from '../src/badge';
import { detectPackageName } from '../src/detect';
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
