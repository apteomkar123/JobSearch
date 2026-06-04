// Load resume chunks in parallel for faster download
(async()=>{
  const NUM_CHUNKS=11;
  const cacheBuster = Date.now(); // Prevents browser from loading old cached versions
  try{
    const results=await Promise.all(
      Array.from({length:NUM_CHUNKS},(_,i)=>
        fetch(`${window.RESUME_BASE_URL}resumes_${i}.json?v=${cacheBuster}`).then(async r => {
          if (r.ok) return r.json();
          // Handle non-200 responses descriptively
          let msg = `HTTP ${r.status}`;
          if (r.status === 404) msg = "Files not found (check bucket/folder name)";
          if (r.status === 403) msg = "Access Denied (ensure bucket is set to Public)";
          throw new Error(msg);
        }).catch(err => {
          console.error(`Resume chunk ${i} failed to load: ${err.message}`);
          window.resumeLoadError = err.message;
          return {};
        })
      )
    );
    results.forEach(chunk=>Object.assign(window.RESUMES,chunk));
  } catch(e) {
    console.error('Critical failure in resume loader:', e);
    window.resumeLoadError = e.message;
  }
  window.resumesLoaded = true;
  if(window.render) window.render();
})();