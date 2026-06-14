const USERNAME = process.env.GITHUB_USERNAME || "Enferlain";
const MAX_REPOS = numberEnv("MAX_REPOS", 5);
const MAX_AGE_DAYS = numberEnv("MAX_AGE_DAYS", 30);
const INCLUDE_FORKS = boolEnv("INCLUDE_FORKS", true);
const INCLUDE_ARCHIVED = boolEnv("INCLUDE_ARCHIVED", false);
const CANDIDATE_LIMIT = numberEnv("CANDIDATE_LIMIT", Math.max(MAX_REPOS * 3, 10));
const BRANCH_LIMIT = numberEnv("BRANCH_LIMIT", 20);
const EXCLUDED_REPOS = new Set(
  (process.env.EXCLUDED_REPOS || "repo-data")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

// Do not use the repo's default GITHUB_TOKEN for discovery.
// If you hit unauthenticated rate limits, create a fine-grained read-only token
// and pass it as GITHUB_PUBLIC_TOKEN instead.
const TOKEN = process.env.GITHUB_PUBLIC_TOKEN || "";

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "repo-bubbles-data-updater",
};

if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function daysAgo(dateString) {
  const time = Date.parse(dateString);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / 86_400_000;
}

function splitFullName(fullName) {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}

function repoApiUrl(fullName, path) {
  const { owner, repo } = splitFullName(fullName);
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;
}

async function githubJson(url, { allowStatuses = [] } = {}) {
  const response = await fetch(url, { headers });

  if (allowStatuses.includes(response.status)) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${url}\n${text}`);
  }

  return response.json();
}

async function listPublicRepos() {
  const repos = [];

  for (let page = 1; page <= 3; page += 1) {
    const url = new URL(`https://api.github.com/users/${USERNAME}/repos`);
    url.searchParams.set("type", "owner");
    url.searchParams.set("sort", "pushed");
    url.searchParams.set("direction", "desc");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const pageRepos = await githubJson(url);
    if (!Array.isArray(pageRepos) || pageRepos.length === 0) break;

    repos.push(...pageRepos);
    if (pageRepos.length < 100) break;
  }

  return repos;
}

async function listBranches(fullName) {
  const branches = [];

  for (let page = 1; page <= 3; page += 1) {
    const url = new URL(repoApiUrl(fullName, "/branches"));
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const pageBranches = await githubJson(url, { allowStatuses: [404, 409] });
    if (!Array.isArray(pageBranches) || pageBranches.length === 0) break;

    branches.push(...pageBranches.map((branch) => branch.name).filter(Boolean));
    if (pageBranches.length < 100 || branches.length >= BRANCH_LIMIT) break;
  }

  return branches.slice(0, BRANCH_LIMIT);
}

async function listRecentCommitsForBranch(fullName, branchName, cutoffIso) {
  const commits = [];

  for (let page = 1; page <= 3; page += 1) {
    const url = new URL(repoApiUrl(fullName, "/commits"));
    url.searchParams.set("sha", branchName);
    url.searchParams.set("since", cutoffIso);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const pageCommits = await githubJson(url, { allowStatuses: [404, 409, 422] });
    if (!Array.isArray(pageCommits) || pageCommits.length === 0) break;

    commits.push(...pageCommits);
    if (pageCommits.length < 100) break;
  }

  return commits;
}

function getCommitDate(commit) {
  return (
    commit.commit?.committer?.date ||
    commit.commit?.author?.date ||
    null
  );
}

async function getRecentBranchActivity(repo, cutoffIso) {
  const branchNames = await listBranches(repo.full_name);
  const commitsBySha = new Map();
  const branchesBySha = new Map();

  for (const branchName of branchNames) {
    const commits = await listRecentCommitsForBranch(repo.full_name, branchName, cutoffIso);

    for (const commit of commits) {
      if (!commit.sha) continue;

      const commitDate = getCommitDate(commit);
      if (!commitDate || Date.parse(commitDate) < Date.parse(cutoffIso)) continue;

      commitsBySha.set(commit.sha, commit);

      const branchSet = branchesBySha.get(commit.sha) || new Set();
      branchSet.add(branchName);
      branchesBySha.set(commit.sha, branchSet);
    }
  }

  const branchSet = new Set();
  let latestCommitAt = null;

  for (const [sha, commit] of commitsBySha) {
    const commitDate = getCommitDate(commit);
    if (!latestCommitAt || Date.parse(commitDate) > Date.parse(latestCommitAt)) {
      latestCommitAt = commitDate;
    }

    for (const branchName of branchesBySha.get(sha) || []) {
      branchSet.add(branchName);
    }
  }

  return {
    recentCommits: commitsBySha.size,
    refs: [...branchSet].sort(),
    latestCommitAt,
    scannedBranches: branchNames.length,
  };
}

function activityScore(activity, repo) {
  const recencyBoost = Math.max(0, MAX_AGE_DAYS - daysAgo(activity.latestCommitAt)) * 35;

  return Math.round(
    activity.recentCommits * 1000 +
      activity.refs.length * 150 +
      repo.stargazers_count * 70 +
      repo.forks_count * 45 +
      recencyBoost,
  );
}

async function main() {
  const cutoffIso = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString();

  const candidates = (await listPublicRepos())
    .filter((repo) => !repo.private)
    .filter((repo) => INCLUDE_FORKS || !repo.fork)
    .filter((repo) => INCLUDE_ARCHIVED || !repo.archived)
    .filter((repo) => !EXCLUDED_REPOS.has(repo.name) && !EXCLUDED_REPOS.has(repo.full_name))
    .filter((repo) => repo.pushed_at && daysAgo(repo.pushed_at) <= MAX_AGE_DAYS)
    .slice(0, CANDIDATE_LIMIT);

  const repos = [];

  for (const repo of candidates) {
    const activity = await getRecentBranchActivity(repo, cutoffIso);

    if (activity.recentCommits < 1) continue;

    repos.push({
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description || "",
      commits: activity.recentCommits,
      totalCommits: null,
      recentCommits: activity.recentCommits,
      refs: activity.refs,
      scannedBranches: activity.scannedBranches,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language || "",
      isFork: repo.fork,
      updatedAt: activity.latestCommitAt,
      pushedAt: repo.pushed_at,
      activityScore: activityScore(activity, repo),
    });
  }

  repos.sort((a, b) => b.activityScore - a.activityScore);

  const output = {
    generatedAt: new Date().toISOString(),
    username: USERNAME,
    maxAgeDays: MAX_AGE_DAYS,
    source: "github-repo-branches-commits-since",
    rules: {
      maxRepos: MAX_REPOS,
      candidateLimit: CANDIDATE_LIMIT,
      branchLimit: BRANCH_LIMIT,
      includeForks: INCLUDE_FORKS,
      includeArchived: INCLUDE_ARCHIVED,
      excludedRepos: [...EXCLUDED_REPOS],
      minRecentCommits: 1,
    },
    repos: repos.slice(0, MAX_REPOS),
  };

  await import("node:fs/promises").then((fs) =>
    fs.writeFile("repos.json", `${JSON.stringify(output, null, 2)}\n`),
  );

  console.log(
    `Scanned ${candidates.length} recently pushed repos; wrote ${output.repos.length} repos to repos.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
