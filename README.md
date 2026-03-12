# OpenA2A Trust Badge Action

A GitHub Action that automatically adds and updates the OpenA2A trust score badge in your repository's README.

Install once, and the badge stays current. The action looks up your package's trust profile on the [OpenA2A Registry](https://registry.opena2a.org), generates the badge, and opens a PR with the update.

## Usage

Add this workflow file to your repository at `.github/workflows/trust-badge.yml`:

```yaml
name: Trust Badge
on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday
  workflow_dispatch:       # Manual trigger

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

The action auto-detects your package name from `package.json` or `pyproject.toml`. To specify it manually:

```yaml
      - uses: opena2a/trust-badge-action@v1
        with:
          package-name: '@my-org/my-agent'
          package-source: npm
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `readme-path` | Path to the README file | No | `README.md` |
| `package-name` | Package name to look up (auto-detected if not provided) | No | |
| `package-source` | Package source: `npm`, `pypi`, `github` | No | `npm` |
| `registry-url` | OpenA2A Registry URL | No | `https://registry.opena2a.org` |
| `create-pr` | Create a PR instead of committing directly | No | `true` |

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
4. Adds or updates the badge in your README (using HTML comment markers for idempotent updates).
5. Opens a PR with the change, or commits directly depending on configuration.

If no trust profile exists for your package, the action exits gracefully with an informational message -- it will not fail your workflow.

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
