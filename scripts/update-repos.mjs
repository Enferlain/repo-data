import {writeFile} from "node:fs/promises";
const U=process.env.GITHUB_USERNAME||"Enferlain",MAX=+(process.env.MAX_REPOS||5),DAYS=+(process.env.MAX_AGE_DAYS||30),FORKS=process.env.INCLUDE_FORKS!=="false",ARCH=process.env.INCLUDE_ARCHIVED==="true";
const H={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"repo-data-updater"};
if(process.env.GITHUB_TOKEN)H.Authorization="Bearer "+process.env.GITHUB_TOKEN;
const cutoff=new Date(Date.now()-DAYS*864e5).toISOString();
async function api(u){const r=await fetch(u,{headers:H});if(!r.ok)throw new Error(r.status+" "+u+" "+await r.text());return r}
function last(link){const m=(link||"").match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);return m?+m[1]:null}
async function countCommits(full