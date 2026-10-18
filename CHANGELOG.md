# Changelog

Changes a workflow that uses the action can see, newest first. [Releasing](docs/releasing.md) says how a release is cut and when this file is updated.

## Unreleased

Changes on `main` since 1.1.0, the release the `v1` tag points to.

### Runs that now fail

Each of these now fails the run, with no outputs set:

- GitHub refuses the README commit or the pull request. The README is updated in the workspace only. 1.1.0 logged a warning and passed with `updated` set to `true`.
- `create-pr` or `auto-merge` has a value other than `true`, `True`, `TRUE`, `false`, `False` or `FALSE`. 1.1.0 turned `create-pr` on only for `true` and `auto-merge` off only for `false`.
- The lookup answers with JSON that is not a trust profile, an object with `agentId`, `trustScore` and `trustLevel`. 1.1.0 wrote a badge from an answer such as `{}`.
- The badge image's score or level differs from the lookup's: the action now fetches the image before writing it and reads its title, `Trust: <score> | <level>`.
- The package name contains `/` and the lookup returns no agent id in UUID form, since the registry serves no badge image by name for such a package. 1.1.0 wrote the badge from the agent id the lookup returned.
- `readme-path` resolves outside the workspace, `GITHUB_WORKSPACE`. 1.1.0 resolved it against the process working directory and wrote the file it named wherever it was.

### Changed

- The action runs on Node 24: `runs.using` is `node24`, where 1.1.0 declared `node20`.
- `registry-url` defaults to `https://api.oa2a.org`. The 1.1.0 default, `https://registry.opena2a.org`, has no DNS record, so a 1.1.0 step without `registry-url` fails at the lookup.
- The badge links to the registry's JSON trust lookup for the package, `<registry-url>/v1/trust/lookup?package=<package-name>&source=<package-source>`, and the `profile-url` output is that URL. 1.1.0 linked to `<registry-url>/agents/<agent-id>`, which answers 404 on `https://api.oa2a.org`, and set `profile-url` to the lookup's `profileUrl`, on `registry.opena2a.org`.
- When the lookup returns no agent id in UUID form, the badge image for a package name without `/` names the package: `<registry-url>/v1/trust/badge/<package-name>?source=<package-source>`.
- A lookup with no answer, a partial answer, a 429 or a 5xx is tried 3 times, each attempt allowed 15 seconds, with pauses of 2 and then 4 seconds. 1.1.0 made one attempt.
- For a failing status, the error quotes the registry's `error` text when the answer carries one, and names the reason phrase only when the answer has one, as no HTTP/2 answer does.
- Without a `GITHUB_TOKEN` environment variable or a `github-token` value, the line that says the README was updated in the workspace only is logged as a warning, where 1.1.0 logged it as a plain line.
- The README is committed to the branch the run is for. With `create-pr: true` the pull request goes into that branch, from `opena2a/update-trust-badge` for a run on the default branch or `opena2a/update-trust-badge-<branch>` for a run on another branch. A run for a tag, a pull request merge ref or a merge queue branch commits nothing and opens no pull request. 1.1.0 committed to the default branch whatever the run was for.
- `readme-path` is resolved against the workspace, and the README is committed under its path relative to the workspace, with `/` separators.
- An existing OpenA2A badge is replaced only when its image names the same package or agent id, on the line it is on. Badges for other packages, and badge text in a code block, an HTML comment or an HTML block, are left as they are. 1.1.0 replaced the first badge whose image was on `registry.opena2a.org`, wherever it was, and did not see a badge on `api.oa2a.org`.
- Badge placement counts the HTML block that holds an `<h1>` to `<h6>` tag as a heading, as it does a markdown `#` heading.
- In a README whose first line ends with CRLF, the lines the action adds end with CRLF.
- The `pyproject.toml` name is the `name` key of the `[project]` table, or of `[tool.poetry]` when `[project]` has none, in single or double quotes or as a dotted key such as `project.name`. A `name` key in another table and a line inside a multi-line value are not read. 1.1.0 read the first line that set `name` to a double-quoted string.
- The log line and the pull request body show the trust score from 0 to 100 with the fraction dropped, as the badge does. The `trust-score` output is still the lookup's score, from 0 to 1.
- The registry requests send `opena2a-trust-badge-action/<version>` as `User-Agent`, with the version in `package.json`. 1.1.0 sent `opena2a-trust-badge-action/1.0`.
- A `registry-url` that is not an `http` or `https` URL fails the run before the lookup, with an error that names the input. A `readme-path` that names a directory fails with an error that says so.
- Outside a runner, the log starts with the version and the `INPUT_<NAME>` environment variables the inputs are read from.

### Added

- `action.yml` declares the `github-token` input. 1.1.0 read a `github-token` value without declaring the input.

## 1.1.0 - 2026-03-12

- An opening `<!-- opena2a-trust-badge -->` marker with no closing marker is replaced, with the text after it up to the next blank line, or to the end of its line when no blank line follows.
- The README explains the trust score, says how to run the workflow once from the Actions tab, and lists the `github-token` input.

## 1.0.0 - 2026-03-11

- First release. The action reads the package name from `package.json`, `pyproject.toml`, `setup.py` or `setup.cfg`, looks up its trust profile in the OpenA2A Registry and adds or updates the trust badge in the README. It commits the change directly or, with `create-pr: true`, opens a pull request and merges it or turns on auto-merge, unless `auto-merge` is `false`.
