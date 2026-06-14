import{writeFile}from'node:fs/promises';
const U=process.env.GITHUB_USERNAME||'Enferlain',M=+(process.env.MAX_REPOS||5),D=+(process.env.MAX_AGE_DAYS||30),T=process.env.GITHUB_TOKEN||'';
const H={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'repo-data-updater'};if(T)H.Authorization='Bearer '+T;
const since=new Date(Date.now()-D*864e5).toISOString();
async function get(u){const r=await fetch(u,{headers:H});if(!r.ok)throw new Error(r.status+' '+await r.text());return r}
function pages(link){const m=(link||'').match(/[?&]page=(\