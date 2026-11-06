// Bounded synthetic load against an isolated loopback Worker only. Never targets a live deployment.
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8797';
const label=process.argv[3]||'local';
const url=new URL(base);
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||url.pathname!=='/'||url.search||url.hash)throw Error('Load checks only accept a loopback origin');
if(!/^[a-z0-9-]{1,40}$/.test(label))throw Error('Use a short report label');
const origin=url.origin;let requests=0;
async function request(path,{cookie='',method='GET',body}={}){
 if(++requests>240)throw Error('Synthetic request budget exceeded');
 const start=performance.now();
 try{
  const r=await fetch(origin+path,{method,redirect:'error',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const text=await r.text();return {ms:performance.now()-start,status:r.status,bytes:Buffer.byteLength(text),text,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
 }catch(error){return {ms:performance.now()-start,status:0,bytes:0,error:String(error)}}
}
const bootstrap=await request('/api/bootstrap');
if(bootstrap.status!==200)throw Error('Local Worker is not ready: '+bootstrap.status);
const admin=await request('/api/auth/admin/login',{method:'POST',body:{username:'qaadmin',password:'qa-admin-password'}});
if(admin.status!==200)throw Error('Isolated admin fixture did not sign in: '+admin.status);
const tester=await request('/api/tester-session',{method:'POST',body:{name:'QA Synthetic Load'}});
if(tester.status!==200)throw Error('Isolated tester fixture did not sign in: '+tester.status);
async function measure(name,path,total,concurrency,cookie=''){
 const results=[];let issued=0;const start=performance.now();
 await Promise.all(Array.from({length:concurrency},async()=>{while(issued++<total)results.push(await request(path,{cookie}));}));
 const duration=performance.now()-start;const sorted=results.map(r=>r.ms).sort((a,b)=>a-b);const quantile=p=>Math.round(sorted[Math.max(0,Math.ceil(p*sorted.length)-1)]*10)/10;
 const errors=results.filter(r=>r.status!==200);
 return {name,path,total,concurrency,p50Ms:quantile(.5),p95Ms:quantile(.95),maxMs:quantile(1),requestsPerSecond:Math.round(total/duration*10000)/10,averageBytes:Math.round(results.reduce((sum,r)=>sum+r.bytes,0)/results.length),errors:errors.length,statuses:results.reduce((out,r)=>(out[r.status]=(out[r.status]||0)+1,out),{}),...(errors.length?{errorSamples:errors.slice(0,3).map(r=>({status:r.status,message:r.error||r.text.slice(0,300)}))}:{})};
}
const workloads=[];
const samples=label==='baseline'?{normal:40,burst:80}:{normal:30,burst:60};
for(const args of [['anonymous bootstrap','/api/bootstrap',samples.normal,10],['authenticated bootstrap burst','/api/bootstrap',samples.burst,20,tester.cookie],['admin overview','/api/admin/overview',samples.normal,10,admin.cookie],['customer order history','/api/orders',samples.normal,10,tester.cookie],['app shell','/',20,5]]){
 const result=await measure(...args);workloads.push(result);console.log(JSON.stringify(result));
}
const report={label,environment:'Isolated local Cloudflare Worker emulator and SQLite; synthetic test users only',limits:'At most 20 concurrent requests and 240 total requests; no live traffic, provider calls or payments',requestCount:requests,workloads,errors:workloads.reduce((sum,w)=>sum+w.errors,0),note:'Local results validate request handling and failures under bounded concurrency. They do not measure the production hosting load balancer, regional latency or maximum live capacity.'};
mkdirSync('docs/testing/load',{recursive:true});writeFileSync(`docs/testing/load/${label}.json`,JSON.stringify(report,null,2)+'\n');
console.log('Synthetic load complete: '+requests+' requests, '+report.errors+' errors');if(report.errors)process.exitCode=1;
