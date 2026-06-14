# Repo bubbles data

This repository stores a generated `repos.json` file for the profile page repo bubbles.

The updater uses GitHub public user `PushEvent` activity instead of checking only default branches.
That means pushes to feature branches/fork branches still count.

## Files

- `scripts/update-repos.mjs` — generates `repos.json`
- `.github/workflows/update-repos.yml` — runs the updater every 6 hours and manually
- `repos.json` — public data consumed by the profile page

## Output URL

```txt
https://raw.githubusercontent.com/Enferlain/repo-data/main/repos.json
```

## Notes

GitHub's public events API only includes recent public activity, so this is meant for a "recent activity" visual rather than lifetime repository statistics.
