import { writeFile } from 'node:fs/promises';

const USER = process.env.GITHUB_USERNAME || 'Enferlain';
const MAX = Number(process.env.MAX_REPOS || 5);
const DAYS = Number(process.env.MAX_AGE_DAYS || 30);
const TOKEN = process.env.GITHUB_TOKEN || '';
const INCLUDE_FORKS = process.env.INCLUDE_FORKS !== 'false';
const INCLUDE_ARCHIVED = process.env.INCLUDE_ARCHIVED === 'true';

const headers = {
  Accept: 'application/vnd