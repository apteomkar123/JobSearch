// ── ADD JOB FEATURE ────────────────────────────────────────────────────────────

window.openAddJob = () => {
  document.getElementById('addJobModal').classList.add('open');
  document.getElementById('jobUrlInput').value = '';
  document.getElementById('jobProgress').classList.remove('active');
  document.getElementById('jobProgress').innerHTML = '';
  document.getElementById('parseBtn').disabled = false;
  document.getElementById('parseBtn').textContent = 'Parse & Add Job';
  setTimeout(() => {
    const target = document.getElementById('jobUrlInput');
    if(target) target.focus();
  }, 100);
};

window.closeAddJob = () => {
  document.getElementById('addJobModal').classList.remove('open');
};

// Close on backdrop click
document.addEventListener('click', e => {
  if(e.target.id === 'addJobModal') closeAddJob();
});

// Enter key to submit
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeAddJob();
  if(e.key === 'Enter' && document.getElementById('addJobModal').classList.contains('open')) parseJobUrl();
});

function step(msg, status='pend') {
  const el = document.getElementById('jobProgress');
  el.classList.add('active');
  const dot = `<span class="step-dot ${status}"></span>`;
  el.innerHTML += dot + msg + '<br>';
  el.scrollTop = el.scrollHeight;
}

function stepDone(msg) {
  const el = document.getElementById('jobProgress');
  // Mark last pending dot as done
  const dots = el.querySelectorAll('.step-dot.pend');
  if(dots.length) dots[dots.length-1].className = 'step-dot done';
  if(msg) step(msg, 'done');
}

function stepFail(msg) {
  const el = document.getElementById('jobProgress');
  const dots = el.querySelectorAll('.step-dot.pend');
  if(dots.length) dots[dots.length-1].className = 'step-dot fail';
  step(msg, 'fail');
}

