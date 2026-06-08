// ── PUBLIC API ───────────────────────────────────────────────────────────────────
window.setStatus=(id,s)=>{window.statuses[id]=s;window.scheduleSave();window.render();window.updateStats();};
window.setFlag=(id,v)=>{window.flags[id]=v;window.scheduleSave();window.render();window.updateStats();};
window.setCL=(id,v)=>{window.coverLetters[id]=v;window.scheduleSave();window.render();};
window.toggleExpand=id=>{
  window.expanded=(window.expanded===id)?null:id;
  window.render();
  if(window.expanded){
    requestAnimationFrame(()=>{
      const el=document.querySelector('.job-card.expanded');
      if(el)el.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  }
};
window.setTab=t=>{window.activeTab=t;window.render();};
window.setFilter=(k,v,btn)=>{
  window.filters[k]=v;
  btn.parentElement.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');window.render();
};
window.testFunction = async () => {
  const prog = document.getElementById('jobProgress');
  prog.classList.add('active');
  prog.innerHTML = '';
  step('Testing Netlify function...');
  try {
    const r = await fetch('/.netlify/functions/parse-job', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:10,messages:[{role:'user',content:'hi'}]})
    });
    const text = await r.text();
    if(r.status === 401) stepFail('Function reached Anthropic but got 401. Check ANTHROPIC_API_KEY in Netlify Site Config > Environment Variables.');
    else if(r.status === 200 || r.status === 400) stepDone('Function is live! Status: ' + r.status);
    else step('Function responded: ' + r.status + ' — ' + text.slice(0,120), r.status < 500 ? 'done' : 'fail');
  } catch(e) {
    stepFail('Cannot reach function: ' + e.message);
    step('Make sure netlify.toml and netlify/functions/parse-job.js are committed to your repo root and redeployed.', 'fail');
  }
};


window.switchAddTab = (tab) => {
  document.getElementById('panel-single').style.display = tab==='single' ? '' : 'none';
  document.getElementById('panel-bulk').style.display   = tab==='bulk'   ? '' : 'none';
  document.getElementById('tab-single').className = tab==='single' ? 'btn-primary'   : 'btn-secondary';
  document.getElementById('tab-single').style.cssText = 'flex:1;font-size:11px;padding:7px';
  document.getElementById('tab-bulk').className   = tab==='bulk'   ? 'btn-primary'   : 'btn-secondary';
  document.getElementById('tab-bulk').style.cssText   = 'flex:1;font-size:11px;padding:7px';
};

