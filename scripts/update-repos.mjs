import { readFile, writeFile } from 'node:fs/promises';

const USERNAME = process.env.GITHUB_USERNAME || 'Enferlain';
const MAX_REPOS = Number(process.env.MAX_REPOS || 5);
const MAX_AGE_DAYS = Number(process.env.MAX_AGE_DAYS || 30);
const TOKEN = process.env.GITHUB_TOKEN || '';

const cutoffIso = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User