// ── DATA ────────────────────────────────────────────────────────────────────────
let RESUMES = {};
// Load resume chunks in parallel for faster download
(async()=>{
  const NUM_CHUNKS=12;
  try{
    const results=await Promise.all(
      Array.from({length:NUM_CHUNKS},(_,i)=>
        fetch('/resumes_'+i+'.json')
          .then(r=>r.ok?r.json():{})
          .catch(()=>({}))
      )
    );
    results.forEach(chunk=>Object.assign(RESUMES,chunk));
    render();
  }catch(e){console.error('Resume load error:',e);}
})();

// ── STATE ────────────────────────────────────────────────────────────────────────
let statuses={}, flags={}, coverLetters={};
let expanded=null, activeTab='why', sortBy='fit';
let filters={batch:'all',status:'all',flag:'all',cl:'all'};
let saveTimer=null, sbReady=false;