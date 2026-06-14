# repo-data bubbles updater

This version does **not** use public user events and does **not** only check the default branch.

It works like this:

1. List public repos for `Enferlain`, sorted by recent push.
2. Keep repos pushed within `MAX_AGE_DAYS`.
3. Exclude `repo-data`.
4. For each candidate repo, list branches.
5. For each branch, fetch commits since the cutoff date.
6. Deduplicate commits by SHA per repo.
7. Write the top repos to `repos.json`.

This catches commits pushed to non-default branches, such as feature/refactor branches.

## Apply

Copy these files into `Enferlain/repo-data`:

```text
scripts/update-repos.mjs
.github/workflows/update-repos.yml
repos.json
README-repo-data.md
```

Then commit and push:

```bash
git add repos.json scripts/update-repos.mjs .github/workflows/update-repos.yml README-repo-data.md
git commit -m "Scan all branches for repo bubble activity"
git push
```

Then run the workflow manually from GitHub Actions.

## Rate limits

By default the script uses unauthenticated public GitHub API reads. If it hits rate limits, create a read-only token and add it as the `GITHUB_PUBLIC_TOKEN` repository secret, then uncomment the workflow line.
