import { writeFile } from 'node:fs/promises';

const USERNAME = process.env.GITHUB_USERNAME || 'Enferlain';
const MAX_REPOS = toInteger(process.env.MAX_REPOS, 5);
const MAX_AGE_DAYS = toInteger(process.env.MAX_AGE_DAYS, 30);
const INCLUDE_FORKS = parseBoolean(process.env.INCLUDE_FORKS, true);
const INCLUDE_ARCHIVED = parseBoolean(process.env.INCLUDE_ARCHIVED, false);
const TOKEN = process.env.GITHUB_TOKEN || '';

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'repo-bubbles-data-updater'
};

if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

async function main() {
  const repos = await getPublicRepos();
  const recent