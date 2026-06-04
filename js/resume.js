// ── IN-BROWSER RESUME BUILDER (pdf-lib) ───────────────────────────────────────

async function buildResumePDF(job, summaryText) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.TimesBold);
  const reg  = await doc.embedFont(StandardFonts.TimesRoman);
  const ital = await doc.embedFont(StandardFonts.TimesItalic);

  const PAGE_W = 612, PAGE_H = 792;
  const ML = 54, MR = 54, MT = 44, MB = 44;
  const TW = PAGE_W - ML - MR;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MT;

  const BLACK  = rgb(0,0,0);
  const GRAY   = rgb(0.35,0.35,0.35);
  const LGRAY  = rgb(0.55,0.55,0.55);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MT;
  }

  function checkY(needed) {
    if (y - needed < MB) newPage();
  }

  function drawText(text, x, fontSize, font, color, maxWidth) {
    // Word-wrap
    const words = String(text).split(' ');
    let line = '';
    const lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      const tw = font.widthOfTextAtSize(test, fontSize);
      if (tw > maxWidth && line) { lines.push(line); line = w; }
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
    checkY(22);
    y -= 6;
    page.drawText(title.toUpperCase(), { x: ML, y: y - 11, size: 10.5, font: bold, color: BLACK });
    y -= 14;
    page.drawLine({ start:{x:ML,y}, end:{x:ML+TW,y}, thickness:0.6, color:BLACK });
    y -= 5;
  }

  function jobTitle(title, meta) {
    checkY(32);
    y -= 4;
    const tlines = drawText(title, ML, 10, bold, BLACK, TW);
    writeLines(tlines, ML, 10, bold, BLACK, 13);
    const mlines = drawText(meta, ML, 9.5, ital, LGRAY, TW);
    writeLines(mlines, ML, 9.5, ital, LGRAY, 12);
    y -= 2;
  }

  function bullet(text) {
    const bx = ML + 10;
    const bw = TW - 10;
    const lines = drawText(text, bx, 9.5, reg, BLACK, bw);
    checkY(lines.length * 13 + 2);
    page.drawText('•', { x: ML, y: y - 9.5, size: 9.5, font: reg, color: BLACK });
    writeLines(lines, bx, 9.5, reg, BLACK, 13);
  }

  function bodyText(text) {
    const lines = drawText(text, ML, 9.5, reg, BLACK, TW);
    checkY(lines.length * 13 + 4);
    writeLines(lines, ML, 9.5, reg, BLACK, 13);
    y -= 2;
  }

  function skillLine(label, items) {
    const fullText = items.join(', ');
    const bx = ML;
    const availW = TW;
    // Bold label
    const labelW = bold.widthOfTextAtSize(label + ':  ', 9.5);
    const allLines = drawText(fullText, bx + labelW, 9.5, reg, BLACK, availW - labelW);
    checkY(allLines.length * 13 + 2);
    // First line has the bold label prefix
    page.drawText(label + ':  ', { x: bx, y: y - 9.5, size: 9.5, font: bold, color: BLACK });
    if (allLines[0]) {
      page.drawText(allLines[0], { x: bx + labelW, y: y - 9.5, size: 9.5, font: reg, color: BLACK });
    }
    y -= 13;
    for (let i = 1; i < allLines.length; i++) {
      checkY(13);
      page.drawText(allLines[i], { x: bx + labelW, y: y - 9.5, size: 9.5, font: reg, color: BLACK });
      y -= 13;
    }
    y -= 1;
  }

  // ── NAME + CONTACT ────────────────────────────────────────────────────────
  const nameW = bold.widthOfTextAtSize('Omkar Apte', 19);
  page.drawText('Omkar Apte', {
    x: ML + (TW - nameW) / 2, y: y - 19, size: 19, font: bold, color: BLACK
  });
  y -= 26;
  const contact = 'omkarapte2010@gmail.com  •  (919) 717-7472  •  Raleigh, NC  •  linkedin.com/in/omkar-apte-5ab8b7132';
  const cw = reg.widthOfTextAtSize(contact, 9);
  page.drawText(contact, { x: ML + (TW - cw) / 2, y: y - 9, size: 9, font: reg, color: LGRAY });
  y -= 18;

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  sectionHeader('Summary');
  bodyText(summaryText);
  y -= 3;

  // ── CERTIFICATIONS ────────────────────────────────────────────────────────
  sectionHeader('Certifications');
  bullet('Method 9 Visible Emissions Evaluator — certified biannually');
  bullet('NCMA Water Quality Sampling Certification');
  y -= 3;

  // ── SKILLS ───────────────────────────────────────────────────────────────
  const title_l = (job.title||'').toLowerCase();
  const tags_l  = (job.tags||[]).map(t=>t.toLowerCase());
  const allKeywords = [...(job.tags || [])];

  const isEHS   = ['ehs','environmental','compliance','coordinator','specialist'].some(k=>title_l.includes(k));
  const isData  = ['data','analyst','analytics','bi','automation','python','sql'].some(k=>title_l.includes(k)) ||
                  ['power bi','python','sql','data analytics'].some(t=>tags_l.includes(t));
  const isGIS   = ['gis','geospatial','spatial'].some(k=>title_l.includes(k));
  const isAI    = ['ai','agent','automation','engineer','developer','software'].some(k=>title_l.includes(k));
  const isImpl  = ['implementation','consultant','solutions','specialist'].some(k=>title_l.includes(k));

  sectionHeader('Core Skills');
  
  // ATS Keywords Injection (from Job Tags)
  if (job.tags && job.tags.length > 0) {
    skillLine('Areas of Expertise', job.tags);
  }

  // Logic-based skill groups per Master Document
  if (isEHS || isImpl) {
    const list = ['Title V Air (PCWP-MACT, BMACT)','SPCC','SWPPP / NPDES Stormwater','RCRA Hazardous Waste','Water Quality Monitoring','Method 9','CWA / CAA','NCDEQ Coordination'];
    skillLine('Environmental Compliance', list);
    allKeywords.push(...list);
  }
  if (isData || isAI) {
    const list = ['Power BI','Python','R','SQL','Power Automate','AI Agent Deployment','GitHub Copilot','Excel'];
    skillLine('Data and Automation', list);
    allKeywords.push(...list);
  }
  if (isGIS) {
    const list = ['ArcGIS Pro','ArcGIS Online','QGIS','Spatial Analysis','Watershed Delineation','Environmental Mapping'];
    skillLine('GIS and Spatial Analysis', list);
    allKeywords.push(...list);
  }
  if (isAI || isImpl || title_l.includes('software')) {
    const list = ['AI Agent Deployment','GitHub Copilot','Python Scripting','Power Automate','C# (Self-taught)','Digital Workflow Development'];
    skillLine('AI and Technical', list);
    allKeywords.push(...list);
  }
  
  // Default fallback for technical skills if no specific match
  if (!isEHS && !isData && !isGIS && !isAI && !isImpl) {
    skillLine('Technical', ['Python','Power BI','GIS / ArcGIS','Power Automate','GitHub Copilot','Excel','R','SQL']);
  }
  skillLine('Communication', ['Technical Report Writing','Regulatory Coordination','200+ Employee Training','Management Briefings','Cross-functional Coordination']);
  y -= 3;

  // ── WHY THIS ROLE ─────────────────────────────────────────────────────────
  if (job.why) {
    sectionHeader('Why This Role');
    // Convert why from 2nd person to 1st
    let whyText = (job.why||'').replace(/\byour\b/gi,'my').replace(/\byou\b/gi,'I')
      .replace(/\byou've\b/gi,"I've").replace(/\byou're\b/gi,"I'm");
    const whySentences = whyText.split('.').filter(s=>s.trim()).slice(0,2);
    bodyText(whySentences.join('. ').trim() + '.');
    y -= 3;
  }

  // ── GP EXPERIENCE ─────────────────────────────────────────────────────────
  sectionHeader('Professional Experience');
  jobTitle('Environmental Coordinator | Georgia-Pacific (Koch Industries)', 'Dudley, NC | June 2024 – Present');

  const gpBullets = [
    'Owns and operates five active regulatory programs across two manufacturing facilities — Title V air, SPCC, SWPPP, RCRA hazardous waste, and stormwater — maintaining a record of zero major violations',
    'Manages Title V air permit compliance including PCWP-MACT and BMACT standards; coordinates annual certifications, permit deviations, and all NCDEQ agency correspondence',
    'Directs monthly water quality sampling under NCMA certification and conducts regular compliance audits to manage facility-wide corrective actions through to closure',
    'Engineered a custom Power BI compliance analytics platform from scratch, utilized by 600+ employees to track real-time KPIs, inspection status, and corrective actions across sites',
    'Automated roughly 80% of manual department reporting workflows using Python and Power Automate, resulting in a 30% reduction in monthly team working hours',
    'Deployed AI agents for regulatory research in a live production environment, cutting technical documentation lookup time from hours to minutes',
    'Led the nationwide rollout and training for an in-house digital inspection application for over 100 environmental managers across Georgia-Pacific operations',
    'Runs weekly environmental compliance training for 200+ new plant hires and works directly with plant management on facility operations'
  ];

  for (const b of gpBullets) bullet(b);
  y -= 4;

  // ── QORVO ────────────────────────────────────────────────────────────────
  jobTitle('Mobile Engineering Intern | Qorvo', 'Greensboro, NC | May 2022 – August 2022');
  bullet('Worked in the RF characterization lab running hardware tests on mobile chips — operated handlers, set up test routines, and logged results for the engineering team');
  bullet('Learned Spotfire and built data visualization dashboards to help engineers track chip performance across test batches and flag outliers');
  bullet('Got direct exposure to RF chip design, the cellular network stack, and device validation processes from early testing through production sign-off');
  y -= 4;

  jobTitle('Mobile Engineering Intern | Qorvo', 'Greensboro, NC | May 2021 – August 2021');
  bullet('Taught myself C# in the first few weeks and built an internal data parsing application — took Excel files from multiple engineers, cleaned and reformatted them for a downstream code generator used in chip characterization');
  bullet('The tool went into regular production use and eliminated a manual, error-prone file prep step the team had been doing by hand');
  bullet('Scoped, built, tested, and shipped the project independently — no prior C# experience, minimal guidance, first real software deliverable');
  y -= 4;

  // ── FERTIVO ──────────────────────────────────────────────────────────────
  jobTitle('Co-Founder and CEO | Fertivo', 'Cary, NC | September 2017 – April 2018');
  bullet('Co-founded a startup building a trash can that converted organic waste into fertilizer — developed the concept, assembled the founding team, and drove product direction from idea through prototype');
  bullet('Led weekly team meetings, coordinated hardware prototyping and business development in parallel, and reached out to competitors to map the market landscape');
  bullet('Planned multiple revenue streams: direct consumer sales, commercial facility partnerships, and municipal solid waste contracts');
  y -= 4;

  // ── LYFEWARE ─────────────────────────────────────────────────────────────
  sectionHeader('Personal Projects');
  jobTitle('LyfeWare — Integrated Lifestyle Ecosystem', 'Solo Build | 2024 – Present');
  bullet('Architected and deployed a multi-app suite (Pantry, HomeBase, Vinyl) unified by a custom "Sign in with LyfeWare" SSO identity provider built on React, Vite, and Supabase Auth with Google and Apple OAuth');
  bullet('Engineered a cross-app real-time signal bus using PostgreSQL triggers and Supabase Realtime — e.g., automatically triggering high-BPM playlists in Vinyl when a deep-clean chore is started in HomeBase');
  bullet('Designed a unified multi-tenant Supabase schema with Row Level Security policies handling shared household data across grocery lists, expenses, and analytics');
  bullet('Orchestrated a CI/CD pipeline with TypeScript for end-to-end type safety, Netlify for web hosting, and Expo for cross-platform mobile deployment');
  y -= 4;

  // ── EDUCATION ────────────────────────────────────────────────────────────
  checkY(90);
  sectionHeader('Education');
  jobTitle('B.S. Environmental Science | North Carolina State University', 'Raleigh, NC | August 2024');
  bullet('Minor in Economics');
  bullet('Relevant coursework: Soil Science, Natural Resource Management, Sustainability and Climate Change, Energy and Environment, Capstone (NRM Planning)');
  bullet('Additional coursework: Electrical Engineering — Circuits, Computer Logic, C Programming');

  // ── ATS KEYWORDS ─────────────────────────────────────────────────────────
  if (allKeywords.length > 0) {
    sectionHeader('Keywords');
    bodyText([...new Set(allKeywords)].join(', '));
  }

  // ── DOCUMENT METADATA ────────────────────────────────────────────────────
  doc.setTitle(`Resume - Omkar Apte - ${job.company}`);
  doc.setAuthor('Omkar Apte');
  doc.setSubject(`Tailored Resume for ${job.title} at ${job.company}`);
  doc.setKeywords([...new Set(allKeywords)]);

  const pdfBytes = await doc.save();
  return pdfBytes;
}

async function buildAndStoreResume(job, summaryText) {
  try {
    const pdfBytes = await buildResumePDF(job, summaryText);
    // Convert to base64
    let binary = '';
    const bytes = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    const fname = 'Omkar Apte (' + job.company.split('(')[0].trim() + ' - ' + job.title + ') Resume.pdf';
    RESUMES[String(job.id)] = { name: fname, b64 };
    return { name: fname, b64 };
  } catch(e) {
    console.error('Resume build failed:', e);
    return null;
  }
}
