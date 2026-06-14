const USERNAME = process.env.GITHUB_USERNAME || "Enferlain";
const MAX_REPOS = numberEnv("MAX_REPOS", 5);
const MAX_AGE_DAYS = Math.min(numberEnv("MAX_AGE_DAYS", 30), 30);
const INCLUDE_FORKS = boolEnv("INCLUDE_FORKS", true);
const INCLUDE_ARCHIVED = boolEnv("INCLUDE_ARCHIVED", false);
const EXCLUDED_REPOS = new Set(
  (process.env.EXCLUDED_REPOS || "repo-data")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

const API_VERSION = "2022-11-28";
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": "repo-bubbles-data-updater",
};

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

async function githubJson(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${url}\n${text}`);
  }

  return response.json();
}

async function listRecentPublicEvents() {
  const events = [];

  for (let page = 1; page <= 3; page += 1) {
    const url = new URL(`https://api.github.com/users/${USERNAME}/events/public`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const pageEvents = await githubJson(url);
    if (!Array.isArray(pageEvents) || pageEvents.length === 0) break;

    events.push(...pageEvents);
    if (pageEvents.length < 100) break;
  }

  return events;
}

function getPushCommitCount(event) {
  const size = Number(event.payload?.size);
  if (Number.isFinite(size) && size > 0) return size;

  const commits = event.payload?.commits;
  if (Array.isArray(commits)) return commits.length;

  return 0;
}

function groupPushEvents(events) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const groups = new Map();

  for (const event of events) {
    if (event.type !== "PushEvent") continue;
    if (Date.parse(event.created_at) < cutoff) continue;

    const fullName = event.repo?.name;
    if (!fullName || !fullName.includes("/")) continue;

    const repoName = fullName.split("/").pop();
    if (EXCLUDED_REPOS.has(repoName) || EXCLUDED_REPOS.has(fullName)) continue;

    const commitCount = getPushCommitCount(event);
    if (commitCount < 1) continue;

    const current = groups.get(fullName) || {
      fullName,
      name: repoName,
      recentCommits: 0,
      pushEvents: 0,
      latestEventAt: event.created_at,
      refs: new Set(),
    };

    current.recentCommits += commitCount;
    current.pushEvents += 1;

    if (Date.parse(event.created_at) > Date.parse(current.latestEventAt)) {
      current.latestEventAt = event.created_at;
    }

    const ref = String(event.payload?.ref || "").replace(/^refs\/heads\//, "");
    if (ref) current.refs.add(ref);

    groups.set(fullName, current);
  }

  return [...groups.values()];
}

async function fetchRepoMetadata(fullName) {
  return githubJson(`https://api.github.com/repos/${fullName}`);
}

function activityScore(group, repo) {
  const recencyBoost = Math.max(0, MAX_AGE_DAYS - daysAgo(group.latestEventAt)) * 35;

  return Math.round(
    group.recentCommits * 1000 +
      group.pushEvents * 125 +
      repo.stargazers_count * 70 +
      repo.forks_count * 45 +
      recencyBoost,
  );
}

async function main() {
  const events = await listRecentPublicEvents();
  const groups = groupPushEvents(events);
  const repos = [];

  for (const group of groups) {
    const repo = await fetchRepoMetadata(group.fullName);

    if (repo.private) continue;
    if (!INCLUDE_FORKS && repo.fork) continue;
    if (!INCLUDE_ARCHIVED && repo.archived) continue;

    repos.push({
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description || "",
      commits: group.recentCommits,
      totalCommits: null,
      recentCommits: group.recentCommits,
      pushEvents: group.pushEvents,
      refs: [...group.refs].sort(),
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language || "",
      isFork: repo.fork,
      updatedAt: group.latestEventAt,
      pushedAt: repo.pushed_at,
      activityScore: activityScore(group, repo),
    });
  }

  repos.sort((a, b) => b.activityScore - a.activityScore);

  const output = {
    generatedAt: new Date().toISOString(),
    username: USERNAME,
    maxAgeDays: MAX_AGE_DAYS,
    source: "github-public-user-push-events",
    rules: {
      maxRepos: MAX_REPOS,
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

  console.log(`Found ${groups.length} recently pushed repos; wrote ${output.repos.length} repos to repos.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
