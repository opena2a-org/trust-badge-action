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
  context: { repo: { owner: 'test-owner', repo: 'test-repo' }, ref: '', sha: '' },
}));

// The commit the run checked out, and the sha of the README in it.
const RUN_SHA = 'run-commit-sha';
const README_SHA_AT_RUN = 'readme-blob-sha-at-run';

// The ref of a merge_group run: the merge queue's branch for pull request 7 into main.
const MERGE_QUEUE_REF = 'refs/heads/gh-readonly-queue/main/pr-7-0123abc';

function runOn(ref: string): void {
  Object.assign(github.context, { ref, sha: RUN_SHA });
}

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

// The text the registry's badge image shows for that lookup: the trust score times 100 with the
// fraction dropped, 21, and the level.
const AGREEING_TITLE = 'Trust: 21 | discovered';

const originalFetch = global.fetch;
const originalToken = process.env.GITHUB_TOKEN;
let workDir: string;
let readmePath: string;

interface MockAnswer {
  ok: boolean;
  status: number;
  statusText?: string;
  text?: () => Promise<string>;
}

// A badge image as the registry serves it, its text in the title.
function badgeSvg(title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}"><title>${title}</title></svg>`;
}

function imageAnswer(svg: string): MockAnswer {
  return { ok: true, status: 200, text: async () => svg };
}

