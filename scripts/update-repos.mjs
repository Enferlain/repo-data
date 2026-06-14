import { writeFile } from "node:fs/promises";

const USERNAME = process.env.GITHUB_USERNAME || "Enferlain";
const TOKEN = process.env.GITHUB_TOKEN || "";

const MAX_REPOS = readIntegerEnv("MAX_REPOS", 5, 1, 20);
const MAX_AGE_DAYS = readIntegerEnv("MAX_AGE_DAYS", 30, 1, 365);
const CANDIDATE_MULTIPLIER = readIntegerEnv("CANDIDATE_MULTIPLIER", 8, 1, 20);
const INCLUDE_FORKS = readBooleanEnv("INCLUDE_FORKS", true);
const INCLUDE_ARCHIVED = readBooleanEnv("INCLUDE_ARCHIVED", false);

const cutoffDate = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
const cutoffIso = cutoffDate.toISOString();

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "repo-bubbles-data-updater"
};

if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

async function main() {
  const publicRepos = await getPublicRepos();

  const candidates = publicRepos
    .filter((repo) => !repo.private)
    .filter((repo) => INCLUDE_FORKS || !repo.fork)
    .filter((repo) => INCLUDE_ARCHIVED || !repo.archived)
    .filter((repo) => repo.default_branch)
    .filter((repo) => repo.pushed_at)
    .filter((repo) => daysSince(repo.pushed_at) <= MAX_AGE_DAYS)
    .slice(0, MAX_REPOS * CANDIDATE_MULTIPLIER);

  const repos = [];

  for (const repo of candidates) {
    const stats = await getCommitStats(repo);

    if (stats.totalCommits < 1) continue;
    if (stats.recentCommits < 1) continue;

    repos.push({
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description || "",
      commits: stats.totalCommits,
      totalCommits: stats.totalCommits,
      recentCommits: stats.recentCommits,
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      language: repo.language || "",
      isFork: Boolean(repo.fork),
      updatedAt: repo.pushed_at,
      activityScore: activityScore(repo, stats)
    });
  }

  repos.sort((a, b) => b.activityScore - a.activityScore);

  const output = {
    generatedAt: new Date().toISOString(),
    username: USERNAME,
    maxAgeDays: MAX_AGE_DAYS,
    rules: {
      maxRepos: MAX_REPOS,
      includeForks: INCLUDE_FORKS,
      includeArchived: INCLUDE_ARCHIVED,
      minTotalCommits: 1,
      minRecentCommits: 1
    },
    repos: repos.slice(0, MAX_REPOS)
  };

  await writeFile("repos.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${output.repos.length} repositories to repos.json`);
}

async function getPublicRepos() {
  const repos = [];

  for (let page = 1; page <= 5; page++) {
    const url = new URL(`https://api.github.com/users/${encodeURIComponent(USERNAME)}/repos`);
    url.searchParams.set("type", "owner");
    url.searchParams.set("sort", "pushed");
    url.searchParams.set("direction", "desc");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const pageRepos = await githubJson(url);
    repos.push(...pageRepos);

    if (pageRepos.length < 100) break;

    const oldestOnPage = pageRepos[pageRepos.length - 1]?.pushed_at;
    if (oldestOnPage && daysSince(oldestOnPage) > MAX_AGE_DAYS) break;
  }

  return repos;
}

async function getCommitStats(repo) {
  if (!repo.default_branch) {
    return { totalCommits: 0, recentCommits: 0 };
  }

  const totalUrl = new URL(`https://api.github.com/repos/${repo.full_name}/commits`);
  totalUrl.searchParams.set("sha", repo.default_branch);
  totalUrl.searchParams.set("per_page", "1");

  const totalResponse = await githubFetch(totalUrl, { allowEmptyRepo: true });
  if (!totalResponse) {
    return { totalCommits: 0, recentCommits: 0 };
  }

  const totalData = await totalResponse.json();
  const totalCommits = Array.isArray(totalData) && totalData.length > 0
    ? parseLastPage(totalResponse.headers.get("link")) || totalData.length
    : 0;

  if (totalCommits < 1) {
    return { totalCommits: 0, recentCommits: 0 };
  }

  const recentCommits = await countRecentCommits(repo);
  return { totalCommits, recentCommits };
}

async function countRecentCommits(repo) {
  let count = 0;

  for (let page = 1; page <= 10; page++) {
    const url = new URL(`https://api.github.com/repos/${repo.full_name}/commits`);
    url.searchParams.set("sha", repo.default_branch);
    url.searchParams.set("since", cutoffIso);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await githubFetch(url, { allowEmptyRepo: true });
    if (!response) return 0;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;

    count += data.length;
    if (data.length < 100) break;
  }

  return count;
}

function activityScore(repo, stats) {
  const age = Math.max(0, daysSince(repo.pushed_at));
  const recencyBoost = Math.max(0, MAX_AGE_DAYS - age) * 25;

  return Math.round(
    stats.recentCommits * 220 +
      Math.log1p(stats.totalCommits) * 90 +
      (repo.stargazers_count || 0) * 70 +
      (repo.forks_count || 0) * 45 +
      recencyBoost
  );
}

async function githubJson(url) {
  const response = await githubFetch(url);
  return response.json();
}

async function githubFetch(url, options = {}) {
  const response = await fetch(url, { headers });

  if (options.allowEmptyRepo && (response.status === 404 || response.status === 409)) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${url}\n${text}`);
  }

  return response;
}

function parseLastPage(linkHeader) {
  if (!linkHeader) return null;

  const match = linkHeader.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  return match ? Number(match[1]) : null;
}

function daysSince(dateString) {
  const time = Date.parse(dateString);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / (24 * 60 * 60 * 1000);
}

function readIntegerEnv(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function readBooleanEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
