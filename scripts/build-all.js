#!/usr/bin/env node
// build-all.js — Pre-generate every resume + cover letter, upload to Supabase.
// No runtime Anthropic API dependency — the web app reads pre-built content.
//
// Usage (from this directory):
//   npm install
//   node build-all.js
//
// Optional: set ANTHROPIC_API_KEY to also fetch JDs for jobs without existing data.
// Skip flags: SKIP_RESUMES=1  SKIP_CLS=1  SKIP_JDDATA=1  SKIP_UPLOAD=1

'use strict';

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SB_URL     = 'https://zbzuoovbqhlywzbamlhk.supabase.co';
const SB_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpienVvb3ZicWhseXd6YmFtbGhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Mjc5OTYsImV4cCI6MjA5NDEwMzk5Nn0.qhhBJYQDf3fsx44-ZI7H8Gq060KcrM88y-jSpIVoX4Q';
const ANTH_KEY   = process.env.ANTHROPIC_API_KEY || null;
const INTER_DELAY = ANTH_KEY ? 8000 : 0; // ms between Anthropic calls when fetching JDs

// ── LOAD JOBS ─────────────────────────────────────────────────────────────────
const jobsJS = fs.readFileSync(path.join(__dirname, '../js/jobs-data.js'), 'utf8');
const vmCtx  = { window: {} };
vm.createContext(vmCtx);
vm.runInContext(jobsJS, vmCtx);
const ALL_JOBS = vmCtx.window.ALL_JOBS;
console.log(`Loaded ${ALL_JOBS.length} jobs\n`);

// ── SUPABASE HELPERS ─────────────────────────────────────────────────────────
async function sbFetch(url, opts = {}) {
  return fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json', ...opts.headers },
    ...opts
  });
}

async function fetchStatuses() {
  try {
    const r = await sbFetch(`${SB_URL}/rest/v1/job_statuses?id=eq.omkar_apte_jobs&select=statuses`);
    if (!r.ok) return {};
    const rows = await r.json();
    return rows.length ? JSON.parse(rows[0].statuses || '{}') : {};
  } catch (e) {
    console.warn('  Could not load statuses from Supabase:', e.message);
    return {};
  }
}

async function fetchExistingJDData() {
  const result = {};
  process.stdout.write('  Loading existing JD data from Supabase: ');
  for (let i = 0; i < 12; i++) {
    try {
      const r = await fetch(`${SB_URL}/storage/v1/object/public/resumes/jd_data_${i}.json?v=${Date.now()}`);
      if (r.ok) { Object.assign(result, await r.json()); process.stdout.write('.'); }
      else process.stdout.write('_');
    } catch { process.stdout.write('!'); }
    await new Promise(r => setTimeout(r, 100));
  }
  const filled = Object.values(result).filter(v => v && v.accessible === true).length;
  console.log(` ${filled} accessible JDs cached\n`);
  return result;
}

async function uploadChunks(prefix, data) {
  const allIds    = Object.keys(data).map(Number).sort((a, b) => a - b).map(String);
  const chunkSize = Math.ceil(allIds.length / 12) || 1;
  let ok = 0, fail = 0;
  for (let i = 0; i < 12; i++) {
    const slice = allIds.slice(i * chunkSize, (i + 1) * chunkSize);
    const chunk = {};
    for (const id of slice) chunk[id] = data[id];
    try {
      const r = await fetch(`${SB_URL}/storage/v1/object/resumes/${prefix}_${i}.json`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
        body:    JSON.stringify(chunk)
      });
      if (r.ok) { ok++; process.stdout.write('.'); }
      else { fail++; const t = await r.text(); console.error(`\n  FAIL ${prefix}_${i}.json ${r.status}: ${t.slice(0, 120)}`); }
    } catch (e) { fail++; console.error(`\n  ERR  ${prefix}_${i}.json: ${e.message}`); }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`  (${ok}/12 ok${fail ? ', ' + fail + ' failed' : ''})`);
  return { ok, fail };
}

// ── ANTHROPIC JD FETCHER (optional) ──────────────────────────────────────────
async function fetchJDFromAnthropic(job) {
  if (!ANTH_KEY || !job.url) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTH_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2500,
        tools:      [{ type: 'web_search_20260209', name: 'web_search' }],
        system:     `Fetch the job posting and return ONLY a JSON object:
{
  "accessible": true or false,
  "jdText": "complete job description text, verbatim",
  "tags": ["up to 8 key requirement tags, exact phrases ATS would match"],
  "fit": 1-100,
  "why": "2-3 sentences why Omkar fits (first person)",
  "resume_angle": "1-2 sentences on what to lead with",
  "pay": "salary range or ''"
}
Candidate: Environmental Coordinator, Georgia-Pacific 2 yrs, Title V/SPCC/SWPPP/RCRA/stormwater, zero violations. Power BI (600+ users), Python automation, AI agents, GIS. B.S. Env Science NC State.`,
        messages: [{ role: 'user', content: `Fetch: ${job.url}` }]
      })
    });

    if (resp.status === 429) { await new Promise(r => setTimeout(r, 30000)); return null; }
    if (!resp.ok) return null;

    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const m    = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// ── KEYWORD EXTRACTION ────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'the','and','or','for','with','you','your','this','that','from','have','will','are','our',
  'their','which','they','has','been','more','also','but','not','all','can','such','any',
  'other','role','responsibilities','requirements','position','candidate','company',
  'experience','years','ability','skills','work','team','using','must','should','including',
  'may','provide','support','ensure','manage','develop','bachelor','degree','related','field',
  'preferred','required','strong','excellent','working','knowledge','minimum','lead','highlight',
  'background','solid','great','rare','domain','direct','well','highly','very','its',
  'both','within','across','over','into','about','through','based','while'
]);

