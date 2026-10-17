# The v1 tag

The `v1` tag points to the same commit as the `v1.1.0` release, `216064e`. Behaviour documented in the README that was added on `main` after that commit is not in it, so a workflow that pins `opena2a-org/trust-badge-action@v1` runs as the right-hand column below says until `v1` moves to a newer release.

| The README documents | At the `v1` tag |
|----------------------|-----------------|
| The badge links to `https://api.oa2a.org/v1/trust/lookup?package=<package-name>&source=<package-source>` | The badge links to `<registry-url>/agents/<agent-id>` |
| When the lookup returns no agent id in UUID form, the image for a package name without `/` is `<registry-url>/v1/trust/badge/<package-name>?source=<package-source>` | The image is `<registry-url>/v1/trust/<agent-id>/badge.svg` whatever agent id the lookup returns |
| The `profile-url` output is the URL the badge links to | The `profile-url` output is the `profileUrl` field of the lookup answer |
| `registry-url` defaults to `https://api.oa2a.org` | `registry-url` defaults to `https://registry.opena2a.org` |
| A `github-token` input | No `github-token` input |
| A lookup with no answer, a partial answer, a 429 or a 5xx is tried 3 times, with pauses of 2 and 4 seconds | A single attempt with a 15 second timeout |
| A package name with `/` whose lookup returns no agent id in UUID form fails the run | No such check: the badge is written from the agent id the lookup returns |

To run the behaviour the README documents before then, pin a commit of `main` instead of the tag:

```yaml
      - uses: opena2a-org/trust-badge-action@<commit-sha>
```

Each row can be checked against the tag with `git show v1:src/index.ts`, `git show v1:action.yml` and `git show v1:src/registry.ts`.
