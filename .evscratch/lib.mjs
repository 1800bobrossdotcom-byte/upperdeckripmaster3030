import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync } from 'node:fs';
const src=readFileSync('js/chain-config.js','utf8'); const w={}; new Function('window',src)(w);
export const RPCS=w.RIPMASTER_CHAIN.rpcs;
export const clients=RPCS.map(u=>({u,c:createPublicClient({chain:mainnet,transport:http(u,{timeout:30000,retryCount:0})})}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function anyRpc(fn,tries=4){ let last;
  for(let t=0;t<tries;t++){ for(const {c} of clients){ try{ return await fn(c);}catch(e){ last=e; } } await sleep(400*(t+1)); }
  throw last; }
export async function logsRange(params, from, to, step=500n){
  const out=[];
  for(let f=from; f<=to; f+=step){ const t=(f+step-1n)>to?to:(f+step-1n);
    out.push(...await anyRpc(c=>c.getLogs({...params, fromBlock:f, toBlock:t}))); }
  return out; }