window.parseJobUrl = async () => {
  const url = document.getElementById('jobUrlInput').value.trim();
  if(!url || !url.startsWith('http')) { toast('Paste a valid job URL first'); return; }

  const btn = document.getElementById('parseBtn');
  btn.disabled = true;
  btn.textContent = 'Working...';
  document.getElementById('jobProgress').innerHTML = '';
  document.getElementById('jobProgress').classList.add('active');

  try {
    // ── STEP 1: Fetch job page ──────────────────────────────────────────────
    step('Fetching job posting...');

    const fetchResp = await fetch('/.netlify/functions/parse-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a job data extraction assistant. Your ONLY job is to extract structured data from a job posting URL and return it as a JSON object. 

Return ONLY a JSON object with these exact fields (no markdown, no explanation, just the JSON):
{
  "title": "Job title",
  "company": "Company name",
  "companySize": "Company size if mentioned, else ''",
  "type": "Remote / Hybrid / On-site + location",
  "pay": "Salary range as string, e.g. '$80K - $100K'",
  "payNum": numeric midpoint of salary (integer), or 85000 if unknown,
  "url": "the original URL",
  "fit": a number 1-100 estimating fit for this candidate profile: Environmental Coordinator 2 years at Georgia-Pacific, owns Title V/SPCC/SWPPP/RCRA/stormwater programs, Power BI, Python, GIS, AI agents, GitHub Copilot, B.S. Environmental Science NC State,
  "source": "direct",
  "tags": ["up to 6 key skill tags from the job"],
  "benefits": "benefits if mentioned, else ''",
  "bonus": "bonus info if mentioned, else ''",
  "why": "2-3 sentences on why this candidate fits this role specifically",
  "resume_angle": "1-2 sentences on which aspects of the candidate's background to lead with for this role",
  "badge": one of: "Top Match" / "Strong Fit" / "New Find" / "High Pay" / "Local Role" / "Stretch",
  "badgeColor": one of: "#22c55e" / "#3b82f6" / "#0891b2" / "#f59e0b" / "#8b5cf6" / "#ef4444"
}

Fetch the URL content first using web search if needed, then extract the data.`,
        messages: [{ role: 'user', content: `Extract job data from this URL: ${url}` }]
      })
    });

    if(!fetchResp.ok) {
      let errMsg = 'HTTP ' + fetchResp.status;
      try {
        const errData = await fetchResp.json();
        if(errData.error) errMsg = typeof errData.error === 'string' ? errData.error : (errData.error.message || JSON.stringify(errData.error));
      } catch(e) {}
      if(fetchResp.status === 401) { errMsg = 'Invalid API key — check ANTHROPIC_API_KEY in Netlify environment variables'; }
      if(fetchResp.status === 429) errMsg = 'Rate limited — wait a moment and try again';
      if(fetchResp.status === 400) errMsg = 'Bad request: ' + errMsg;
      throw new Error(errMsg);
    }
    const fetchData = await fetchResp.json();

    // Extract text content from response
    const rawText = (fetchData.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // Parse JSON from response
    let jobData;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error('No JSON found in response');
      jobData = JSON.parse(jsonMatch[0]);
    } catch(e) {
      throw new Error('Could not parse job data: ' + e.message);
    }

    if(!jobData.title || !jobData.company) throw new Error('Missing required job fields');
    stepDone(`Found: ${jobData.title} at ${jobData.company}`);

    // ── STEP 2: Assign ID and defaults ─────────────────────────────────────
    step('Processing job data...');
    const newId = Math.max(...window.ALL_JOBS.map(j => j.id)) + 1;
    const batch = Math.max(...window.ALL_JOBS.map(j => j.batch || 1)) + 1;

    const newJob = {
      id: newId,
      batch: batch,
      title: jobData.title || 'Unknown Title',
      company: jobData.company || 'Unknown Company',
      companySize: jobData.companySize || '',
      type: jobData.type || 'Unknown',
      pay: jobData.pay || 'Not listed',
      payNum: jobData.payNum || 85000,
      url: jobData.url || url,
      fit: Math.min(99, Math.max(1, parseInt(jobData.fit) || 75)),
      source: 'direct',
      tags: Array.isArray(jobData.tags) ? jobData.tags.slice(0,6) : [],
      benefits: jobData.benefits || '',
      bonus: jobData.bonus || '',
      why: jobData.why || '',
      resume_angle: jobData.resume_angle || '',
      badge: jobData.badge || 'New Find',
      badgeColor: jobData.badgeColor || '#0891b2',
      recruiter: {
        name: null,
        linkedin_search: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((jobData.company||'').split('(')[0].trim())}+recruiter+OR+%22talent+acquisition%22`,
        note: `Newly added job — search LinkedIn for ${(jobData.company||'').split('(')[0].trim()} recruiter to find the right contact.`
      }
    };

    stepDone('Job data processed');

    // ── STEP 3: Build tailored resume via Claude ────────────────────────────
    step('Building tailored resume...');

    const resumeResp = await fetch('/.netlify/functions/parse-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You write resume summaries. The candidate is Omkar Apte. Write the summary in a professional, first-person objective style. Lead EXACTLY with: "Imaginative, inquisitive, driven, creative, and highly competent environmental and data professional." Focus entirely on how the candidate's qualifications solve the specific needs of the employer. Do NOT use "you" or "your" to refer to the candidate. Do NOT use meta-commentary.
Candidate Profile: Env Coordinator at GP (2yrs), Title V/SPCC/SWPPP/RCRA owner, Power BI (600+ users), Python automation, AI agents/Copilot, B.S. Env Science NC State.

Return ONLY a JSON object:
{
  "summary": "2-3 sentence resume summary tailored to this specific role. Human, specific, not braggy.",
  "gp_focus": ["list of 3-4 keywords describing which GP experience to emphasize: e.g. 'compliance', 'data/automation', 'gis', 'ai/tech', 'training', 'water', 'air'"],
  "filename": "Omkar Apte (CompanyName - JobTitle) Resume.pdf"
}`,
        messages: [{
          role: 'user',
          content: `Job: ${newJob.title} at ${newJob.company}\nWhy fit: ${newJob.why}\nAngle: ${newJob.resume_angle}\nTags: ${newJob.tags.join(', ')}`
        }]
      })
    });

    const resumeData = await resumeResp.json();
    const resumeText = (resumeData.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    let resumeMeta = { summary: '', gp_focus: [], filename: `Omkar Apte (${newJob.company.split('(')[0].trim()} - ${newJob.title}) Resume.pdf` };
    try {
      const rm = resumeText.match(/\{[\s\S]*\}/);
      if(rm) resumeMeta = {...resumeMeta, ...JSON.parse(rm[0])};
    } catch(e) {}

    stepDone('Resume plan generated');

    // ── STEP 3b: Build PDF resume in-browser ───────────────────────────────
    step('Building PDF resume...');
    const summary = resumeMeta.summary ||
      `Environmental compliance professional with two years owning ${['EHS','data','GIS','AI'].includes((resumeMeta.gp_focus||[])[0]) ? 'regulatory programs and building data tools' : 'Title V, SPCC, SWPPP, RCRA, and stormwater programs'} at two manufacturing facilities. B.S. Environmental Science, NC State.`;
    const builtResume = await buildAndStoreResume(newJob, summary);
    if (builtResume) {
      stepDone('Resume built: ' + builtResume.name);
    } else {
      step('Resume build failed — will show placeholder', 'fail');
    }

    // ── STEP 4: Add job to ALL_JOBS and dashboard ───────────────────────────
    step('Adding to dashboard...');
    window.ALL_JOBS.push(newJob);

    window.RESUMES[String(newJob.id)] = null;  // null = building

    // Update nav subtitle
    const navSub = document.querySelector('.nav-sub');
    if(navSub) navSub.textContent = `Tech × Environment · ${window.ALL_JOBS.length} opportunities tracked`;

    // Update unapplied count
    updateStats();

    // Re-render with new job
    render();
    stepDone(`Added as ID ${newJob.id}`);

    // ── STEP 5: Save to Supabase ────────────────────────────────────────────
    step('Saving to Supabase...');
    try {
      // Save job metadata to a separate key in Supabase
      const customJobs = JSON.parse(localStorage.getItem('oa_custom_jobs') || '[]');
      customJobs.push(newJob);
      localStorage.setItem('oa_custom_jobs', JSON.stringify(customJobs));
      stepDone('Saved locally');
    } catch(e) {
      stepFail('Local save failed: ' + e.message);
    }

    // ── DONE ────────────────────────────────────────────────────────────────
    step(`✓ Done! "${newJob.title}" added to dashboard. Scroll down to find it — it's in the latest round.`, 'done');
    btn.textContent = 'Add Another';
    btn.disabled = false;
    btn.onclick = () => { openAddJob(); };

    // Scroll to the new card after a moment
    setTimeout(() => {
      closeAddJob();
      const card = document.getElementById(`card-${newJob.id}`);
      if(card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(`✓ Added: ${newJob.title} at ${newJob.company}`);
    }, 1800);

  } catch(err) {
    const msg = err.message || String(err);
    stepFail('Error: ' + msg);
    if(msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      step('→ Network error — check your internet connection', 'fail');
    }
    console.error('Add job error:', err);
    btn.disabled = false;
    btn.textContent = 'Try Again';
  }
};
