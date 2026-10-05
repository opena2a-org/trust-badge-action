> **[OpenA2A](https://github.com/opena2a-org/opena2a)**: [CLI](https://github.com/opena2a-org/opena2a) · [HackMyAgent](https://github.com/opena2a-org/hackmyagent) · [Secretless](https://github.com/opena2a-org/secretless-ai) · [AIM](https://github.com/opena2a-org/agent-identity-management) · [Browser Guard](https://github.com/opena2a-org/AI-BrowserGuard) · [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent)

# OpenA2A Trust Badge Action

[![Status: stable](https://img.shields.io/badge/status-stable-green)](./STATUS.md)

A GitHub Action that adds and auto-updates an OpenA2A Registry trust score badge in your README.

```
[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/<agent-id>/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=<package-name>&source=<package-source>)
```

`<agent-id>` is the id the registry lookup returns for your package.

## Usage

Add `.github/workflows/trust-badge.yml` to your repository:

```yaml
name: Trust Badge
on:
  schedule:
    - cron: '0 0 * * 1'    # Weekly on Monday
  workflow_dispatch:         # Manual trigger

permissions:
  contents: write

jobs:
  badge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: opena2a-org/trust-badge-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The action auto-detects your package name from `package.json`, `pyproject.toml`, or `setup.py`. Override with:

```yaml
      - uses: opena2a-org/trust-badge-action@v1
        with:
          package-name: '@my-org/my-agent'
          package-source: npm
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `readme-path` | Path to the README file | `README.md` |
| `package-name` | Package name (auto-detected if omitted) | |
| `package-source` | Package source: `npm`, `pypi`, `github` | `npm` |
| `registry-url` | OpenA2A Registry API URL | `https://api.oa2a.org` |
| `create-pr` | Create a PR instead of committing directly | `false` |
| `auto-merge` | Auto-merge the PR (only when `create-pr: true`) | `true` |
| `github-token` | GitHub token for commits/PRs, used when the `GITHUB_TOKEN` environment variable is not set; without either, the README is updated in the workspace only | |

## Outputs

| Output | Description |
|--------|-------------|
| `trust-score` | Trust score as the registry lookup returns it: a number from 0 to 1, not rounded |
| `trust-level` | Level: discovered, scanned, claimed, verified, certified |
| `badge-url` | URL of the trust badge SVG |
| `profile-url` | URL the badge links to: the registry trust lookup for the package |
| `updated` | Whether the README was updated (`true`/`false`) |

## Badge Placement

The action auto-places the badge after existing badges or the first heading. An existing OpenA2A badge for the same package is replaced where it is, on the same line; badges for other packages and examples inside code blocks are left as they are. To control placement manually, add markers:

```markdown
<!-- opena2a-trust-badge -->
<!-- /opena2a-trust-badge -->
```

If your default branch has protection rules, set `create-pr: true` to use PR mode with auto-merge.

## License

Apache-2.0

---

Part of the [OpenA2A](https://opena2a.org) ecosystem. See also: [Trust Gate](https://github.com/opena2a-org/trust-gate), [OpenA2A CLI](https://github.com/opena2a-org/opena2a).
