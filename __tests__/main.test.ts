// Runs the action's own run() against a mocked registry lookup and a mocked GitHub client, and
// checks the README it writes, the outputs it sets and the pull request it opens.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { run } from '../src/main';
import { TrustLookupResponse } from '../src/registry';

const mockInputs: Record<string, string> = {};
const mockOutputs: Record<string, string> = {};

jest.mock('@actions/core', () => ({
  getInput: jest.fn((name: string) => mockInputs[name] ?? ''),
  setOutput: jest.fn((name: string, value: string) => {
    mockOutputs[name] = value;
  }),
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn(),
}));

const mockOctokit = {
  rest: {
    repos: {
      get: jest.fn(),
      getContent: jest.fn(),
      createOrUpdateFileContents: jest.fn(),
    },
    git: {
      getRef: jest.fn(),
      updateRef: jest.fn(),
      createRef: jest.fn(),
    },
    pulls: {
      list: jest.fn(),
      create: jest.fn(),
      merge: jest.fn(),
      get: jest.fn(),
    },
  },
  graphql: jest.fn(),
};

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(() => mockOctokit),
  context: { repo: { owner: 'test-owner', repo: 'test-repo' } },
}));

const AGENT_ID = 'e3b58711-0f97-441c-8a83-4b1b5342a39f';
const IMAGE_URL = `https://api.oa2a.org/v1/trust/${AGENT_ID}/badge.svg`;
const LINK_URL = 'https://api.oa2a.org/v1/trust/lookup?package=hackmyagent&source=npm';
const BADGE = `[![OpenA2A Trust Score](${IMAGE_URL})](${LINK_URL})`;
const WRAPPED = `<!-- opena2a-trust-badge -->\n${BADGE}\n<!-- /opena2a-trust-badge -->`;

// A lookup response as the registry returns it today.
const lookup: TrustLookupResponse = {
  agentId: AGENT_ID,
  name: 'hackmyagent',
  trustScore: 0.21666666666666667,
  trustLevel: 'discovered',
  profileUrl: `https://registry.opena2a.org/agents/${AGENT_ID}`,
};

const originalFetch = global.fetch;
const originalToken = process.env.GITHUB_TOKEN;
let workDir: string;
let readmePath: string;

function mockLookup(response: TrustLookupResponse): void {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => response });
}

function writeReadme(content: string): void {
  fs.writeFileSync(readmePath, content, 'utf-8');
}