function extractKeywordsFromJDText(jdText) {
  if (!jdText || jdText.length < 50) return [];
  const words = jdText.toLowerCase().split(/\W+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
  const freq  = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([w]) => w);
}

function extractKeywordsFromMeta(job, jdEntry) {
  // Priority: JD-extracted tags (most accurate) > job.tags > natural language in why/angle
  const jdTags = (jdEntry && jdEntry.tags && jdEntry.tags.length) ? jdEntry.tags : (job.tags || []);

  const metaText  = [(job.why || ''), (job.resume_angle || ''), (job.title || '')].join(' ').toLowerCase();
  const metaWords = metaText.split(/\W+/).filter(w => w.length >= 4 && !STOPWORDS.has(w));
  const metaFreq  = {};
  metaWords.forEach(w => { metaFreq[w] = (metaFreq[w] || 0) + 1; });
  const topMeta = Object.entries(metaFreq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w]) => w);

  return { jdTags, topMeta };
}

// ── SUMMARY BUILDER ───────────────────────────────────────────────────────────
function buildSummary(job, jdKeywords) {
  const ADJECTIVES = 'Imaginative, inquisitive, driven, creative, and highly competent';
  const company    = job.company.split('(')[0].trim();
  const t          = (job.title || '').toLowerCase();
  const angle      = (job.resume_angle || '').split(/[.!?]/)[0].trim();

  const isEHS  = ['ehs','environmental','compliance','coordinator','specialist','safety','health'].some(k => t.includes(k));
  const isData = ['data','analyst','analytics','bi','reporting','insights','database'].some(k => t.includes(k));
  const isAI   = ['ai','agent','engineer','developer','software','tech','automation','developer'].some(k => t.includes(k));
  const isGIS  = ['gis','geospatial','spatial','mapping'].some(k => t.includes(k));

  // Find 3-5 JD keywords that are naturally in Omkar's experience to mention in summary
  const omkarTermSet = new Set([
    'environmental','compliance','regulatory','permitting','title','spcc','swppp','rcra','stormwater',
    'air','water','waste','monitoring','inspection','reporting','training','audit','assessment',
    'power','python','automation','analytics','data','dashboard','sql','excel','gis','arcgis',
    'ai','agent','digital','workflow','typescript','react','supabase','cloud','pipeline','ci',
    'management','coordination','program','technical','operations','safety','health','engineering'
  ]);
  const topMatched = (jdKeywords.jdTags.slice(0, 8)).filter(tag =>
    tag.toLowerCase().split(/\s+/).some(w => omkarTermSet.has(w))
  ).slice(0, 4);

  // Core description — role-matched
  let core;
  if (isData) {
    core = 'environmental and data professional with two years at Georgia-Pacific building enterprise analytics, Python automation, and AI agent tooling while owning five active compliance programs. Developed a Power BI dashboard serving 600 employees across two facilities and automated 80% of manual department reporting.';
  } else if (isAI) {
    core = 'environmental technology professional with two years deploying AI agents, Python tooling, and Power BI solutions in a live compliance environment at Georgia-Pacific (Koch Industries). Built production tools that auto-populate regulatory reports from source data, eliminating manual data entry across multiple programs.';
  } else if (isGIS) {
    core = 'environmental professional with two years at Georgia-Pacific owning air, water, and waste compliance programs while applying GIS-informed environmental analysis and data-driven compliance reporting. Covers stormwater management, corrective action tracking, and watershed analysis.';
  } else if (isEHS) {
    core = 'environmental compliance professional with two years at Georgia-Pacific owning five active regulatory programs — Title V air, SPCC, SWPPP, RCRA, and stormwater — across two industrial facilities with zero major violations. Combines deep regulatory expertise with Power BI analytics and Python automation used daily.';
  } else {
    core = 'environmental and data professional with two years at Georgia-Pacific owning Title V, SPCC, RCRA, and stormwater programs while building Power BI analytics serving 600 users and Python automation eliminating 80% of manual reporting.';
  }

  // Closing — embeds specific JD keywords so ATS matches them in the summary
  let closing;
  if (topMatched.length >= 2) {
    closing = `Directly skilled in ${topMatched.join(', ')}${angle ? '; ' + angle.toLowerCase() : ''}.`;
  } else if (angle) {
    closing = `${angle}.`;
  } else {
    closing = `Prepared to apply this combination of technical and compliance expertise to ${company}.`;
  }

  return `${ADJECTIVES} ${core} ${closing}`;
}

