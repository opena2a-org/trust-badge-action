import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { TrustLookupResponse, fetchBadgeText, lookupTrust, trustLookupUrl } from './registry';
import { updateBadge } from './readme';
import { detectPackageName } from './detect';
import { TrustBadge, badgeMarkdown, resolveBadge } from './badge';

/**
 * Run the action: look up the package, check that its badge image shows the lookup's score and
 * level, write the badge into the README, and set the outputs.
 */
export async function run(): Promise<void> {
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
        'Could not detect package name. Provide the package-name input or ensure package.json, pyproject.toml, setup.py or setup.cfg names the package.'
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

    // Step 3: Generate badge markdown, and stop unless the image shows what the lookup returned
    const badge = resolveBadge(registryUrl, packageName, packageSource, trustData);
    await checkBadgeImage(
      badge,
      trustData,
      packageName,
      trustLookupUrl(registryUrl, packageName, packageSource)
    );

    // Step 4: Read and update README
    const resolvedReadmePath = path.resolve(readmePath);
    if (!fs.existsSync(resolvedReadmePath)) {
      core.warning(`README not found at ${readmePath}. Skipping badge update.`);
      core.setOutput('updated', 'false');
      return;
    }

    const readmeContent = fs.readFileSync(resolvedReadmePath, 'utf-8');
    const updatedContent = updateBadge(readmeContent, badgeMarkdown(badge), {
      packageName,
      agentId: trustData.agentId,
    });

    // Check if anything actually changed
    if (readmeContent === updatedContent) {
      core.info('README already has the current trust badge. No update needed.');
      core.setOutput('updated', 'false');
      setTrustOutputs(trustData, badge);
      return;
    }

    fs.writeFileSync(resolvedReadmePath, updatedContent, 'utf-8');
    core.info('README updated with trust badge.');

    // Step 5: Commit to the branch the run is for, or open a PR into it
    const token = process.env.GITHUB_TOKEN || core.getInput('github-token');
    const branch = runBranch();
    if (!token) {
      core.info('No GITHUB_TOKEN available. README updated locally but not committed.');
    } else if (!branch) {
      core.warning(
        `The run is for ${github.context.ref || 'no ref'}, which is not a branch, so the README was updated locally but not committed.`
      );
    } else if (branch.startsWith('gh-readonly-queue/')) {
      // A merge queue run is for the queue's own branch, gh-readonly-queue/<base>/pr-<n>-<sha>, not
      // a branch to commit the badge to
      core.warning(
        `The run is for ${github.context.ref}, a merge queue branch, so the README was updated locally but not committed.`
      );
    } else if (createPr) {
      await createPullRequest(token, readmePath, trustData, badge, autoMerge, branch);
    } else {
      await commitDirectly(token, readmePath, updatedContent, branch);
    }

    // Step 6: Set outputs
    core.setOutput('updated', 'true');
    setTrustOutputs(trustData, badge);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Action failed: ${message}`);
  }
}

// The registry writes the badge image's text into its title as "Trust: <score> | <level>", the
// score being the trust score times 100 with the fraction dropped.
const IMAGE_TITLE = /<title\b[^>]*>([^<]*)<\/title>/i;
const TRUST_TEXT = /^Trust: (\d+) \| (.+)$/;

/**
 * Fetch the badge image and throw unless its text shows the score and level of the lookup, so the
 * README never gets an image that disagrees with the values the run reports. An image that cannot
 * be fetched, or whose text is not in that form, throws as well.
 */
async function checkBadgeImage(
  badge: TrustBadge,
  trustData: TrustLookupResponse,
  packageName: string,
  lookupUrl: string
): Promise<void> {
  const lookupVerdict = `its lookup returns score ${trustData.trustScore}, level ${trustData.trustLevel} (${lookupUrl})`;
  const notWritten =
    'The badge was not written: the image and the lookup must agree before the action publishes it.';

  let svg: string;
  try {
    svg = await fetchBadgeText(badge.imageUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The registry's badge image for ${packageName} could not be read (${message}) while ${lookupVerdict}. ${notWritten}`
    );
  }

  const title = IMAGE_TITLE.exec(svg)?.[1].trim();
  const shown = title === undefined ? null : TRUST_TEXT.exec(title);
  if (
    shown &&
    Number(shown[1]) === Math.trunc(trustData.trustScore * 100) &&
    shown[2] === trustData.trustLevel
  ) {
    return;
  }
  const imageVerdict = title === undefined ? 'carries no title' : `reads "${quotable(title)}"`;
  throw new Error(
    `The registry's badge image for ${packageName} ${imageVerdict} (${badge.imageUrl}) while ${lookupVerdict}. ${notWritten}`
  );
}

