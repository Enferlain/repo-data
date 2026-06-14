# repo-data GitHub bubbles setup

This repo publishes a static `repos.json` file for a public profile page.

The GitHub Action runs every 6 hours and manually via **Actions → Update repo bubbles data → Run workflow**.

Rules:

- includes forks
- excludes archived repos
- uses public repos only
- drops repos with zero total commits
- drops repos with zero commits on the default branch in the last 30 days
- keeps the top 5 by activity score

Fetch URL:

```txt
https://raw.githubusercontent.com/Enferlain/repo-data/main/repos.json
```