// ── CL CONTENT GENERATOR ──────────────────────────────────────────────────────
function generateCLContent(job) {
  const company = job.company.split('(')[0].trim();
  const today   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const t       = (job.title || '').toLowerCase();
  const topTags = (job.tags || []).slice(0, 3).join(', ');
  const angle   = (job.resume_angle || '').split(/[.!?]/)[0].trim().toLowerCase();

  const isEHS  = ['ehs','environmental','compliance','coordinator','specialist','safety','health'].some(k => t.includes(k));
  const isData = ['data','analyst','analytics','bi','reporting','insights'].some(k => t.includes(k));
  const isAI   = ['ai','agent','engineer','developer','software','tech','automation'].some(k => t.includes(k));

  // Para 1: Company context from job.why, first non-Omkar sentence
  const whySentences = (job.why || '').split(/(?<=[.!?])\s+/);
  const companyCtx   = whySentences.find(s => {
    const sl = s.toLowerCase();
    return !sl.startsWith('your') && !sl.startsWith('you') &&
      (sl.includes(company.toLowerCase().split(' ')[0]) || sl.includes(' firm') || sl.includes(' company') || sl.includes(' team'));
  });

  let para1;
  if (companyCtx) {
    para1 = `${companyCtx.trim()} I am applying for the ${job.title} position${angle ? ', where ' + angle : ''}.`;
  } else {
    para1 = `The ${job.title} role at ${company} is a strong match for ${angle || 'my combined background in environmental compliance and data analytics'}. My work at Georgia-Pacific operates at exactly this intersection every day.`;
  }

  // Para 2: GP experience, role-matched
  let para2;
  if (isData) {
    para2 = `In my current role as Environmental Coordinator at Georgia-Pacific, I built a Power BI compliance analytics dashboard from scratch that serves 600 employees across two industrial facilities, and automated roughly 80% of manual department reporting through Python and Power Automate. ${angle ? angle.charAt(0).toUpperCase() + angle.slice(1) + '.' : 'That combination of environmental domain expertise and data engineering is uncommon in this field.'}`;
  } else if (isAI) {
    para2 = `At Georgia-Pacific, I deployed AI agents and Python tooling in a live production environment, including a tool that auto-populates Title V and MACT compliance report templates from source data, eliminating manual data entry. I also built a Power BI dashboard with 600 active users and led a company-wide application rollout reaching 100 environmental managers nationally.`;
  } else if (isEHS) {
    para2 = `As Environmental Coordinator at Georgia-Pacific, I own five active regulatory programs across two industrial facilities, including Title V air, SPCC, SWPPP, RCRA hazardous waste, and stormwater, with zero major violations under any of them. ${angle ? angle.charAt(0).toUpperCase() + angle.slice(1) + '.' : 'The breadth across air, water, and waste programs is what makes this experience genuinely applicable.'}`;
  } else {
    para2 = `In my role at Georgia-Pacific, I own five regulatory programs across two industrial facilities, built enterprise Power BI solutions used by 600 employees, and automated 80% of manual reporting through Python. ${angle ? angle.charAt(0).toUpperCase() + angle.slice(1) + '.' : 'This combination of compliance depth and technical capability is directly applicable.'}`;
  }

  // Para 3: Technical differentiators with metrics
  let para3;
  if (isData || isAI) {
    para3 = `The technical work I do is production-grade: a Power BI dashboard with 600 active users, Python automation that eliminates 30% of the team's monthly hours, and AI agents running in a live regulatory environment. The skills most relevant here, ${topTags || 'data analytics, Python, and process automation'}, are central to my daily work at GP.`;
  } else {
    para3 = `Beyond core compliance, I bring Power BI analytics serving 600 users, Python automation eliminating 80% of manual reporting, and hands-on AI agent deployment in a regulatory context. The requirements for this role, ${topTags || 'environmental compliance, technical reporting, and stakeholder coordination'}, map directly to what I do.`;
  }

  // Para 4: Close (no em dashes per house rules)
  const para4 = `I would welcome the opportunity to bring this combination of regulatory depth and technical capability to ${company}. Happy to discuss further at your convenience.`;

  return { date: today, greeting: 'Dear Hiring Team,', paragraphs: [para1, para2, para3, para4], closing: 'Sincerely,' };
}

