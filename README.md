# OpenA2A Trust Badge Action

A GitHub Action that automatically adds and updates the OpenA2A trust score badge in your repository's README.

Install once, and the badge stays current. The action looks up your package's trust profile on the [OpenA2A Registry](https://registry.opena2a.org), generates the badge, and commits the update directly to the current branch. No PR, no manual merge, no friction.

## What Is a Trust Score?

A trust score (0-100) reflects the security posture of your AI agent or package based on automated analysis: dependency health, vulnerability scanning, code signing, governance policies, and maintenance activity. Scores are calculated by the OpenA2A Registry and updated as new scan data arrives.

## Usage

Add this workflow file to your repository at `.github/workflows/trust-badge.yml`:

```yaml
name: Trust Badge
on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday at midnight UTC
  workflow_dispatch:       # Run manually anytime

permissions:
  contents: write
  pull-requests: write

jobs:
  badge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: opena2a/trust-badge-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

After pushing this workflow file, go to your repo's Actions tab, select "Trust Badge", and click "Run workflow" to see it immediately.

The action auto-detects your package name from (in order): `package.json` name field, `pyproject.toml` project name, `setup.py`/`setup.cfg` name. You can override this with the `package-name` input:

```yaml
      - uses: opena2a/trust-badge-action@v1
        with:
          package-name: '@my-org/my-agent'
          package-source: npm
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Manual Trigger

The workflow above includes `workflow_dispatch`, which lets you run it on demand from the Actions tab without waiting for the weekly schedule. To add manual triggering to an existing workflow:

```yaml
on:
  workflow_dispatch:  # Run manually anytime
  schedule:
    - cron: '0 0 * * 1'  # Also weekly on Monday at midnight UTC
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `readme-path` | Path to the README file | No | `README.md` |
| `package-name` | Package name to look up (auto-detected if not provided) | No | |
| `package-source` | Package source: `npm`, `pypi`, `github` | No | `npm` |
| `registry-url` | OpenA2A Registry URL | No | `https://registry.opena2a.org` |
| `create-pr` | Create a PR instead of committing directly (use if you have branch protection) | No | `false` |
| `auto-merge` | Automatically merge the PR after creation (only applies when `create-pr` is `true`) | No | `true` |
| `github-token` | GitHub token for committing changes and creating PRs. Defaults to `GITHUB_TOKEN` env var. | No | `${{ secrets.GITHUB_TOKEN }}` |

## Outputs

| Output | Description |
|--------|-------------|
| `trust-score` | Current trust score (0-100) |
| `trust-level` | Current trust level (discovered, scanned, claimed, verified, certified) |
| `badge-url` | URL of the trust badge SVG |
| `profile-url` | URL of the agent profile page on the registry |
| `updated` | Whether the README was updated (`true` or `false`) |

## How It Works

1. Detects your package name from `package.json`, `pyproject.toml`, `setup.py`, or `setup.cfg` (or uses the provided input).
2. Looks up the trust profile on the OpenA2A Registry.
3. Generates the trust badge markdown with a link to the full profile page.
4. Adds or updates the badge in your README. The action wraps the badge in hidden HTML markers so it can update the same badge on future runs without duplicating it.
5. Commits the change directly (default), or opens a PR if `create-pr` is set to `true`.

## Commit Modes

**Recommended (default): Direct commit, zero friction.**
A badge update in a README is not a code change. The default commits directly -- no PR, no manual merge, nothing to think about.

```yaml
- uses: opena2a/trust-badge-action@v1
  # That's it. Badge updates commit directly.
```

**With branch protection: PR + auto-merge.**
If your default branch has protection rules, set `create-pr: true`. The action creates a PR and merges it automatically (squash merge). If required reviews or status checks block the merge, auto-merge is enabled so the PR merges as soon as requirements are met.

```yaml
- uses: opena2a/trust-badge-action@v1
  with:
    create-pr: true
    # auto-merge: true (default) -- PR is created and merged automatically
```

**Manual review required: PR only, human merges.**
For teams that explicitly want a human to review badge changes before they land.

```yaml
- uses: opena2a/trust-badge-action@v1
  with:
    create-pr: true
    auto-merge: false
```

## What If My Package Is Not Found?

If no trust profile exists for your package yet, the action exits successfully without changes. Trust profiles are auto-generated for published packages -- if yours has not been indexed yet, run `opena2a trust <your-package>` to trigger a lookup, or wait for the next indexing cycle.

## Badge Placement

The action places the badge using this priority:

1. **Existing markers**: If `<!-- opena2a-trust-badge -->` markers are found, content between them is replaced.
2. **Existing badges**: If other badges (`[![...](...)`)  are found near the top of the README, the trust badge is added after them.
3. **First heading**: If a heading (`#`) exists, the badge is inserted after it.
4. **Top of file**: As a fallback, the badge is added at the beginning.

To control placement manually, add the markers where you want the badge:

```markdown
# My Project

<!-- opena2a-trust-badge -->
<!-- /opena2a-trust-badge -->

Description of my project...
```

## License

Apache-2.0
