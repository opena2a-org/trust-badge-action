import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { lookupTrust } from './registry';
import { hasTrustBadge, updateBadge } from './readme';
import { detectPackageName } from './detect';

/**
 * Generate the badge markdown string for a given agent.
 * Badge SVG is served by the API (registryUrl = api.oa2a.org).
 * Profile page is served by the frontend (registry.opena2a.org).
 */
function generateBadgeMarkdown(
  registryUrl: string,
  agentId: string
): string {
  const badgeSvg = `${registryUrl}/v1/trust/${agentId}/badge.svg`;
  const profilePage = `https://registry.opena2a.org/agents/${agentId}`;
  return `[![OpenA2A Trust Score](${badgeSvg})](${profilePage})`;
}

async function run(): Promise<void> {
  try {
    // Read inputs
    const readmePath = core.getInput('readme-path') || 'README.md';
    const packageNameInput = core.getInput('package-name');
    const packageSource = core.getInput('package-source') || 'npm';
    const registryUrl = (core.getInput('registry-url') || 'https://api.oa2a.org').replace(/\/+$/, '');
    const createPr = core.getInput('create-pr') === 'true';
    const autoMerge = core.getInput('auto-merge') !== 'false';

    // Step 1: Detect package name
    const packageName = packageNameInput || detectPackageName();
    if (packageName && !packageNameInput) {
      core.info(`Detected package name: ${packageName}`);
    }
    if (!packageName) {
      core.info(
        'Could not detect package name. Provide the package-name input or ensure a package.json/pyproject.toml exists.'
      );
      core.setOutput('updated', 'false');
      return;
    }

    core.info(`Looking up trust profile for: ${packageName} (${packageSource})`);

    // Step 2: Lookup trust
    const trustData = await lookupTrust(registryUrl, packageName, packageSource);
    if (!trustData) {
      core.info(
        `No trust profile found for ${packageName}. Your package may not have been indexed yet.`
      );
      core.setOutput('updated', 'false');
      return;
    }

    core.info(
      `Found trust profile: score=${trustData.trustScore}, level=${trustData.trustLevel}`
    );

    // Step 3: Generate badge markdown
    const badgeMarkdown = generateBadgeMarkdown(registryUrl, trustData.agentId);

    // Step 4: Read and update README
    const resolvedReadmePath = path.resolve(readmePath);
    if (!fs.existsSync(resolvedReadmePath)) {
      core.warning(`README not found at ${readmePath}. Skipping badge update.`);
      core.setOutput('updated', 'false');
      return;
    }

    const readmeContent = fs.readFileSync(resolvedReadmePath, 'utf-8');
    const updatedContent = updateBadge(readmeContent, badgeMarkdown);

    // Check if anything actually changed
    if (readmeContent === updatedContent) {
      core.info('README already has the current trust badge. No update needed.');
      core.setOutput('updated', 'false');
      setTrustOutputs(trustData, registryUrl);
      return;
    }

    fs.writeFileSync(resolvedReadmePath, updatedContent, 'utf-8');
    core.info('README updated with trust badge.');

    // Step 5: Commit and optionally create PR
    const token = process.env.GITHUB_TOKEN || core.getInput('github-token');
    if (token && createPr) {
      await createPullRequest(token, readmePath, trustData, autoMerge);
    } else if (token) {
      await commitDirectly(token, readmePath, updatedContent);
    } else {
      core.info('No GITHUB_TOKEN available. README updated locally but not committed.');
    }

    // Step 6: Set outputs
    core.setOutput('updated', 'true');
    setTrustOutputs(trustData, registryUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Action failed: ${message}`);
  }
}

function setTrustOutputs(
  trustData: { agentId: string; trustScore: number; trustLevel: string; profileUrl: string },
  registryUrl: string
): void {
  core.setOutput('trust-score', String(trustData.trustScore));
  core.setOutput('trust-level', trustData.trustLevel);
  core.setOutput('badge-url', `${registryUrl}/v1/trust/${trustData.agentId}/badge.svg`);
  core.setOutput('profile-url', trustData.profileUrl);
}

async function createPullRequest(
  token: string,
  readmePath: string,
  trustData: { agentId: string; trustScore: number; trustLevel: string; profileUrl: string },
  autoMerge: boolean
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const branchName = 'opena2a/update-trust-badge';

  try {
    // Get the default branch ref
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    });
    const baseSha = refData.object.sha;

    // Create or update the branch
    try {
      await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branchName}` });
      // Branch exists, update it
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
        sha: baseSha,
        force: true,
      });
    } catch {
      // Branch does not exist, create it
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      });
    }

    // Read the updated file content
    const updatedContent = fs.readFileSync(path.resolve(readmePath), 'utf-8');

    // Get the current file SHA (if it exists on the branch)
    let fileSha: string | undefined;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: readmePath,
        ref: branchName,
      });
      if (!Array.isArray(fileData) && fileData.type === 'file') {
        fileSha = fileData.sha;
      }
    } catch {
      // File may not exist on the branch yet
    }

    // Commit the file
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: readmePath,
      message: 'Update OpenA2A trust badge',
      content: Buffer.from(updatedContent).toString('base64'),
      branch: branchName,
      sha: fileSha,
    });

    // Check for existing PR
    const { data: existingPrs } = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branchName}`,
      state: 'open',
    });

    if (existingPrs.length > 0) {
      const existingPr = existingPrs[0];
      core.info(`Existing PR updated: ${existingPr.html_url}`);
      if (autoMerge) {
        await tryAutoMerge(octokit, owner, repo, existingPr.number, existingPr.html_url);
      }
      return;
    }

    // Create the PR
    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: 'Update OpenA2A trust badge',
      head: branchName,
      base: defaultBranch,
      body: [
        '## OpenA2A Trust Badge Update',
        '',
        `This PR adds or updates the OpenA2A trust badge in your README.`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| Trust Score | ${trustData.trustScore} |`,
        `| Trust Level | ${trustData.trustLevel} |`,
        `| Profile | [View on Registry](${trustData.profileUrl}) |`,
        '',
        'This badge is automatically updated by the [OpenA2A Trust Badge Action](https://github.com/opena2a/trust-badge-action).',
        '',
        '---',
        '*Automated PR -- merge to display your trust score in the README.*',
      ].join('\n'),
    });

    core.info(`Pull request created: ${pr.html_url}`);

    if (autoMerge) {
      await tryAutoMerge(octokit, owner, repo, pr.number, pr.html_url);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to create PR: ${message}. README was updated locally.`);
  }
}

async function tryAutoMerge(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  prUrl: string
): Promise<void> {
  try {
    // Try to merge immediately (works when no required reviews or status checks)
    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: 'squash',
    });
    core.info(`PR #${prNumber} merged automatically.`);
  } catch (mergeError) {
    // Immediate merge failed -- try enabling GitHub auto-merge (requires the feature to be enabled on the repo)
    try {
      // Get the PR's node ID for the GraphQL mutation
      const { data: prData } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      await octokit.graphql(
        `mutation($pullRequestId: ID!) {
          enablePullRequestAutoMerge(input: {
            pullRequestId: $pullRequestId,
            mergeMethod: SQUASH
          }) {
            pullRequest {
              autoMergeRequest {
                enabledAt
              }
            }
          }
        }`,
        { pullRequestId: prData.node_id }
      );
      core.info(`Auto-merge enabled on PR #${prNumber}. It will merge once requirements are met.`);
    } catch (autoMergeError) {
      const message = autoMergeError instanceof Error ? autoMergeError.message : String(autoMergeError);
      core.info(
        `PR created but auto-merge not available (branch protection may require reviews). PR: ${prUrl} -- ${message}`
      );
    }
  }
}

async function commitDirectly(
  token: string,
  readmePath: string,
  content: string
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  try {
    // Get current file SHA
    let fileSha: string | undefined;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: readmePath,
      });
      if (!Array.isArray(fileData) && fileData.type === 'file') {
        fileSha = fileData.sha;
      }
    } catch {
      // File may not exist
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: readmePath,
      message: 'Update OpenA2A trust badge',
      content: Buffer.from(content).toString('base64'),
      sha: fileSha,
    });

    core.info('Changes committed directly to the current branch.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to commit directly: ${message}. README was updated locally.`);
  }
}

run();