// ── RESUME PDF BUILDER ────────────────────────────────────────────────────────
async function buildResumePDF(job, summaryText, jdKeywords) {
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const reg  = await doc.embedFont(StandardFonts.TimesRoman);
  const ital = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const PAGE_W = 612, PAGE_H = 792;
  const ML = 54, MR = 54, MT = 36, MB = 36;
  const TW = PAGE_W - ML - MR;
  const BLACK = rgb(0, 0, 0);
  const LGRAY = rgb(0.55, 0.55, 0.55);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MT;

  function newPage() { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MT; }
  function checkY(needed) { if (y - needed < MB) newPage(); }

  function wrap(text, fontSize, font, maxW) {
    const words = String(text).split(' ');
    let line = '', lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(test, fontSize) > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function writeLines(lines, x, fontSize, font, color, lineH) {
    for (const l of lines) {
      checkY(lineH + 2);
      page.drawText(l, { x, y: y - fontSize, size: fontSize, font, color });
      y -= lineH;
    }
  }

  function sectionHeader(title) {
    checkY(22); y -= 4;
    page.drawText(title.toUpperCase(), { x: ML, y: y - 9.5, size: 9.5, font: bold, color: BLACK });
    y -= 11;
    page.drawLine({ start: { x: ML, y }, end: { x: ML + TW, y }, thickness: 0.6, color: BLACK });
    y -= 4;
  }

  function jobTitleBlock(title, meta) {
    y -= 2;
    writeLines(wrap(title, 9.2, bold, TW), ML, 9.2, bold, BLACK, 11);
    writeLines(wrap(meta, 8.8, ital, TW), ML, 8.8, ital, LGRAY, 10.5);
  }

  function bullet(text) {
    const bx = ML + 10, bw = TW - 10;
    const lines = wrap(text, 9, reg, bw);
    checkY(lines.length * 11 + 2);
    page.drawText('•', { x: ML, y: y - 9, size: 9, font: reg, color: BLACK });
    writeLines(lines, bx, 9, reg, BLACK, 11);
  }

  function bodyText(text) {
    const lines = wrap(text, 9, reg, TW);
    checkY(lines.length * 11 + 4);
    writeLines(lines, ML, 9, reg, BLACK, 11);
    y -= 1;
  }

  function skillLine(label, items) {
    if (!items || !items.length) return;
    const labelW = 110, availW = TW - labelW;
    const lines  = wrap(items.join(', '), 9, reg, availW);
    checkY(lines.length * 11 + 2);
    page.drawText(label + ':', { x: ML, y: y - 9, size: 9, font: bold, color: BLACK });
    if (lines[0]) page.drawText(lines[0], { x: ML + labelW, y: y - 9, size: 9, font: reg, color: BLACK });
    y -= 11;
    for (let i = 1; i < lines.length; i++) {
      checkY(11);
      page.drawText(lines[i], { x: ML + labelW, y: y - 9, size: 9, font: reg, color: BLACK });
      y -= 11;
    }
  }

  function measureTitleH(title, meta) {
    return 2 + wrap(title, 9.2, bold, TW).length * 11 + wrap(meta, 8.8, ital, TW).length * 10.5;
  }
  function measureBulletH(text) { return wrap(text, 9, reg, TW - 10).length * 11 + 2; }

  function jobBlock(title, meta, bullets, post = 0) {
    let needed = measureTitleH(title, meta) + post;
    for (const b of bullets) needed += measureBulletH(b);
    checkY(needed);
    jobTitleBlock(title, meta);
    for (const b of bullets) bullet(b);
    y -= post;
  }

  // ── NAME + CONTACT ──────────────────────────────────────────────────────────
  const nameW = bold.widthOfTextAtSize('Omkar Apte', 18);
  page.drawText('Omkar Apte', { x: ML + (TW - nameW) / 2, y: y - 18, size: 18, font: bold, color: BLACK });
  y -= 24;
  const contact = 'omkarapte2010@gmail.com  •  (919) 717-7472  •  Raleigh, NC  •  linkedin.com/in/omkar-apte-5ab8b7132';
  const cw = reg.widthOfTextAtSize(contact, 8.5);
  page.drawText(contact, { x: ML + (TW - cw) / 2, y: y - 8.5, size: 8.5, font: reg, color: LGRAY });
  y -= 15;

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  sectionHeader('Summary');
  bodyText(summaryText);

  // ── CERTIFICATIONS ───────────────────────────────────────────────────────────
  sectionHeader('Certifications');
  bullet('Method 9 Visible Emissions Evaluator — certified biannually');
  bullet('NCMA Water Quality Sampling Certification');

  // ── CORE SKILLS ──────────────────────────────────────────────────────────────
  const t_l  = (job.title || '').toLowerCase();
  const tags_l = (job.tags || []).map(s => s.toLowerCase());
  const isEHS  = ['ehs','environmental','compliance','coordinator','specialist','safety','health'].some(k => t_l.includes(k));
  const isData = ['data','analyst','analytics','bi','automation','python','sql','reporting'].some(k => t_l.includes(k)) ||
                 ['power bi','python','sql','data analytics'].some(t => tags_l.includes(t));
  const isGIS  = ['gis','geospatial','spatial','mapping'].some(k => t_l.includes(k));
  const isAI   = ['ai','agent','automation','engineer','developer','software'].some(k => t_l.includes(k));
  const isImpl = ['implementation','consultant','solutions','specialist'].some(k => t_l.includes(k));

  sectionHeader('Core Skills');

  // Areas of Expertise = JD tags (the most JD-relevant keywords, shown first)
  const expertiseTags = [...new Set([...(jdKeywords.jdTags), ...(job.tags || [])])].slice(0, 12);
  if (expertiseTags.length) skillLine('Areas of Expertise', expertiseTags);

  const allKeywords = [...expertiseTags];

  // Environmental Compliance
  const ehsList = ['Title V Air (PCWP-MACT, BMACT)', 'SPCC', 'SWPPP / NPDES Stormwater', 'RCRA Hazardous Waste', 'Water Quality Monitoring', 'Method 9 Opacity Evaluation', 'CWA / CAA', 'NCDEQ Coordination'];
  skillLine('Environmental Compliance', ehsList);
  allKeywords.push(...ehsList);

  // Data and Automation
  const dataList = ['Power BI', 'Python', 'R', 'SQL', 'Power Automate', 'AI Agent Deployment', 'GitHub Copilot', 'Excel'];
  skillLine('Data and Automation', dataList);
  allKeywords.push(...dataList);

  // GIS
  const gisList = ['ArcGIS Pro', 'ArcGIS Online', 'QGIS', 'Spatial Analysis', 'Watershed Delineation', 'Environmental Mapping'];
  skillLine('GIS and Spatial Analysis', gisList);
  allKeywords.push(...gisList);

  // AI and Technical
  const aiList = ['AI Agent Deployment', 'GitHub Copilot', 'Python Scripting', 'Power Automate', 'C# (Self-taught)', 'Digital Workflow Development'];
  skillLine('AI and Technical', aiList);
  allKeywords.push(...aiList);

  // Any JD-specific terms not already in standard categories — give them their own line
  const standardTermsLower = new Set(allKeywords.map(k => k.toLowerCase()));
  const extraJDTerms = [...jdKeywords.jdTags, ...jdKeywords.topMeta]
    .filter(t => t.length >= 3 && !standardTermsLower.has(t.toLowerCase()))
    .slice(0, 15);
  if (extraJDTerms.length >= 2) {
    skillLine('Additional Requirements', extraJDTerms);
    allKeywords.push(...extraJDTerms);
  }

  skillLine('Academic', [
    'Proficient in Math and Science', 'Great writer and communicator', 'High business and economic sense',
    'Creative problem-solving', 'Soil Science', 'Sustainability and Climate Change',
    'Natural Resource Management', 'Organic Chemistry', 'Energy and the Environment',
    'Electrical Engineering: Circuits, Computer Logic, C Programming'
  ]);
  skillLine('Technical', ['HTML', 'CSS', 'JavaScript', 'Microsoft Office', 'Photoshop', 'Python', 'R', 'C#', 'C', 'GIS', 'Microsoft Power Tools', 'AI Agents', 'GitHub Copilot']);
  skillLine('Personal', ['Problem solving', 'Strong work ethic', 'Creative', 'Positive', 'Team player', 'Quick learner', 'Sociable', 'Strong communication', 'Innovative', 'Organized', 'Analytical', 'Driven', 'Highly Competent']);
  skillLine('Communication', ['Technical Report Writing', 'Regulatory Coordination', '200+ Employee Training', 'Management Briefings', 'Cross-functional Coordination']);

  // ── PROFESSIONAL EXPERIENCE ───────────────────────────────────────────────────
  checkY(22 + measureTitleH('Environmental Coordinator | Georgia-Pacific (Koch Industries)', 'Dudley, NC | June 2024 – Present'));
  sectionHeader('Professional Experience');

  // All GP bullets with keyword-matchable content
  const bp = {
    own:      'Owns five active regulatory programs across two plywood and lumber facilities — Title V air, SPCC, SWPPP, RCRA hazardous waste, and stormwater — with no major violations under any of them',
    titlev:   'Prepares and submits Title V annual compliance certifications including PCWP-MACT and BMACT reports; coordinates permit deviations, stack test scheduling, and NCDEQ correspondence',
    method9:  'Certified Method 9 visible emissions evaluator — conducts biannual opacity evaluations on all regulated combustion sources at both facilities',
    water:    'Runs monthly water quality sampling under NCMA certification, maintains SWPPP documentation, manages stormwater BMP inspections, and tracks corrective actions through to closure',
    powerbi:  'Built a Power BI compliance analytics dashboard from scratch — used across two facilities by 600+ employees to track KPIs, inspection status, corrective actions, and program data in real time',
    automate: 'Automated roughly 80% of manual department reporting using Python and Power Automate, saving the team an estimated 30% of monthly working hours across compliance workflows',
    ai:       'Deployed AI agents and Python tooling for regulatory automation — built an air compliance report tool that auto-populates Title V and MACT report templates from source data, eliminating manual data entry; runs in a live production environment',
    inspect:  "Led the rollout of the company's in-house inspection application — assisted with development and testing, produced training materials, and trained 100+ environmental managers nationally",
    training: 'Runs weekly environmental compliance orientations for all new plant hires and serves as the primary compliance resource for plant supervisors and operations staff — a role that required quickly building credibility to direct people with far more years of industrial experience',
    cost:     'Active in site cost reduction program — identifies ways to minimize environmental program costs through waste reduction, process changes, and vendor management',
    ops:      'Joined as the youngest member of the site management team — had to earn the authority to provide compliance direction to plant supervisors, senior operators, and contractors with decades more experience, leading through expertise rather than tenure'
  };

  // Score each bullet against JD keywords so the most JD-relevant ones appear first
  const allJDTermsLower = new Set([
    ...jdKeywords.jdTags.map(k => k.toLowerCase()),
    ...jdKeywords.topMeta.map(k => k.toLowerCase())
  ]);

  function bulletScore(text) {
    const words = text.toLowerCase().split(/\W+/);
    return words.filter(w => w.length >= 3 && allJDTermsLower.has(w)).length +
           [...allJDTermsLower].filter(term => text.toLowerCase().includes(term)).length;
  }

  // Role-type initial order
  let roleOrder;
  if (isImpl)      roleOrder = ['inspect','own','titlev','powerbi','automate','training','cost','ai','method9','water','ops'];
  else if (isAI)   roleOrder = ['ai','automate','powerbi','inspect','own','training','cost','titlev','water','method9','ops'];
  else if (isData) roleOrder = ['powerbi','automate','ai','own','water','training','cost','inspect','titlev','method9','ops'];
  else if (isGIS)  roleOrder = ['own','water','titlev','powerbi','automate','training','cost','method9','ai','inspect','ops'];
  else if (isEHS)  roleOrder = ['own','titlev','method9','water','powerbi','automate','training','cost','ai','inspect','ops'];
  else             roleOrder = ['own','powerbi','automate','ai','inspect','training','cost','titlev','water','method9','ops'];

  // Re-sort by JD keyword score (descending), preserving role-type order as tiebreaker
  const scoredBullets = roleOrder.map((key, idx) => ({ key, text: bp[key], score: bulletScore(bp[key]), idx }));
  scoredBullets.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const sel = scoredBullets.map(s => s.text);

  jobBlock('Environmental Coordinator | Georgia-Pacific (Koch Industries)', 'Dudley, NC | June 2024 – Present', sel, 2);

  jobBlock('Mobile Engineering Intern | Qorvo', 'Greensboro, NC | May 2022 – August 2022', [
    'Worked in the RF characterization lab running hardware tests on mobile chips — operated handlers, set up test routines, and logged results for the engineering team',
    'Learned Spotfire and built data visualization dashboards to help engineers track chip performance across test batches and flag outliers',
    'Gained direct exposure to RF chip design, the cellular network stack, and device validation processes from early testing through production sign-off'
  ], 2);

  jobBlock('Mobile Engineering Intern | Qorvo', 'Greensboro, NC | May 2021 – August 2021', [
    'Taught myself C# in the first few weeks of the internship and built an internal data parsing application — took Excel files from multiple engineers, cleaned and reformatted them, and prepared them for a downstream code generator used in chip characterization',
    'The tool went into regular production use and eliminated a manual, error-prone file prep step that the team had been doing by hand',
    'Scoped, built, tested, and shipped the project independently — no prior C# experience, minimal guidance, first real software deliverable',
    'Also worked in the RF testing lab: learned how handlers operate, how test fixtures are configured, and what the chip validation lifecycle looks like from design to final sign-off'
  ], 2);

  jobBlock('Co-Founder and CEO | Fertivo', 'Cary, NC | September 2017 – April 2018', [
    'Co-founded a startup building a trash can that converted organic waste into fertilizer — developed the concept, assembled the founding team, and drove product direction from idea through prototype',
    'Led weekly team meetings and kept both the hardware prototyping track and business development track moving in parallel',
    'Called potential competitors and industry contacts to understand the market landscape and identify where Fertivo could realistically compete',
    'Planned multiple revenue streams: direct consumer sales, commercial facility partnerships, and municipal solid waste contracts',
    'Worked through several prototyping iterations troubleshooting mechanical and chemical issues as they came up during testing'
  ], 2);

  // ── PERSONAL PROJECTS ────────────────────────────────────────────────────────
  sectionHeader('Personal Projects');
  jobBlock('LyfeWare — Integrated Lifestyle Ecosystem', 'Solo Build | 2024 – Present', [
    'Architected and deployed LyfeWare, a multi-app lifestyle suite consisting of Pantry (AI culinary intelligence), HomeBase (domestic operations management), and Vinyl (social music atmosphere), unified by a custom "Sign in with LyfeWare" SSO identity layer',
    'Engineered the SSO authentication portal using React, Vite, and Supabase Auth with Google and Apple OAuth, enabling seamless cross-platform session persistence and data portability across three distinct web and mobile applications',
    'Pantry: AI-driven pantry and recipe manager featuring receipt-scanning expense splitting and smart meal planning based on dietary restrictions',
    'HomeBase: co-living management system with gamified chore drafting, automated debt settlement, and property maintenance tracking',
    'Vinyl: social music platform (React Native/Expo) with a Mood-Food matching engine that curates playlist atmospheres based on household activity',
    'Developed a cross-app real-time signal bus using PostgreSQL triggers and Supabase Realtime (e.g., triggering high-BPM cleaning playlists in Vinyl when a deep-clean chore starts in HomeBase) and a multi-tenant Supabase schema with Row Level Security for shared household data',
    'Orchestrated a CI/CD pipeline with TypeScript for end-to-end type safety, Netlify for high-availability web hosting, and Expo for cross-platform mobile deployment'
  ], 2);

  // ── EDUCATION ────────────────────────────────────────────────────────────────
  sectionHeader('Education');
  jobBlock('B.S. Environmental Science | North Carolina State University', 'Raleigh, NC | August 2024', [
    'Minor in Economics',
    'Relevant coursework: Soil Science, Natural Resource Management, Sustainability and Climate Change, Energy and Environment, Organic Chemistry, Capstone (NRM Planning and Land Use Analysis)',
    'Additional coursework: Electrical Engineering — Circuits, Computer Logic, C Programming'
  ]);

  // ── ATS KEYWORDS (comprehensive, all JD terms end up here) ───────────────────
  const finalKeywords = [...new Set(allKeywords)];
  if (finalKeywords.length > 0) {
    sectionHeader('Keywords');
    bodyText(finalKeywords.join(', '));
  }

  doc.setTitle(`Resume - Omkar Apte - ${job.company}`);
  doc.setAuthor('Omkar Apte');
  doc.setSubject(`Tailored Resume for ${job.title} at ${job.company}`);
  doc.setKeywords([...new Set(finalKeywords)]);

  return await doc.save();
}

// ── CL PDF BUILDER ────────────────────────────────────────────────────────────
async function buildCoverLetterPDF(job, clData) {
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const reg  = await doc.embedFont(StandardFonts.TimesRoman);

  const PAGE_W = 612, PAGE_H = 792;
  const ML = 72, MR = 72, MT = 54, MB = 54;
  const TW = PAGE_W - ML - MR;
  const BLACK = rgb(0, 0, 0);
  const LGRAY = rgb(0.5, 0.5, 0.5);
  const DGRAY = rgb(0.35, 0.35, 0.35);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MT;

  function wrap(text, fontSize, font, maxW) {
    const words = String(text).split(' ');
    let line = '', lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(test, fontSize) > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function writePara(text, size, font, color, lineH) {
    for (const l of wrap(text, size, font, TW)) {
      if (y - size < MB) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MT; }
      page.drawText(l, { x: ML, y: y - size, size, font, color });
      y -= lineH;
    }
  }

  const nameW = bold.widthOfTextAtSize('Omkar Apte', 18);
  page.drawText('Omkar Apte', { x: ML + (TW - nameW) / 2, y: y - 18, size: 18, font: bold, color: BLACK });
  y -= 26;
  const contact = 'omkarapte2010@gmail.com  •  (919) 717-7472  •  Raleigh, NC  •  linkedin.com/in/omkar-apte-5ab8b7132';
  const cw = reg.widthOfTextAtSize(contact, 8.5);
  page.drawText(contact, { x: ML + (TW - cw) / 2, y: y - 8.5, size: 8.5, font: reg, color: LGRAY });
  y -= 13;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + TW, y }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
  y -= 22;

  page.drawText(clData.date, { x: ML, y: y - 10, size: 10, font: reg, color: DGRAY }); y -= 24;
  page.drawText(job.company.split('(')[0].trim(), { x: ML, y: y - 10, size: 10, font: bold, color: BLACK }); y -= 22;
  page.drawText(clData.greeting, { x: ML, y: y - 10, size: 10, font: reg, color: BLACK }); y -= 22;

  for (const para of clData.paragraphs) { writePara(para, 10, reg, BLACK, 14); y -= 10; }

  y -= 2;
  page.drawText(clData.closing, { x: ML, y: y - 10, size: 10, font: reg, color: BLACK }); y -= 38;
  page.drawText('Omkar Apte', { x: ML, y: y - 10, size: 10, font: bold, color: BLACK });

  doc.setTitle('Cover Letter - Omkar Apte - ' + job.company);
  doc.setAuthor('Omkar Apte');
  doc.setSubject('Cover Letter for ' + job.title + ' at ' + job.company);
  return await doc.save();
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  // ── Load state from Supabase ─────────────────────────────────────────────────
  process.stdout.write('Loading statuses... ');
  const statuses  = await fetchStatuses();
  const appliedIds = new Set(Object.entries(statuses).filter(([, v]) => v && v.toLowerCase() === 'applied').map(([k]) => k));
  console.log(`${appliedIds.size} Applied jobs will be skipped`);

  const existingJD = await fetchExistingJDData();

  // ── Collect jobs to process ───────────────────────────────────────────────────
  const toProcess = ALL_JOBS.filter(j => j && !appliedIds.has(String(j.id)));
  console.log(`Processing ${toProcess.length} jobs (${ALL_JOBS.length - toProcess.length} skipped — Applied)\n`);

  const RESUMES = {}, COVER_LETTERS = {}, JD_DATA = {};

  // Pre-populate JD_DATA with existing entries so Applied jobs keep their data
  Object.assign(JD_DATA, existingJD);

  const total = toProcess.length;
  let built = 0, fetched = 0, failed = 0;
  const t0 = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const job      = toProcess[i];
    const id       = String(job.id);
    const company  = job.company.split('(')[0].trim();
    const label    = `[${String(i + 1).padStart(3)}/${total}]`;

    process.stdout.write(`${label} ${job.title.slice(0, 28).padEnd(28)} @ ${company.slice(0, 18).padEnd(18)} `);

    try {
      let jdEntry = existingJD[id] || null;

      // Optional: fetch JD via Anthropic if key is present and this job has no accessible JD yet
      if (ANTH_KEY && job.url && (!jdEntry || jdEntry.accessible !== true)) {
        process.stdout.write('[fetch] ');
        const fetched_data = await fetchJDFromAnthropic(job);
        if (fetched_data && fetched_data.accessible && fetched_data.jdText && fetched_data.jdText.length > 80) {
          // Update job in-place with richer data
          if (fetched_data.tags && fetched_data.tags.length)  job.tags         = fetched_data.tags.slice(0, 8);
          if (fetched_data.fit)                               job.fit          = Math.min(99, Math.max(1, parseInt(fetched_data.fit) || job.fit));
          if (fetched_data.why)                               job.why          = fetched_data.why;
          if (fetched_data.resume_angle)                      job.resume_angle = fetched_data.resume_angle;
          if (fetched_data.pay)                               job.pay          = fetched_data.pay;
          jdEntry = fetched_data;
          fetched++;
        }
        if (INTER_DELAY) await new Promise(r => setTimeout(r, INTER_DELAY));
      }

      // Extract keywords: JD tags + meta text analysis
      const jdKeywords = extractKeywordsFromMeta(job, jdEntry);

      // If we have actual jdText from this run, enrich with full keyword extraction
      if (jdEntry && jdEntry.jdText) {
        const textKeywords = extractKeywordsFromJDText(jdEntry.jdText);
        jdKeywords.topMeta = [...new Set([...jdKeywords.topMeta, ...textKeywords])].slice(0, 30);
      }

      const summary = buildSummary(job, jdKeywords);

      // Build resume PDF
      const pdfBytes = await buildResumePDF(job, summary, jdKeywords);
      const b64      = Buffer.from(pdfBytes).toString('base64');
      const fname    = `Omkar Apte (${company} - ${job.title}) Resume.pdf`;
      RESUMES[id]    = { name: fname, b64 };

      // Build CL
      const clContent  = generateCLContent(job);
      const clBytes    = await buildCoverLetterPDF(job, clContent);
      const clB64      = Buffer.from(clBytes).toString('base64');
      const clFname    = `Omkar Apte (${company} - ${job.title}) Cover Letter.pdf`;
      COVER_LETTERS[id] = { name: clFname, b64: clB64, ...clContent };

      // Update JD_DATA entry
      JD_DATA[id] = {
        accessible:   (jdEntry && jdEntry.accessible) ?? true,
        atsScore:     null,
        tags:         job.tags          || [],
        fit:          job.fit           || 80,
        why:          job.why           || '',
        resume_angle: job.resume_angle  || '',
        pay:          job.pay           || '',
        ...(jdEntry && jdEntry.jdText ? { jdText: jdEntry.jdText } : {})
      };

      built++;
      console.log('done');
    } catch (e) {
      failed++;
      console.error(`FAILED: ${e.message}`);
    }

    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`\n  --- ${i + 1}/${total} done in ${elapsed}s${fetched ? ` (${fetched} JDs fetched via API)` : ''} ---\n`);
    }
  }

  const genTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nGenerated: ${built} resumes, ${built} CLs | ${fetched} JDs fetched | ${failed} failed | ${genTime}s\n`);

  if (process.env.SKIP_UPLOAD) { console.log('SKIP_UPLOAD set — skipping.'); return; }

  console.log('Uploading to Supabase (36 files)...');

  if (!process.env.SKIP_RESUMES) { process.stdout.write('  resumes  [12]: '); await uploadChunks('resumes', RESUMES); }
  if (!process.env.SKIP_JDDATA)  { process.stdout.write('  jd_data  [12]: '); await uploadChunks('jd_data', JD_DATA); }
  if (!process.env.SKIP_CLS)     { process.stdout.write('  cl_data  [12]: '); await uploadChunks('cl_data', COVER_LETTERS); }

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nAll done in ${totalTime}s. Refresh the web app to see pre-built resumes and CLs.`);
}

main().catch(err => { console.error('\nFatal:', err); process.exit(1); });
