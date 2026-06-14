import {writeFile} from "node:fs/promises";
const U=process.env.GITHUB_USERNAME||"Enferlain",MAX=+(process.env.MAX_REPOS||5),DAYS=+(process.env.MAX_AGE_DAYS||30),FORKS=process.env.INCLUDE_FORKS!=="false",ARCH=process.env.INCLUDE_ARCHIVED==="true";
const H={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"repo-data-updater"};
if(process.env.GITHUB_TOKEN)H.Authorization="Bearer "+process.env.GITHUB_TOKEN;