function readReadme(): string {
  return fs.readFileSync(readmePath, 'utf-8');
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockInputs)) delete mockInputs[key];
  for (const key of Object.keys(mockOutputs)) delete mockOutputs[key];
  delete process.env.GITHUB_TOKEN;

  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-badge-'));
  readmePath = path.join(workDir, 'README.md');
  mockInputs['readme-path'] = readmePath;
  mockInputs['package-name'] = 'hackmyagent';
  mockInputs['package-source'] = 'npm';
  mockLookup(lookup);

  mockOctokit.rest.repos.get.mockResolvedValue({ data: { default_branch: 'main' } });
  mockOctokit.rest.git.getRef.mockImplementation(async ({ ref }: { ref: string }) => {
    if (ref === 'heads/main') return { data: { object: { sha: 'base-sha' } } };
    throw new Error('Not Found');
  });
  mockOctokit.rest.git.createRef.mockResolvedValue({});
  mockOctokit.rest.repos.getContent.mockRejectedValue(new Error('Not Found'));
  mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
  mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
  mockOctokit.rest.pulls.create.mockResolvedValue({
    data: { number: 42, html_url: 'https://github.com/test-owner/test-repo/pull/42' },
  });
  mockOctokit.rest.pulls.merge.mockResolvedValue({ data: { merged: true } });
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalToken;
  }
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('run', () => {
  it('writes the badge into the README and sets the outputs from the lookup', async () => {
    writeReadme('# My Project\n\nDescription.\n');

    await run();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(LINK_URL, expect.objectContaining({ method: 'GET' }));
    expect(readReadme()).toBe(`# My Project\n${WRAPPED}\n\nDescription.\n`);
    expect(mockOutputs).toEqual({
      updated: 'true',
      'trust-score': '0.21666666666666667',
      'trust-level': 'discovered',
      'badge-url': IMAGE_URL,
      'profile-url': LINK_URL,
    });
    expect(github.getOctokit).not.toHaveBeenCalled();
  });

  it('never sets profile-url to the lookup profile host, which has no DNS record', async () => {
    writeReadme('# My Project\n');

    await run();

    expect(mockOutputs['profile-url']).toBe(LINK_URL);
    expect(mockOutputs['profile-url']).not.toContain('registry.opena2a.org');
  });

  it('reports no update and still sets the outputs when the README already has the current badge', async () => {
    writeReadme(`# My Project\n${WRAPPED}\n\nDescription.\n`);

    await run();

    expect(readReadme()).toBe(`# My Project\n${WRAPPED}\n\nDescription.\n`);
    expect(mockOutputs).toEqual({
      updated: 'false',
      'trust-score': '0.21666666666666667',
      'trust-level': 'discovered',
      'badge-url': IMAGE_URL,
      'profile-url': LINK_URL,
    });
  });

  it("keeps another package's badge and a fenced example, and adds its own badge", async () => {
    const other =
      '[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/other-package?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=other-package&source=npm)';
    const fence = '```markdown\n[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/badge/hackmyagent?source=npm)](https://api.oa2a.org/v1/trust/lookup?package=hackmyagent&source=npm)\n```';
    writeReadme(`# My Project\n${other}\n\n${fence}\n`);

    await run();

    expect(readReadme()).toBe(`# My Project\n${other}\n${WRAPPED}\n\n${fence}\n`);
    expect(mockOutputs.updated).toBe('true');
  });

  it('writes nothing and fails with the reason for a scoped name the lookup returned no agent id for', async () => {
    mockInputs['package-name'] = '@scope/my-agent';
    mockLookup({ ...lookup, agentId: '', name: '@scope/my-agent' });
    writeReadme('# My Project\n');

    await run();

    expect(readReadme()).toBe('# My Project\n');
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('serves no badge image by name for a package name that contains "/"')
    );
    expect(mockOutputs.updated).toBeUndefined();
  });

  it('reports no update when the package has no trust profile', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    writeReadme('# My Project\n');

    await run();

    expect(readReadme()).toBe('# My Project\n');
    expect(mockOutputs).toEqual({ updated: 'false' });
  });

  it('commits the README directly when create-pr is not set', async () => {
    mockInputs['github-token'] = 'test-token';
    writeReadme('# My Project\n');

    await run();

    expect(github.getOctokit).toHaveBeenCalledWith('test-token');
    expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: readmePath,
      message: 'Update OpenA2A trust badge',
      content: Buffer.from(`# My Project\n${WRAPPED}\n`).toString('base64'),
      sha: undefined,
    });
    expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
  });

  describe('with create-pr', () => {
    beforeEach(() => {
      process.env.GITHUB_TOKEN = 'test-token';
      mockInputs['create-pr'] = 'true';
      writeReadme('# My Project\n');
    });

    it("opens a pull request that links the badge's lookup and this action's repository, then merges it", async () => {
      await run();

      expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'refs/heads/opena2a/update-trust-badge',
        sha: 'base-sha',
      });
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'opena2a/update-trust-badge',
          content: Buffer.from(`# My Project\n${WRAPPED}\n`).toString('base64'),
        })
      );
      const { body } = mockOctokit.rest.pulls.create.mock.calls[0][0];
      expect(body).toContain('| Trust Score | 0.21666666666666667 |');
      expect(body).toContain(`| Profile | [View on Registry](${LINK_URL}) |`);
      expect(body).toContain('(https://github.com/opena2a-org/trust-badge-action)');
      expect(body).not.toContain('github.com/opena2a/');
      expect(mockOctokit.rest.pulls.merge).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 42,
        merge_method: 'squash',
      });
      expect(mockOutputs.updated).toBe('true');
    });

    it('enables auto-merge when the immediate merge is refused', async () => {
      mockOctokit.rest.pulls.merge.mockRejectedValue(new Error('Required status checks have not passed'));
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { node_id: 'PR_node_123' } });
      mockOctokit.graphql.mockResolvedValue({});

      await run();

      expect(mockOctokit.graphql).toHaveBeenCalledWith(expect.stringContaining('enablePullRequestAutoMerge'), {
        pullRequestId: 'PR_node_123',
      });
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Auto-merge enabled on PR #42'));
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('logs the open pull request without failing when neither merge is possible', async () => {
      mockOctokit.rest.pulls.merge.mockRejectedValue(new Error('Reviews required'));
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { node_id: 'PR_node_456' } });
      mockOctokit.graphql.mockRejectedValue(new Error('Auto-merge not enabled for repository'));

      await run();

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('auto-merge not available (branch protection may require reviews)')
      );
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(mockOutputs.updated).toBe('true');
    });

    it('does not merge when auto-merge is false', async () => {
      mockInputs['auto-merge'] = 'false';

      await run();

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.merge).not.toHaveBeenCalled();
    });
  });
});
