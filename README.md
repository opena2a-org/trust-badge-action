# OpenA2A Trust Badge

[![Status: stable](https://img.shields.io/badge/status-stable-green)](STATUS.md)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> **[OpenA2A](https://github.com/opena2a-org)**: [CLI](https://github.com/opena2a-org/opena2a) · [HackMyAgent](https://github.com/opena2a-org/hackmyagent) · [Secretless](https://github.com/opena2a-org/secretless-ai) · [AIM](https://github.com/opena2a-org/agent-identity-management) · [Browser Guard](https://github.com/opena2a-org/ai-browserguard) · [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent)

[Website](https://opena2a.org) · [Discord](https://discord.gg/uRZa3KXgEn)

A GitHub Action that adds and auto-updates an OpenA2A Registry trust score badge in your README.

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
        with:
          registry-url: https://api.oa2a.org
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The `v1` tag is the `v1.1.0` release, whose default registry host has no DNS record, so the `registry-url` line is required: a `@v1` step without it fails at the registry lookup. [The v1 tag page](docs/v1-tag.md) lists the other differences from the behaviour below and how to pin a commit of `main` instead.

For a package with a trust profile, the step writes a badge into your README. Below are the badge it writes for `opena2a-cli` on npm and the markdown for your package's badge:

[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/c34d581b-0a55-4eeb-aa1c-37dfaa0c90a8/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=opena2a-cli&source=npm)

```
[![OpenA2A Trust Score](https://api.oa2a.org/v1/trust/<agent-id>/badge.svg)](https://api.oa2a.org/v1/trust/lookup?package=<package-name>&source=<package-source>)
```

`<agent-id>` is the id the registry lookup returns for your package. When the lookup returns no agent id in UUID form, the image for a package name without `/` names the package instead: `https://api.oa2a.org/v1/trust/badge/<package-name>?source=<package-source>`. The badge links to the registry's JSON trust lookup for the package, the URL the action reads the trust score from, not to a web page.

The action reads the package name from the first of `package.json`, `pyproject.toml`, `setup.py` and `setup.cfg` that names one. The lookup source stays `npm` whatever file the name came from, so a package on PyPI or GitHub sets `package-source`. Override either with:

```yaml
      - uses: opena2a-org/trust-badge-action@v1
        with:
          package-name: '@my-org/my-agent'
          package-source: npm
          registry-url: https://api.oa2a.org
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `readme-path` | Path to the README file, relative to the repository root; a path that resolves outside the checkout fails the run | `README.md` |
| `package-name` | Package name (auto-detected if omitted) | |
| `package-source` | Package source: `npm`, `pypi`, `github`, `dockerhub`, `a2as` | `npm` |
| `registry-url` | OpenA2A Registry API URL | `https://api.oa2a.org` |
| `create-pr` | Create a PR instead of committing directly | `false` |
| `auto-merge` | Auto-merge the PR (only when `create-pr: true`) | `true` |
| `github-token` | GitHub token for commits/PRs if the `GITHUB_TOKEN` environment variable is unset; without either, the README is updated in the workspace only | |

`create-pr` and `auto-merge` accept `true`, `True`, `TRUE`, `false`, `False`, `FALSE`; any other value fails the run and names the input.

## Outputs

| Output | Description |
|--------|-------------|
| `trust-score` | Trust score as the registry lookup returns it: a number from 0 to 1, not rounded |
| `trust-level` | Level: discovered, scanned, claimed, verified, certified, or blocked for a package the registry has blocked, such as one whose scan failed |
| `badge-url` | URL of the trust badge SVG |
| `profile-url` | URL the badge links to: the registry trust lookup for the package |
| `updated` | Whether the README was updated (`true`/`false`) |

## Failed Runs

A package with no trust profile does not fail the run: the README is left as it is and `updated` is `false`. The run fails, with the README unchanged and no outputs set, when:

- `registry-url` is not an `http` or `https` URL.
- `create-pr` or `auto-merge` has a value other than `true`, `True`, `TRUE`, `false`, `False` or `FALSE`.
- The registry gives no answer, a partial answer, a 429 or a 5xx on each of 3 tries.
- The registry answers with another unexpected status, or with a body that is not JSON.
- The registry answers with JSON that is not a trust profile (an object with `agentId`, `trustScore` and `trustLevel`).
- The package name contains `/` (a scoped npm or `owner/repo` name) and the lookup returns no agent id in UUID form.
- The badge image's score or level differs from the lookup's; each run prints both and fails until the registry's image agrees.
- GitHub refuses the commit or PR (protected branch, token without `contents: write`, README changed since checkout); only the workspace README changes.
- `readme-path` resolves outside the repository checkout, `GITHUB_WORKSPACE`.

For a failing status, the log quotes the registry's `error` text when it sends one. [Failed runs](docs/failed-runs.md) gives the retry timing, why a package name with `/` gets no badge and the `readme-path` failure message.

## Badge Placement

The action auto-places the badge after existing badges or the first heading, a markdown `#` heading or the HTML block that holds an `<h1>` to `<h6>` tag. An existing OpenA2A badge for the same package is replaced where it is.

[Badge placement](docs/badge-placement.md) covers a badge that shares its line with other text and the badge text the action leaves alone. To control placement manually, add markers:

```markdown
<!-- opena2a-trust-badge -->
<!-- /opena2a-trust-badge -->
```

If your default branch has protection rules, set `create-pr: true` to use PR mode with auto-merge.

## License

Apache-2.0

---

Part of the [OpenA2A](https://opena2a.org) ecosystem. See also: [Trust Gate](https://github.com/opena2a-org/trust-gate), [OpenA2A CLI](https://github.com/opena2a-org/opena2a).
