# The v1 tag

The `v1` tag points to the same commit as the `v1.1.0` release, `216064e`. Behaviour documented in the README that was added on `main` after that commit is not in it, so a workflow that pins `opena2a-org/trust-badge-action@v1` runs as the right-hand column below says until `v1` moves to a newer release.

| The README documents | At the `v1` tag |
|----------------------|-----------------|
| The badge links to `https://api.oa2a.org/v1/trust/lookup?package=<package-name>&source=<package-source>` | The badge links to `<registry-url>/agents/<agent-id>` |
| When the lookup returns no agent id in UUID form, the image for a package name without `/` is `<registry-url>/v1/trust/badge/<package-name>?source=<package-source>` | The image is `<registry-url>/v1/trust/<agent-id>/badge.svg` whatever agent id the lookup returns |
| The `profile-url` output is the URL the badge links to | The `profile-url` output is the `profileUrl` field of the lookup answer |
| `registry-url` defaults to `https://api.oa2a.org` | `registry-url` defaults to `https://registry.opena2a.org` |
| A `github-token` input | `github-token` is not declared in `action.yml`, so the runner logs an unexpected-input warning for a `with: github-token:` value, but that value is still read when the `GITHUB_TOKEN` environment variable is unset |
| A lookup with no answer, a partial answer, a 429 or a 5xx is tried 3 times, with pauses of 2 and 4 seconds | A single attempt with a 15 second timeout |
| A package name with `/` whose lookup returns no agent id in UUID form fails the run | No such check: the badge is written from the agent id the lookup returns |
| An existing OpenA2A badge is replaced only when it is for the same package, on the line it is on; badges for other packages, and badge text in a code block, an HTML comment or an HTML block, are left as they are | Code blocks and HTML blocks are read like any other text; the first OpenA2A badge whose image is on `registry.opena2a.org` is replaced wherever it is and whatever package it is for, and when it shares its line with other text the markers split that line, the badge on a line of its own; a badge whose image is on another host, `api.oa2a.org` included, is not seen, and a second badge is added |
| A `pyproject.toml` name written as a single-quoted TOML string, `name = 'my-pkg'`, is read like one written as a double-quoted string, `name = "my-pkg"` | Only a double-quoted `pyproject.toml` name is read; a single-quoted one is skipped, and when no other manifest names the package the run logs that it could not detect the package name and sets `updated` to `false` |
| The `pyproject.toml` name is the `name` key of the `[project]` table, or of `[tool.poetry]` when there is no `[project]` name; a `name` key in any other table, such as `[[tool.uv.index]]`, is not read, and neither is a line inside a multi-line string | The first line of `pyproject.toml` that sets `name` to a double-quoted string is read, whatever table it is in and inside a multi-line string too, so a `[[tool.uv.index]]` name above `[project]` is read as the package name |
| The README is committed to the branch the run is for, in place of the README of the commit the run checked out; with `create-pr: true` the pull request goes into that branch from a branch set to the commit the run checked out, `opena2a/update-trust-badge` for a run on the default branch and `opena2a/update-trust-badge-<branch>` for a run on another branch; a run for a tag, a pull request merge ref or a merge queue branch commits nothing and opens no pull request | The README is committed to the default branch, in place of the default branch's README at the time of the write, whatever branch or ref the run is for; with `create-pr: true`, `opena2a/update-trust-badge` is set to the head of the default branch and the pull request goes into the default branch |

To run the behaviour the README documents before then, pin a commit of `main` instead of the tag:

```yaml
      - uses: opena2a-org/trust-badge-action@<commit-sha>
```

Each row can be checked against the tag with `git show v1:src/index.ts`, `git show v1:action.yml`, `git show v1:src/registry.ts`, `git show v1:src/readme.ts` and `git show v1:src/detect.ts`.
