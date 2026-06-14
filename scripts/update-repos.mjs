import { readFile, writeFile } from "node:fs/promises";

const USER = process.env.GITHUB_USERNAME || "Enferlain";
const MAX = Number(process.env.MAX_REPOS || 5);
const DAYS = Number(process.env.MAX_AGE_DAYS || 30);
const TOKEN = process.env.GITHUB_TOKEN || "";
const since = new Date(Date.now() - DAYS * 86400000).toISOString();
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "repo-bubbles-data"
};