window.parseBulkUrls = async () => {
  const raw  = document.getElementById('bulkUrlInput').value.trim();
  const urls = raw.split('\n').map(u=>u.trim()).filter(u=>u.startsWith('http'));
  if(!urls.length){ toast('Paste at least one URL (one per line)'); return; }

  const btn  = document.getElementById('bulkBtn');
  btn.disabled = true;
  const prog = document.getElementById('bulkProgress');
  prog.classList.add('active');
  prog.innerHTML = '';
  let added=0, failed=0;

  for(let i=0; i<urls.length; i++){
    const url = urls[i];
    prog.innerHTML += `<span class="step-dot pend"></span> [${i+1}/${urls.length}] ${url.slice(0,55)}...<br>`;
    prog.scrollTop = prog.scrollHeight;
    btn.textContent = `Parsing ${i+1}/${urls.length}...`;
    try{
      const resp = await fetch('/.netlify/functions/parse-job',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:2000,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          system:`Extract job data from a URL. Return ONLY a JSON object: {title,company,companySize,type,pay,payNum,url,fit,source,tags,benefits,bonus,why,resume_angle,badge,badgeColor}. No markdown. Estimate 'fit' (1-100) for Omkar Apte: Env Coordinator 2 years at Georgia-Pacific, owns Title V/SPCC/SWPPP/RCRA programs, Power BI, Python automation, AI agents, B.S. Env Science NC State.`,
          messages:[{role:'user',content:`Extract job data from: ${url}`}]
        })
      });
      const data = await resp.json();
      const txt  = (data.content || []).filter(b=>b.type==='text').map(b=>b.text).join('\n');
      const m    = txt.match(/\{[\s\S]*\}/);
      if(!m) throw new Error('No JSON');
      const job  = JSON.parse(m[0]);
      if(!job.title||!job.company) throw new Error('Missing fields');
      const _jobs=window.ALL_JOBS.filter(Boolean);
      const newId = Math.max(..._jobs.map(j=>j.id))+1;
      const newJob = {id:newId,batch:Math.max(..._jobs.map(j=>j.batch||1))+1,
        title:job.title,company:job.company,companySize:job.companySize||'',
        type:job.type||'Unknown',pay:job.pay||'Not listed',payNum:job.payNum||85000,
        url:url,fit:Math.min(99,Math.max(1,parseInt(job.fit)||75)),
        source:'direct',tags:Array.isArray(job.tags)?job.tags.slice(0,6):[],
        benefits:job.benefits||'',bonus:job.bonus||'',why:job.why||'',
        resume_angle:job.resume_angle||'',badge:job.badge||'New Find',
        badgeColor:job.badgeColor||'#0891b2',
        recruiter:{
          name: null,
          linkedin_search: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((job.company||'').split('(')[0].trim())}+recruiter+OR+%22talent+acquisition%22`,
          note: `Newly added job — search LinkedIn for ${(job.company||'').split('(')[0].trim()} recruiter.`
        },
        status:'Not Applied'};
      window.ALL_JOBS.push(newJob);
      window.RESUMES[String(newId)] = null;
      const dots = prog.querySelectorAll('.step-dot.pend');
      if(dots.length) dots[dots.length-1].className='step-dot done';
      prog.innerHTML += `&nbsp;&nbsp;→ Added: ${job.title} @ ${job.company}<br>`;
      added++;

      // Persist new job locally
      try {
        const customJobs = JSON.parse(localStorage.getItem('oa_custom_jobs') || '[]');
        customJobs.push(newJob);
        localStorage.setItem('oa_custom_jobs', JSON.stringify(customJobs));
      } catch(e) {}

      try{
        const rr = await fetch('/.netlify/functions/parse-job',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:400,
            messages:[{role:'user',content:`Write a professional resume summary. Lead with: "Imaginative, inquisitive, driven, creative, and highly competent environmental and data professional." Tailor it for: ${newJob.title} at ${newJob.company}. Focus on how candidate (Omkar Apte) solves needs. 1st person objective style. Return ONLY the 2-3 sentence summary.`}]})
        });
        const rd = await rr.json();
        const summary = (rd.content || []).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
        if(summary) await buildAndStoreResume(newJob, summary);
      }catch(e){}
    }catch(e){
      const dots = prog.querySelectorAll('.step-dot.pend');
      if(dots.length) dots[dots.length-1].className='step-dot fail';
      prog.innerHTML += `&nbsp;&nbsp;→ Failed: ${e.message}<br>`;
      failed++;
    }
    if(i<urls.length-1) await new Promise(r=>setTimeout(r,1200));
  }

  window.updateStats(); window.render(); window.scheduleSave();
  const ns=document.querySelector('.nav-sub');
  if(ns) ns.textContent=`Tech × Environment · ${window.ALL_JOBS.length} opportunities tracked`;
  prog.innerHTML += `<br><b>${added} added${failed?`, ${failed} failed`:''}.</b>`;
  btn.disabled=false; btn.textContent='Parse More';
  toast(`Added ${added} jobs${failed?`, ${failed} failed`:''}`);
};

window.toggleRecent=(btn)=>{
  const active = btn.classList.toggle('active');
  if(active){
    // Show 20 most recently added (highest IDs)
    const jobs = (window.ALL_JOBS || []).filter(Boolean);
    const sorted=[...jobs].sort((a,b)=>b.id-a.id).slice(0,20);
    const cards=document.getElementById('cards'); if(!cards)return;
    const s=j=>SRC[j.source]||SRC.direct;
    cards.innerHTML=sorted.map(job=>{
      const st=window.statuses[job.id]||'Not Applied';
      const fl=!!window.flags[job.id];
      const cl=window.coverLetters[job.id]||'none';
      const ex=window.expanded===job.id;
      const hr=!!(window.RESUMES[String(job.id)]&&window.RESUMES[String(job.id)]!==null);
      const src=s(job);
      const ats=calcATSScore(job);
      const atsPill=ats!==null?pill(`ATS ${ats}%`,ats>=70?'#10d98c':ats>=50?'#ffb340':'#ff5b5b'):pill('ATS N/A','#4a5a78');
      const bodyContent=window.activeTab==='why'?(job.why||''):window.activeTab==='resume'?(job.resume_angle||''):
        `<span class="body-section-label">Benefits</span>${job.benefits||''}<span class="body-section-label" style="margin-top:10px">Bonus</span><span style="color:var(--green)">${job.bonus||''}</span>`;
      return `<div class="job-card${ex?' expanded':''}" id="card-${job.id}">
        <div class="card-header" onclick="toggleExpand(${job.id})">
          <div class="card-left">
            <div class="card-pills">
              ${pill(job.badge,job.badgeColor)}
              ${pill(src.label,src.color)}
              ${pill(st,SC[st])}
              ${fl?pill('⭐ Flagged','#ffb340'):''}
              ${atsPill}
            </div>
            <div class="card-title">${job.title}</div>
            <div class="card-company">${job.company} <span style="color:var(--text3)">· ${job.companySize||''}</span></div>
            <div class="card-meta">${job.type} · <span class="card-pay">${job.pay}</span></div>
          </div>
          ${fitRing(job.fit)}
        </div>
        <div class="card-tags">${(job.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')}</div>
        <div class="card-body${ex?' open':''}">
          <div class="card-body-inner">
            <p class="body-text">${bodyContent}</p>
            <div class="action-row">
              <a href="${job.url}" target="_blank" class="btn btn-apply">↗ Apply</a>
              <button onclick="openEmail(${job.id})" class="btn btn-email">✉ Draft Email</button>
              <button onclick="window.openJDModal(${job.id})" class="btn" style="background:var(--bg2);border:1px solid var(--border2);color:var(--text2);font-size:10px;padding:5px 9px">📋 Paste JD</button>
              <button onclick="setFlag(${job.id},${!fl})" class="btn btn-flag${fl?' active':''}">${fl?'⭐ Flagged':'☆ Flag'}</button>
            </div>
            <div class="status-row">
              <span style="font-family:var(--font-mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em">Status</span>
              ${STATUSES.map(ss=>`<button class="status-chip${st===ss?' active':''}" style="--chip-color:${SC[ss]}" onclick="setStatus(${job.id},'${ss}')">${ss}</button>`).join('')}
            </div>
            ${hr
              ? `<button onclick="window.downloadResume(${job.id})" class="btn btn-dl">⬇ Download Resume</button>`
              : !window.resumesLoaded
                ? `<span style="font-family:var(--font-mono);font-size:10px;color:var(--amber)">⟳ Resumes loading...</span>`
                : window.resumeLoadError 
                  ? `<span style="font-family:var(--font-mono);font-size:10px;color:var(--red)">⚠ ${window.resumeLoadError}</span>` 
                  : `<span style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">No resume for this role yet</span>`}
          </div>
        </div>
      </div>`;
    }).join('');
    // Show count label
    const existing = document.getElementById('recent-label');
    if(!existing){
      const lbl=document.createElement('div');
      lbl.id='recent-label';
      lbl.style.cssText='font-family:var(--font-mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;margin-top:-8px;';
      lbl.textContent='Showing 20 most recently added jobs';
      document.getElementById('cards').before(lbl);
    }
  } else {
    const lbl=document.getElementById('recent-label');
    if(lbl) lbl.remove();
    window.render();
  }
};

window.setSort=(k,btn)=>{
  window.sortBy=k;
  btn.parentElement.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');window.render();
};
window.downloadResume=id=>{
  const r=window.RESUMES[String(id)];
  if(!r){toast('Resume loading — try again in a moment');return;}

  const job=(window.ALL_JOBS||[]).find(j=>j.id===parseInt(id));

  // Rebuild if: not built in this session (pre-built chunk PDF), or no b64 yet (lazy build)
  // freshBuild:true is set by buildAndStoreResume — absent on all pre-loaded chunk resumes
  if(!r.freshBuild){
    if(!job){toast('Job data not found');return;}
    const tl=(job.title||'').toLowerCase();
    const isDataJob=['data','analytics','bi','python','sql','automation'].some(k=>tl.includes(k));
    const summary=r.summary||(isDataJob
      ?'Imaginative, inquisitive, driven, creative, and highly competent environmental and data professional with two years owning compliance programs and building data tools — Power BI dashboard used by 600+ employees, Python automation eliminating 80% of manual reporting, and AI agents for regulatory research — at two manufacturing facilities under Koch Industries. B.S. Environmental Science, NC State, minor in Economics.'
      :'Imaginative, inquisitive, driven, creative, and highly competent environmental compliance professional with two years owning Title V, SPCC, SWPPP, RCRA, and stormwater programs at two manufacturing facilities under Koch Industries — no major violations. Builds data tools: Power BI compliance dashboard (600+ users), Python automation, AI agents. B.S. Environmental Science, NC State, minor in Economics.');
    toast('Building resume — one moment...');
    buildAndStoreResume(job,summary).then(built=>{
      if(built){ window.render(); window.downloadResume(id); }
      else toast('Resume build failed — try again');
    });
    return;
  }

  try{
    const bytes=atob(r.b64);
    const arr=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
    const blob=new Blob([arr],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=r.name||'Omkar_Resume.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Downloading: '+r.name);
  }catch(e){
    console.error('Download error:',e);
    toast('Download failed — try again');
  }
};
window.openRecruiterEmail=id=>{
  const j=ALL_JOBS.find(x=>x.id===id);if(!j||!j.recruiter)return;
  const name=j.recruiter.name||'Hiring Team';
  const sub=encodeURIComponent('Interested in the '+j.title+' Role at '+j.company);
  const body=encodeURIComponent('Hi '+name.split(' ')[0]+',\n\nI came across the '+j.title+' opening at '+j.company+' and wanted to reach out directly. My background is a strong match — two years as Environmental Coordinator at Georgia-Pacific (Koch Industries) owning Title V, SPCC, SWPPP, RCRA, and stormwater programs with zero major violations, plus Power BI, Python, and AI agent deployment.\n\nI would love to connect and learn more. I have attached my tailored resume.\n\nBest regards,\nOmkar Apte\nomkarapte2010@gmail.com | (919) 717-7472\nlinkedin.com/in/omkarapte');
  window.open('https://mail.google.com/mail/?view=cm&fs=1&su='+sub+'&body='+body,'_blank');
};
window.openEmail=id=>{
  const j=ALL_JOBS.find(x=>x.id===id);if(!j)return;
  const s=encodeURIComponent('Application — '+j.title+' at '+j.company);
  const b=encodeURIComponent('Hi,\n\nI am writing to express my interest in the '+j.title+' position at '+j.company+'.\n\nPlease find my tailored resume attached.\n\nBest regards,\nOmkar Apte\nomkarapte2010@gmail.com | (919) 717-7472');
  window.open('https://mail.google.com/mail/?view=cm&fs=1&su='+s+'&body='+b,'_blank');
};

// ── HELPERS ──────────────────────────────────────────────────────────────────────
function pill(t,c){return `<span class="pill" style="background:${c}18;color:${c};border-color:${c}35">${t}</span>`;}

// ── ATS SCORE CALCULATOR ─────────────────────────────────────────────────────────
// Checks job tag words against every meaningful word in the candidate's full resume.
// A tag "matches" if any of its words appears in CANDIDATE_WORDS (exact whole-word).
const CANDIDATE_WORDS = new Set([
  // ── GP role / regulatory programs ─────────────────────────────────────────
  'environmental','coordinator','georgia','pacific','koch','industries',
  'regulatory','compliance','programs','facilities','plywood','lumber',
  'title','spcc','swppp','rcra','hazardous','waste','stormwater','violations',
  'npdes','mact','bmact','pcwp','permit','permits','permitting','deviations',
  'certifications','certification','certified','correspondence','ncdeq',
  'air','emissions','opacity','evaluator','evaluations','combustion','sources',
  'method','visible','biannual','stack','test','scheduling',
  'water','quality','sampling','ncma','documentation','bmp','inspections',
  'inspection','corrective','actions','closure','monthly','weekly',
  'audit','auditing','audits','ehs','hse','osha','safety','health',
  'industrial','manufacturing','facilities','facility','plant','site','operations',
  'monitoring','remediation','wastewater','groundwater','wetlands',
  'hazmat','spill','prevention','containment','discharge','effluent',
  'violations','deviation','exceedance','threshold','limit','standard','standards',
  'regulation','regulations','regulatory','federal','state','local','agency',
  // ── Data / BI / Automation ────────────────────────────────────────────────
  'power','python','sql','excel','analytics','reporting','automation','dashboard',
  'dashboards','kpi','kpis','visualization','analysis','analyst','data','report',
  'reports','intelligence','tableau','spotfire','etl','database','databases',
  'automate','automated','workflow','workflows','query','queries','metrics',
  'tracking','tracker','performance','output','input','processing','pipeline',
  'bi','microsoft','office','sharepoint','teams','powerpoint','word','access',
  'lms','erp','cloud','azure','aws','systems','platform','platforms',
  // ── AI / Dev / Tech ───────────────────────────────────────────────────────
  'ai','agents','agent','copilot','github','programming','software','coding',
  'javascript','typescript','html','css','react','vite','expo','netlify',
  'postgresql','supabase','realtime','triggers','authentication','sso','oauth',
  'cicd','api','rest','json','schema','rls','typescript','digital','technology',
  'technologies','application','applications','tool','tools','development',
  'developer','deploy','deployed','deployment','build','built','production',
  'scripting','scripts','code','codebase','testing','validation','integration',
  'c','csharp','parsing','generator','characterization',
  // ── GIS / Spatial ─────────────────────────────────────────────────────────
  'arcgis','qgis','gis','geospatial','spatial','mapping','esri','maps','map',
  'watershed','delineation','catchment','basin','terrain','topology',
  'satellite','imagery','raster','vector','shapefile','geodatabase',
  // ── Communication / Leadership / Management ───────────────────────────────
  'training','communication','leadership','management','coordination','consulting',
  'consultant','project','planning','research','documentation','teamwork',
  'implementation','briefings','submissions','presentations','stakeholder',
  'crossfunctional','interdepartmental','reporting','writing','technical',
  'orientation','supervisors','operators','contractors','managers','directors',
  'credibility','trust','authority','expertise','tenure','youngest','team',
  // ── Sustainability / ESG / Climate ────────────────────────────────────────
  'sustainability','climate','carbon','ghg','esg','emissions','greenhouse',
  'energy','renewable','solar','wind','efficiency','footprint','lifecycle',
  'lca','inventory','accounting','reporting','offset','sequestration',
  'biodiversity','conservation','stewardship','resilience','net','zero',
  'scope','reduction','targets','goals','science','based','sbti',
  // ── Cost / Business / Strategy ────────────────────────────────────────────
  'cost','reduction','savings','budget','vendor','management','procurement',
  'strategy','strategic','policy','policies','process','processes','risk',
  'assessment','assessment','mitigation','control','controls','program',
  'startup','founder','revenue','streams','partnerships','contracts','sales',
  // ── Education / Academic ──────────────────────────────────────────────────
  'science','scientist','engineer','engineering','specialist','manager','analyst',
  'economics','soil','natural','resource','resources','organic','chemistry',
  'circuits','logic','electrical','capstone','planning','land','use',
  'ncsu','university','degree','bachelor','minor','coursework','graduate',
  // ── Short exact-match only ────────────────────────────────────────────────
  'r','bi','ai','gis','vba','sap','crm','erm','iso',
]);
const ATS_STOP = new Set(['and','for','the','with','in','of','to','a','an','or','on','at','by','as','is','be','are','was','its','it','that','this','their','has','have','had','not','but','from','into','also','all','both','each','more','such','than','then','when','where','which','who','how','will','can','may','other','new','per']);

function calcATSScore(job){
  try{
    // If a resume was freshBuilt for this job, return its stored coverage score.
    // The built resume embeds all job tags in Areas of Expertise + boosted skill
    // lines, so the stored score reflects actual keyword coverage in the PDF.
    const r=window.RESUMES&&window.RESUMES[String(job.id)];
    if(r&&r.freshBuild&&r.atsScore!=null) return r.atsScore;

    const tags=(job.tags||[]).map(t=>t.toLowerCase().trim());
    if(!tags.length) return null;
    let matches=0;
    for(const tag of tags){
      const words=tag.split(/[\s\-\/,&+()]+/).filter(w=>w.length>=1&&!ATS_STOP.has(w));
      if(words.some(w=>CANDIDATE_WORDS.has(w))) matches++;
    }
    return Math.min(99,Math.round((matches/tags.length)*100));
  }catch(e){ return null; }
}
window.calcATSScore = calcATSScore;

let toastTimer;
function toast(m){
  const el=document.getElementById('toast');
  el.textContent=m; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),3000);
}

// ── FIT RING SVG ─────────────────────────────────────────────────────────────────
function fitRing(fit){
  const r=18,circ=2*Math.PI*r;
  const offset=circ*(1-fit/100);
  const col=fit>=90?'#10d98c':fit>=80?'#4d9fff':'#ffb340';
  return `<div class="fit-badge">
    <div class="fit-ring">
      <svg viewBox="0 0 44 44" width="44" height="44">
        <circle class="track" cx="22" cy="22" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="0"/>
        <circle cx="22" cy="22" r="${r}" stroke="${col}" stroke-width="3" fill="none"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          stroke-linecap="round" style="transition:stroke-dashoffset .6s ease"/>
      </svg>
      <div class="fit-num" style="color:${col}">${fit}</div>
    </div>
    <div class="fit-lbl">fit%</div>
  </div>`;
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────────
const STATUSES=['Not Applied','Applied','Interview','Offer','Rejected'];
const SC={'Not Applied':'#4a5a78','Applied':'#4d9fff','Interview':'#a78bfa','Offer':'#10d98c','Rejected':'#ff5b5b'};
const SRC={indeed:{label:'Indeed',color:'#4d9fff'},linkedin:{label:'LinkedIn',color:'#4d9fff'},direct:{label:'Direct',color:'#a78bfa'}};

// ── UPDATE STATS ─────────────────────────────────────────────────────────────────
window.updateStats = function(){
  const app=Object.values(window.statuses).filter(s=>s!=='Not Applied').length;
  const itr=Object.values(window.statuses).filter(s=>['Interview','Offer'].includes(s)).length;
  const fl=Object.values(window.flags).filter(Boolean).length;
  const allJobs = (window.ALL_JOBS || []).filter(Boolean);
  const animNum=(el,val)=>{
    const start=parseInt(el.textContent)||0, end=val, dur=600;
    const t0=performance.now();
    const step=ts=>{
      const p=Math.min((ts-t0)/dur,1);
      el.textContent=Math.round(start+(end-start)*p);
      if(p<1)requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  animNum(document.getElementById('s-total'),allJobs.length);
  animNum(document.getElementById('s-applied'),app);
  animNum(document.getElementById('s-interviews'),itr);
  animNum(document.getElementById('s-flagged'),fl);
  const unapplied=allJobs.filter(j=>(window.statuses[j.id]||'Not Applied')==='Not Applied').length;
  animNum(document.getElementById('s-unapplied'),unapplied);
}

// ── RENDER ────────────────────────────────────────────────────────────────────────
window.render = function(){
  if(!Array.isArray(window.ALL_JOBS)) window.ALL_JOBS = [];

  // Round filter buttons (build once)
  const rfb=document.getElementById('round-filter');
  const allJobs = window.ALL_JOBS.filter(Boolean);
  if(rfb && rfb.querySelectorAll('.fbtn').length <= 1 && allJobs.length > 0){
    [...new Set(allJobs.map(j=>j.batch))].sort((a,b)=>a-b).forEach(b=>{
      const btn=document.createElement('button');
      btn.className='fbtn'; btn.textContent='R'+b;
      btn.onclick=function(){setFilter('batch',String(b),this);};
      rfb.appendChild(btn);
    });
  }

  // Tabs
  const tb=document.getElementById('tab-bar');
  if(tb)tb.innerHTML=[['why','Why You Fit'],['resume','Resume Angle'],['benefits','Benefits']]
    .map(([k,l])=>`<button class="tab-btn${window.activeTab===k?' active':''}" onclick="setTab('${k}')">${l}</button>`).join('');

  // Filter + sort
  let vis=allJobs.filter(j=>{
    if(!window.filters) return false;
    if(window.filters.batch!=='all'&&j.batch!==parseInt(window.filters.batch))return false;
    if(window.filters.status!=='all'&&(window.statuses[j.id]||'Not Applied')!==window.filters.status)return false;
    if(window.filters.flag==='flagged'&&!window.flags[j.id])return false;
    if(window.filters.cl==='needed'&&window.coverLetters[j.id]!=='needed')return false;
    if(window.filters.cl==='done'&&window.coverLetters[j.id]!=='done')return false;
    return true;
  });
  if(window.sortBy==='fit')vis.sort((a,b)=>b.fit-a.fit);
  else vis.sort((a,b)=>b.id-a.id);

  const cards=document.getElementById('cards'); if(!cards)return;
  const s=j=>SRC[j.source]||SRC.direct;

  cards.innerHTML=vis.map(job=>{
    const st=window.statuses[job.id]||'Not Applied';
    const fl=!!window.flags[job.id];
    const cl=window.coverLetters[job.id]||'none';
    const ex=window.expanded===job.id;
    const hr=!!window.RESUMES[String(job.id)];
    const src=s(job);
    const ats=calcATSScore(job);
    const atsPill=ats!==null?pill(`ATS ${ats}%`,ats>=70?'#10d98c':ats>=50?'#ffb340':'#ff5b5b'):pill('ATS N/A','#4a5a78');
    const bodyContent=window.activeTab==='why'?(job.why||''):window.activeTab==='resume'?(job.resume_angle||''):
      `<span class="body-section-label">Benefits</span>${job.benefits||''}<span class="body-section-label" style="margin-top:10px">Bonus</span><span style="color:var(--green)">${job.bonus||''}</span>`;

    return `<div class="job-card${ex?' expanded':''}" id="card-${job.id}">
      <div class="card-header" onclick="toggleExpand(${job.id})">
        <div class="card-left">
          <div class="card-pills">
            ${pill(job.badge,job.badgeColor)}
            ${pill(src.label,src.color)}
            ${pill(st,SC[st])}
            ${fl?pill('⭐ Flagged','#ffb340'):''}
            ${cl==='needed'?pill('Needs CL','#a78bfa'):cl==='done'?pill('CL Done','#10d98c'):''}
            ${atsPill}
          </div>
          <div class="card-title">${job.title}</div>
          <div class="card-company">${job.company} <span style="color:var(--text3)">· ${job.companySize||''}</span></div>
          <div class="card-meta">${job.type} · <span class="card-pay">${job.pay}</span></div>
        </div>
        ${fitRing(job.fit)}
      </div>
      <div class="card-tags">
        ${(job.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card-body${ex?' open':''}">
        <div class="card-body-inner">
          <p class="body-text">${bodyContent}</p>
          <div class="action-row">
            <a href="${job.url}" target="_blank" class="btn btn-apply">↗ Apply</a>
            <button onclick="openEmail(${job.id})" class="btn btn-email">✉ Draft Email</button>
            <button onclick="window.openJDModal(${job.id})" class="btn" style="background:var(--bg2);border:1px solid var(--border2);color:var(--text2);font-size:10px;padding:5px 9px">📋 Paste JD</button>
            <button onclick="setFlag(${job.id},${!fl})" class="btn btn-flag${fl?' active':''}">${fl?'⭐ Flagged':'☆ Flag'}</button>
            <button onclick="setCL(${job.id},'${cl==='needed'?'none':'needed'}')" class="btn btn-cl${cl==='needed'?' active':''}">${cl==='needed'?'✓ Needs CL':'+ Needs CL'}</button>
            <button onclick="setCL(${job.id},'${cl==='done'?'none':'done'}')" class="btn btn-cl btn-cl-done${cl==='done'?' active':''}">${cl==='done'?'✓ CL Done':'+ CL Done'}</button>
          </div>
          <div class="status-row">
            <span style="font-family:var(--font-mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em">Status</span>
            ${STATUSES.map(ss=>`<button class="status-chip${st===ss?' active':''}" style="--chip-color:${SC[ss]}" onclick="setStatus(${job.id},'${ss}')">${ss}</button>`).join('')}
          </div>
          ${hr
            ?`<button onclick="window.downloadResume(${job.id})" class="btn btn-dl">⬇ Download Resume</button>`
            :!window.resumesLoaded
              ?`<span style="font-family:var(--font-mono);font-size:10px;color:var(--amber)">⟳ Resumes loading...</span>`
              :window.resumeLoadError
                ?`<span style="font-family:var(--font-mono);font-size:10px;color:var(--red)">⚠ ${window.resumeLoadError}</span>`
                :`<span style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">No resume for this role yet</span>`
          }
          ${job.recruiter ? `
          <div style="margin-top:14px;padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border)">
            <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px">👤 Recruiter / Contact</div>
            ${job.recruiter.name ? `<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">${job.recruiter.name}</div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-bottom:8px">${job.recruiter.title||''}</div>` : ''}
            ${job.recruiter.note ? `<div style="font-size:11px;color:#8899b8;line-height:1.6;margin-bottom:8px">${job.recruiter.note}</div>` : ''}
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${job.recruiter.linkedin ? `<a href="${job.recruiter.linkedin}" target="_blank" class="btn" style="background:rgba(10,102,194,.15);color:#4d9fff;border-color:rgba(10,102,194,.3);font-size:10px">LinkedIn ↗</a>` : ''}
              ${job.recruiter.linkedin_search ? `<a href="${job.recruiter.linkedin_search}" target="_blank" class="btn" style="background:var(--bg3);color:var(--text2);border-color:var(--border2);font-size:10px">🔍 Find Recruiter on LinkedIn</a>` : ''}
              ${job.recruiter.linkedin && job.recruiter.name ? `<button onclick="openRecruiterEmail(${job.id})" class="btn btn-email" style="font-size:10px">✉ Draft Outreach</button>` : ''}
            </div>
          </div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}
