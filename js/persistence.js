// ── PERSISTENCE ──────────────────────────────────────────────────────────────────
function setSS(s,t){
  const d=document.getElementById('sync-dot'),tx=document.getElementById('sync-txt');
  if(d)d.className='sync-dot '+s; if(tx)tx.textContent=t;
}
async function sbLoad(){
  try{
    const r=await fetch(SB_URL+'/rest/v1/job_statuses?id=eq.'+ROW_ID+'&select=*',{headers:SB_READ});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const rows=await r.json();
    if(rows.length>0){
      const row=rows[0];
      try{window.statuses=JSON.parse(row.statuses||'{}');}catch(e){}
      try{window.flags=JSON.parse(row.flags||'{}');}catch(e){}
      try{window.coverLetters=JSON.parse(row.cover_letters||'{}');}catch(e){}
    }
    window.sbReady=true; setSS('ok','Synced'); window.render(); window.updateStats();
  }catch(e){
    lsLoad(); setSS('err','Offline'); window.render(); window.updateStats();
  }
}
async function sbSave(){
  lsSave();
  if(!window.sbReady)return;
  try{
    setSS('pend','Saving');
    const res=await fetch(SB_URL+'/rest/v1/job_statuses',{
      method:'POST',headers:SB_WRITE,
      body:JSON.stringify({id:ROW_ID,statuses:JSON.stringify(window.statuses),flags:JSON.stringify(window.flags),cover_letters:JSON.stringify(window.coverLetters)})
    });
    if(!res.ok)throw new Error(await res.text());
    setSS('ok','Saved');
  }catch(e){ setSS('err','Save err'); }
}
function lsSave(){
  localStorage.setItem('oa_s',JSON.stringify(window.statuses));
  localStorage.setItem('oa_f',JSON.stringify(window.flags));
  localStorage.setItem('oa_c',JSON.stringify(window.coverLetters));
}
function lsLoad(){
  try{window.statuses=JSON.parse(localStorage.getItem('oa_s')||'{}');}catch(e){}
  try{window.flags=JSON.parse(localStorage.getItem('oa_f')||'{}');}catch(e){}
  try{window.coverLetters=JSON.parse(localStorage.getItem('oa_c')||'{}');}catch(e){}
}
function scheduleSave(){clearTimeout(window.saveTimer);window.saveTimer=setTimeout(sbSave,600);}