// Answers the lookup with the response and a badge image with the image given, by default one
// whose text agrees with the lookup above. Any other URL is not found.
function mockLookup(
  response: TrustLookupResponse,
  image: MockAnswer = imageAnswer(badgeSvg(AGREEING_TITLE))
): void {
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.includes('/v1/trust/lookup?')) {
      return { ok: true, status: 200, json: async () => response };
    }
    if (url.endsWith('/badge.svg')) {
      return image;
    }
    return { ok: false, status: 404, statusText: 'Not Found' };
  });
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
  runOn('refs/heads/main');

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

  it('names every manifest it reads when no package name is found', async () => {
    writeReadme('# My Project\n');
    delete mockInputs['package-name'];
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(workDir);

    try {
      await run();
    } finally {
      cwd.mockRestore();
    }

    expect(core.info).toHaveBeenCalledWith(
      'Could not detect package name. Provide the package-name input or ensure package.json, pyproject.toml, setup.py or setup.cfg names the package.'
    );
    expect(mockOutputs).toEqual({ updated: 'false' });
    expect(global.fetch).not.toHaveBeenCalled();
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

  it.each([
    ['no agent id', ''],
    ['an agent id that is not a UUID', 'x'],
  ])('writes nothing and fails with the reason for a scoped name the lookup returned %s for', async (_label, agentId) => {
    mockInputs['package-name'] = '@scope/my-agent';
    mockLookup({ ...lookup, agentId, name: '@scope/my-agent' });
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

  describe('when the badge image does not show the lookup', () => {
    const before = '# My Project\n\nDescription.\n';

    beforeEach(() => {
      process.env.GITHUB_TOKEN = 'test-token';
      writeReadme(before);
    });

    function expectNothingWritten(): void {
      expect(fs.readFileSync(readmePath)).toEqual(Buffer.from(before, 'utf-8'));
      expect(mockOutputs).toEqual({});
      expect(github.getOctokit).not.toHaveBeenCalled();
    }

    it('fails naming both verdicts and both URLs, and writes nothing, when the image shows another score', async () => {
      mockLookup(lookup, imageAnswer(badgeSvg('Trust: 25 | discovered')));

      await run();

      expect(global.fetch).toHaveBeenCalledWith(IMAGE_URL, expect.objectContaining({ method: 'GET' }));
      expect(core.setFailed).toHaveBeenCalledTimes(1);
      expect(core.setFailed).toHaveBeenCalledWith(
        `Action failed: The registry's badge image for hackmyagent reads "Trust: 25 | discovered" (${IMAGE_URL}) while its lookup returns score 0.21666666666666667, level discovered (${LINK_URL}). The badge was not written: the image and the lookup must agree before the action publishes it.`
      );
      expectNothingWritten();
    });

    it("fails when the image shows the lookup's score with another level", async () => {
      mockLookup(lookup, imageAnswer(badgeSvg('Trust: 21 | blocked')));

      await run();

      expect(core.setFailed).toHaveBeenCalledTimes(1);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining(`reads "Trust: 21 | blocked" (${IMAGE_URL})`)
      );
      expectNothingWritten();
    });

    it.each([
      ["the registry's not-found image", badgeSvg('Trust: not found'), 'reads "Trust: not found"'],
      [
        'an image with no title',
        '<svg xmlns="http://www.w3.org/2000/svg"><text>Trust</text><text>21 | discovered</text></svg>',
        'carries no title',
      ],
    ])('fails when the image text is not in the form "Trust: <score> | <level>": %s', async (_label, svg, verdict) => {
      mockLookup(lookup, imageAnswer(svg));

      await run();

      expect(core.setFailed).toHaveBeenCalledTimes(1);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining(
          `badge image for hackmyagent ${verdict} (${IMAGE_URL}) while its lookup returns score 0.21666666666666667, level discovered (${LINK_URL})`
        )
      );
      expectNothingWritten();
    });

    it('fails naming the image URL, without a retry, when the image is not found', async () => {
      mockLookup(lookup, { ok: false, status: 404, statusText: 'Not Found' });

      await run();

      expect(core.setFailed).toHaveBeenCalledTimes(1);
      const [message] = (core.setFailed as jest.Mock).mock.calls[0];
      expect(message).toContain(`status 404 for the badge image at ${IMAGE_URL}`);
      expect(message).toContain('score 0.21666666666666667, level discovered');
      expect(message).toContain(LINK_URL);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expectNothingWritten();
    });

    it('fails and sets no output when the README already has the badge', async () => {
      const current = `# My Project\n${WRAPPED}\n\nDescription.\n`;
      writeReadme(current);
      mockLookup(lookup, imageAnswer(badgeSvg('Trust: 25 | discovered')));

      await run();

      expect(core.setFailed).toHaveBeenCalledTimes(1);
      expect(readReadme()).toBe(current);
      expect(mockOutputs).toEqual({});
    });

    it('quotes at most 80 characters of the image text, with no control character', async () => {
      mockLookup(lookup, imageAnswer(badgeSvg(`Trust: 25 |\u0007 dis\u001b[0mcovered\r\n${'x'.repeat(100)}`)));

      await run();

      expect(core.setFailed).toHaveBeenCalledTimes(1);
      const [message] = (core.setFailed as jest.Mock).mock.calls[0];
      expect(message).toContain(`reads "Trust: 25 | dis[0mcovered${'x'.repeat(55)}" (${IMAGE_URL})`);
      expect(message).not.toMatch(/[\u0000-\u001f\u007f]/);
      expectNothingWritten();
    });
  });

  describe('without create-pr', () => {
    beforeEach(() => {
      mockInputs['github-token'] = 'test-token';
      writeReadme('# My Project\n');
      // The README in the commit the run checked out, and a newer one on the default branch.
      mockOctokit.rest.repos.getContent.mockImplementation(async ({ ref }: { ref?: string }) => ({
        data: { type: 'file', sha: ref === RUN_SHA ? README_SHA_AT_RUN : 'readme-blob-sha-on-default-branch-now' },
      }));
    });

    it('commits the README to the branch the run is for, in place of the README of the commit it checked out', async () => {
      await run();

      expect(github.getOctokit).toHaveBeenCalledWith('test-token');
      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: readmePath,
        ref: RUN_SHA,
      });
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: readmePath,
        message: 'Update OpenA2A trust badge',
        content: Buffer.from(`# My Project\n${WRAPPED}\n`).toString('base64'),
        branch: 'main',
        sha: README_SHA_AT_RUN,
      });
      expect(core.info).toHaveBeenCalledWith('Changes committed directly to branch main.');
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    it('commits a run on another branch to that branch, not to the default branch', async () => {
      runOn('refs/heads/feature/docs');

      await run();

      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'feature/docs', sha: README_SHA_AT_RUN })
      );
      expect(core.info).toHaveBeenCalledWith('Changes committed directly to branch feature/docs.');
    });

    it('sends no sha when the commit the run checked out has no README', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(new Error('Not Found'));

      await run();

      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'main', sha: undefined })
      );
    });

    it('warns and keeps the README updated locally when GitHub refuses the write', async () => {
      mockOctokit.rest.repos.createOrUpdateFileContents.mockRejectedValue(
        new Error(`README.md does not match ${README_SHA_AT_RUN}`)
      );

      await run();

      expect(core.warning).toHaveBeenCalledWith(
        `Failed to commit directly: README.md does not match ${README_SHA_AT_RUN}. README was updated locally.`
      );
      expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('Changes committed directly'));
      expect(readReadme()).toBe(`# My Project\n${WRAPPED}\n`);
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it.each(['refs/pull/7/merge', 'refs/tags/v2.0.0'])(
      'commits nothing for a run on %s, which is not a branch',
      async (ref) => {
        runOn(ref);

        await run();

        expect(github.getOctokit).not.toHaveBeenCalled();
        expect(core.warning).toHaveBeenCalledWith(
          `The run is for ${ref}, which is not a branch, so the README was updated locally but not committed.`
        );
        expect(readReadme()).toBe(`# My Project\n${WRAPPED}\n`);
        expect(mockOutputs.updated).toBe('true');
      }
    );

    it('commits nothing to the merge queue branch of a merge queue run', async () => {
      runOn(MERGE_QUEUE_REF);

      await run();

      expect(github.getOctokit).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(core.warning).toHaveBeenCalledWith(
        `The run is for ${MERGE_QUEUE_REF}, a merge queue branch, so the README was updated locally but not committed.`
      );
      expect(readReadme()).toBe(`# My Project\n${WRAPPED}\n`);
      expect(mockOutputs.updated).toBe('true');
    });
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
        sha: RUN_SHA,
      });
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'opena2a/update-trust-badge',
          content: Buffer.from(`# My Project\n${WRAPPED}\n`).toString('base64'),
        })
      );
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        head: 'test-owner:opena2a/update-trust-badge',
        base: 'main',
        state: 'open',
      });
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({ head: 'opena2a/update-trust-badge', base: 'main' })
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

    it('opens the pull request for a run on another branch into that branch, from a badge branch of its own', async () => {
      runOn('refs/heads/feature/docs');

      await run();

      expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'refs/heads/opena2a/update-trust-badge-feature/docs',
        sha: RUN_SHA,
      });
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'opena2a/update-trust-badge-feature/docs' })
      );
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith(
        expect.objectContaining({ head: 'test-owner:opena2a/update-trust-badge-feature/docs', base: 'feature/docs' })
      );
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({ head: 'opena2a/update-trust-badge-feature/docs', base: 'feature/docs' })
      );
      expect(core.info).toHaveBeenCalledWith(
        'Pull request into feature/docs created: https://github.com/test-owner/test-repo/pull/42'
      );
    });

    it('resets an existing badge branch to the commit the run checked out', async () => {
      mockOctokit.rest.git.getRef.mockResolvedValue({ data: { object: { sha: 'old-badge-sha' } } });

      await run();

      expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'heads/opena2a/update-trust-badge',
        sha: RUN_SHA,
        force: true,
      });
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
    });

    it('opens no pull request for a run on a pull request merge ref', async () => {
      runOn('refs/pull/7/merge');

      await run();

      expect(github.getOctokit).not.toHaveBeenCalled();
      expect(core.warning).toHaveBeenCalledWith(
        'The run is for refs/pull/7/merge, which is not a branch, so the README was updated locally but not committed.'
      );
    });

    it('creates no badge branch and opens no pull request for a merge queue run', async () => {
      runOn(MERGE_QUEUE_REF);

      await run();

      expect(github.getOctokit).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.updateRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(core.warning).toHaveBeenCalledWith(
        `The run is for ${MERGE_QUEUE_REF}, a merge queue branch, so the README was updated locally but not committed.`
      );
      expect(readReadme()).toBe(`# My Project\n${WRAPPED}\n`);
      expect(mockOutputs.updated).toBe('true');
    });

    it('does not merge when auto-merge is false', async () => {
      mockInputs['auto-merge'] = 'false';

      await run();

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.merge).not.toHaveBeenCalled();
    });

    // The values core.getBooleanInput accepts
    it.each(['True', 'TRUE'])(
      'opens a pull request for create-pr: %s and commits nothing to the branch the run is for',
      async (value) => {
        mockInputs['create-pr'] = value;

        await run();

        expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
          expect.objectContaining({ head: 'opena2a/update-trust-badge', base: 'main' })
        );
        expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
          expect.objectContaining({ branch: 'opena2a/update-trust-badge' })
        );
        expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalledWith(
          expect.objectContaining({ branch: 'main' })
        );
        expect(core.setFailed).not.toHaveBeenCalled();
      }
    );

    it.each(['False', 'FALSE'])('does not merge and does not enable auto-merge when auto-merge is %s', async (value) => {
      mockInputs['auto-merge'] = value;

      await run();

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.merge).not.toHaveBeenCalled();
      expect(mockOctokit.graphql).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it.each([
      ['create-pr', 'yes'],
      ['auto-merge', 'no'],
    ])('fails before the lookup and names the input when %s is %s', async (name, value) => {
      mockInputs[name] = value;

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        `Action failed: Input ${name} is "${value}"; accepted values: true, True, TRUE, false, False, FALSE.`
      );
      expect(global.fetch).not.toHaveBeenCalled();
      expect(github.getOctokit).not.toHaveBeenCalled();
      expect(readReadme()).toBe('# My Project\n');
      expect(mockOutputs).toEqual({});
    });

    it('quotes at most 80 characters of a value it does not accept, without its control characters', async () => {
      mockInputs['create-pr'] = `ye\u0007s\r\nnext line ${'x'.repeat(100)}`;

      await run();

      const shown = `yesnext line ${'x'.repeat(67)}`;
      expect(shown).toHaveLength(80);
      expect(core.setFailed).toHaveBeenCalledWith(
        `Action failed: Input create-pr is "${shown}"; accepted values: true, True, TRUE, false, False, FALSE.`
      );
    });
  });
});
