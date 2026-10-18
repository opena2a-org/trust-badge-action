# Releasing

A release is one commit on `main` that sets the version and carries the bundle rebuilt for it and its changelog section, then a version tag and a GitHub release for that commit, and the `v1` tag moved to it. A workflow that uses `opena2a-org/trust-badge-action@v1` runs the commit `v1` points to, so it runs the release once `v1` moves. These steps are for a release in major version 1, the one `v1` follows.

1. On a branch from an up-to-date `main`, set the version:

   ```
   npm version <version> --no-git-tag-version
   ```

   This changes the version in `package.json` and `package-lock.json`, and commits and tags nothing.

2. Rebuild the bundle:

   ```
   npm ci
   npm run build
   ```

   The build reads the version from `package.json` into `dist/index.js`, which sends it in the `User-Agent` of the registry requests, `opena2a-trust-badge-action/<version>`, and logs it as `trust-badge-action <version>` outside a runner. A version change committed without the rebuilt `dist/` fails `npm test`, and the CI step that runs `scripts/verify-dist.sh`, which fails while the committed `dist/` differs from a clean rebuild.

3. In `CHANGELOG.md`, rename the `## Unreleased` heading to `## <version> - <yyyy-mm-dd>` and add an empty `## Unreleased` section above it.

4. While `v1` points to `v1.1.0`, the release that moves it also retires the v1 tag page, in the same commit: delete `docs/v1-tag.md`, the README paragraph under the workflow example that links it, and the assertions in `__tests__/readme-doc.test.ts` that read it, then remove this step from this page.

5. Run `npm run lint` and `npm test`, commit `package.json`, `package-lock.json`, `dist/` and `CHANGELOG.md`, with the changes of step 4, in one commit, and merge it into `main` once CI passes.

6. Tag the commit the merge put on `main`, and push the tag:

   ```
   git tag -a v<version> -m "v<version>" <commit>
   git push origin refs/tags/v<version>
   ```

7. Create the GitHub release for the tag, with the version's `CHANGELOG.md` section as its notes:

   ```
   gh release create v<version> --verify-tag --title "v<version>" --notes-file <file holding the section>
   ```

8. Move `v1` to the same commit:

   ```
   git tag -fa v1 -m "v1: v<version>" "v<version>^{}"
   git push --force origin refs/tags/v1
   ```

   Both tags then name one commit: `git ls-remote origin 'refs/tags/v1^{}' 'refs/tags/v<version>^{}'` prints the same commit on both lines.