// Text from the registry as the log quotes it: no control or format character and no line or
// paragraph separator, cut to 80 characters.
function quotable(text: string): string {
  return Array.from(text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ''))
    .slice(0, 80)
    .join('');
}

// profile-url is the page the badge links to. The lookup's own profileUrl names a host with no DNS
// record, so it is not passed through.
function setTrustOutputs(trustData: TrustLookupResponse, badge: TrustBadge): void {
  core.setOutput('trust-score', String(trustData.trustScore));
  core.setOutput('trust-level', trustData.trustLevel);
  core.setOutput('badge-url', badge.imageUrl);
  core.setOutput('profile-url', badge.linkUrl);
}

// The branch the run is for. A run for a tag or a pull request merge ref has none, so there is no
// branch to write its README to. A merge queue run has one, which run() does not write to either.
function runBranch(): string | undefined {
  const ref = github.context.ref || '';
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : undefined;
}

// Opens a PR into the run's branch from a PR branch that starts at the commit the run checked out,
// the commit whose README the badge was added to.
async function createPullRequest(
  token: string,
  readmePath: string,
  trustData: TrustLookupResponse,
  badge: TrustBadge,
  autoMerge: boolean,
  baseBranch: string
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  try {
    // A run on another branch gets a PR branch of its own and does not reset the default branch's.
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const branchName =
      baseBranch === repoData.default_branch
        ? 'opena2a/update-trust-badge'
        : `opena2a/update-trust-badge-${baseBranch}`;
    const baseSha = github.context.sha;

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

    // Check for an existing PR into the same branch
    const { data: existingPrs } = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branchName}`,
      base: baseBranch,
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
      base: baseBranch,
      body: [
        '## OpenA2A Trust Badge Update',
        '',
        `This PR adds or updates the OpenA2A trust badge in your README.`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| Trust Score | ${trustData.trustScore} |`,
        `| Trust Level | ${trustData.trustLevel} |`,
        `| Profile | [View on Registry](${badge.linkUrl}) |`,
        '',
        'This badge is automatically updated by the [OpenA2A Trust Badge Action](https://github.com/opena2a-org/trust-badge-action).',
        '',
        '---',
        '*Automated PR -- merge to display your trust score in the README.*',
      ].join('\n'),
    });

    core.info(`Pull request into ${baseBranch} created: ${pr.html_url}`);

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
  content: string,
  branch: string
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  try {
    // The README's sha in the commit the run checked out, the README the badge was added to,
    // rather than the sha of the branch's README at the time of the write
    let fileSha: string | undefined;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: readmePath,
        ref: github.context.sha,
      });
      if (!Array.isArray(fileData) && fileData.type === 'file') {
        fileSha = fileData.sha;
      }
    } catch {
      // File may not exist in that commit
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: readmePath,
      message: 'Update OpenA2A trust badge',
      content: Buffer.from(content).toString('base64'),
      branch,
      sha: fileSha,
    });

    core.info(`Changes committed directly to branch ${branch}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to commit directly: ${message}. README was updated locally.`);
  }
}
