// Load resume chunks, JD data chunks, and cover letter chunks in parallel
(async()=>{
  const NUM_CHUNKS = 12;
  const v = Date.now();
  try {
    const [resumeResults, jdResults, clResults] = await Promise.all([
      // Resume PDFs
      Promise.all(Array.from({length:NUM_CHUNKS},(_,i)=>
        fetch(`${window.RESUME_BASE_URL}resumes_${i}.json?v=${v}`)
          .then(r=>{ if(r.ok)return r.json(); throw new Error(`HTTP ${r.status}`+(r.status===404?' (not found)':r.status===403?' (access denied)':'')); })
          .catch(err=>{ console.error(`Resume chunk ${i} failed:`,err.message); window.resumeLoadError=err.message; return {}; })
      )),
      // JD metadata (may not exist yet — silent 404 is fine)
      Promise.all(Array.from({length:NUM_CHUNKS},(_,i)=>
        fetch(`${window.RESUME_BASE_URL}jd_data_${i}.json?v=${v}`)
          .then(r=>r.ok?r.json():{}).catch(()=>({}))
      )),
      // Cover letters (may not exist yet — silent 404 is fine)
      Promise.all(Array.from({length:NUM_CHUNKS},(_,i)=>
        fetch(`${window.RESUME_BASE_URL}cl_data_${i}.json?v=${v}`)
          .then(r=>r.ok?r.json():{}).catch(()=>({}))
      ))
    ]);

    resumeResults.forEach(chunk=>Object.assign(window.RESUMES,chunk));
    jdResults.forEach(chunk=>Object.assign(window.JD_DATA,chunk));
    clResults.forEach(chunk=>Object.assign(window.COVER_LETTERS,chunk));

    // Apply persisted JD metadata as overrides to the static job objects
    (window.ALL_JOBS||[]).forEach(job=>{
      if(!job)return;
      const jd=window.JD_DATA[String(job.id)];
      if(!jd)return;
      if(jd.tags&&jd.tags.length) job.tags=jd.tags;
      if(jd.fit)                  job.fit=jd.fit;
      if(jd.why)                  job.why=jd.why;
      if(jd.resume_angle)         job.resume_angle=jd.resume_angle;
      if(jd.pay)                  job.pay=jd.pay;
    });

  } catch(e) {
    console.error('Critical failure in loader:',e);
    window.resumeLoadError=e.message;
  }
  window.resumesLoaded=true;
  try{ if(window.render)window.render(); }catch(e){ console.error('Render error after load:',e); }
})();
