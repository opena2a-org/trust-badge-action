# Failed runs

A package with no trust profile does not fail the run: the README is left as it is and `updated` is `false`. The run fails, with the README unchanged and no outputs set, when:

- The registry does not answer. A lookup with no answer or only part of one, a 429 or a 5xx is tried 3 times, each attempt allowed 15 seconds, with pauses of 2 and then 4 seconds: against a registry that does not answer, the run fails after about 51 seconds.
- The registry answers with another unexpected status, or with a body that is not JSON or not a trust profile (an object with `agentId`, `trustScore` and `trustLevel`). For a failing status, the log quotes the registry's `error` text when it sends one.
- The package name contains `/` (a scoped npm name or an `owner/repo` name) and the lookup returns no agent id in UUID form. The registry serves no badge image by name for such a package, so there is no badge to write.
