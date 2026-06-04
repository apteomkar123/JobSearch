// ── IN-BROWSER RESUME BUILDER (pdf-lib) ───────────────────────────────────────

async function buildResumePDF(job, summaryText) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const reg  = await doc.embedFont(StandardFonts.TimesRoman);
  const ital = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const PAGE_W = 612, PAGE_H = 792;
  const ML = 54, MR = 54, MT = 36, MB = 36; // Slightly reduced margins for more space
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
    y -= 4;
    page.drawText(title.toUpperCase(), { x: ML, y: y - 9.5, size: 9.5, font: bold, color: BLACK }); // Slightly smaller header
    y -= 11;
    page.drawLine({ start:{x:ML,y}, end:{x:ML+TW,y}, thickness:0.6, color:BLACK });
    y -= 4;
  }

  function jobTitle(title, meta) {
    // checkY is now handled by drawUnbreakableBlock for the entire block
    y -= 2;
    const tlines = drawText(title, ML, 9.2, bold, BLACK, TW); // Slightly smaller font
    writeLines(tlines, ML, 9.2, bold, BLACK, 11); // Tighter line height
    const mlines = drawText(meta, ML, 8.8, ital, LGRAY, TW); // Slightly smaller font
    writeLines(mlines, ML, 8.8, ital, LGRAY, 10.5); // Tighter line height
  }

  function bullet(text) {
    const bx = ML + 10;
    const bw = TW - 10;
    const lines = drawText(text, bx, 9, reg, BLACK, bw); // Slightly smaller font
    checkY(lines.length * 11 + 2); // Tighter line height
    page.drawText('•', { x: ML, y: y - 9, size: 9, font: reg, color: BLACK });
    writeLines(lines, bx, 9, reg, BLACK, 11); // Tighter line height
  }

  function bodyText(text) {
    const lines = drawText(text, ML, 9, reg, BLACK, TW); // Slightly smaller font
    checkY(lines.length * 11 + 4); // Tighter line height
    writeLines(lines, ML, 9, reg, BLACK, 11); // Tighter line height
    y -= 1;
  }

  function skillLine(label, items) {
    const fullText = items.join(', ');
    const bx = ML;
    const labelW = 110; // Aligns all skill lists vertically, slightly reduced width
    const availW = TW - labelW;
    const lines = drawText(fullText, bx + labelW, 9, reg, BLACK, availW); // Slightly smaller font
    checkY(lines.length * 11 + 2); // Tighter line height
    page.drawText(label + ':', { x: bx, y: y - 9, size: 9, font: bold, color: BLACK });
    if (lines[0]) {
      page.drawText(lines[0], { x: bx + labelW, y: y - 9, size: 9, font: reg, color: BLACK });
    }
    y -= 11; // Tighter line height
    for (let i = 1; i < lines.length; i++) {
      checkY(11);
      page.drawText(lines[i], { x: bx + labelW, y: y - 9, size: 9, font: reg, color: BLACK });
      y -= 11;
    }
  }

  // New helper to measure job title block height
  function measureJobTitleHeight(title, meta) {
    let height = 0;
    height += 2; // Initial y decrement in jobTitle
    const tlines = drawText(title, ML, 9.2, bold, BLACK, TW);
    height += tlines.length * 11; // Line height for title
    const mlines = drawText(meta, ML, 8.8, ital, LGRAY, TW);
    height += mlines.length * 10.5; // Line height for meta
    return height;
  }

  // New helper to measure a single bullet height
  function measureBulletHeight(text) {
    const bx = ML + 10;
    const bw = TW - 10;
    const lines = drawText(text, bx, 9, reg, BLACK, bw);
    return lines.length * 11 + 2; // Line height for bullet + small buffer
  }

  // New helper to draw an unbreakable block of job title + bullets
  function drawUnbreakableJobBlock(title, meta, bullets, postBlockSpacing = 0) {
    let neededHeight = measureJobTitleHeight(title, meta);
    for (const b of bullets) {
      neededHeight += measureBulletHeight(b);
    }
    neededHeight += postBlockSpacing;

    checkY(neededHeight); // Ensure the entire block fits on one page

    jobTitle(title, meta);
    for (const b of bullets) bullet(b);
    y -= postBlockSpacing;
  }

  // ── NAME + CONTACT ────────────────────────────────────────────────────────
  const nameW = bold.widthOfTextAtSize('Omkar Apte', 18);
  page.drawText('Omkar Apte', {
    x: ML + (TW - nameW) / 2, y: y - 18, size: 18, font: bold, color: BLACK
  });
  y -= 24;
  const contact = 'omkarapte2010@gmail.com  •  (919) 717-7472  •  Raleigh, NC  •  linkedin.com/in/omkar-apte-5ab8b7132';
  const cw = reg.widthOfTextAtSize(contact, 8.5);
  page.drawText(contact, { x: ML + (TW - cw) / 2, y: y - 8.5, size: 8.5, font: reg, color: LGRAY });
  y -= 15;

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  sectionHeader('Summary');
  bodyText(summaryText);

  // ── CERTIFICATIONS ────────────────────────────────────────────────────────
  sectionHeader('Certifications');
  bullet('Method 9 Visible Emissions Evaluator — certified biannually');
  bullet('NCMA Water Quality Sampling Certification');

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

  // ── MANDATORY UNIVERSAL SKILL BLOCKS ─────────────────────────────────────
  skillLine('Academic', ['Proficient in Math and Science', 'Great writer and communicator', 'High business and economic sense', 'Creative when it comes to solving problems', 'Soil Science', 'Sustainability and Climate Change', 'Natural Resource Management', 'Organic Chemistry', 'Energy and the Environment', 'Electrical Engineering: Circuits, Computer Logic, C Programming']);
  skillLine('Technical', ['HTML', 'CSS', 'JavaScript', 'Microsoft Office', 'Photoshop', 'Python', 'R', 'C#', 'C', 'GIS', 'Microsoft Power Tools', 'AI Agents', 'Github Copilot']);
  skillLine('Personal', ['Problem solving', 'Strong work ethic', 'Creative', 'Positive', 'Work well in a team', 'Quick learner', 'Sociable', 'Strong communication skills', 'Innovative', 'Organized', 'Analytical', 'Driven', 'Highly Competent']);
  // ────────────────────────────────────────────────────────────────────────

  skillLine('Communication', ['Technical Report Writing','Regulatory Coordination','200+ Employee Training','Management Briefings','Cross-functional Coordination']);

  // ── WHY THIS ROLE ─────────────────────────────────────────────────────────
  if (job.why && job.why.trim() !== '') { // Only show if why is not empty
    sectionHeader('Why This Role');
    // Convert why from 2nd person to 1st
    let whyText = (job.why||'').replace(/\byourself\b/gi,'myself').replace(/\byour\b/gi,'my').replace(/\byou\b/gi,'I')
      .replace(/\byou've\b/gi,"I've").replace(/\byou're\b/gi,"I'm").replace(/\byours\b/gi,'mine')
      .replace(/\bon the (list|board)\.?/gi, '')
      .replace(/\bthis is the\b.* applicable job/gi, '').trim();
    const whySentences = whyText.split('.').filter(s=>s.trim()).slice(0,2);
    bodyText(whySentences.join('. ').trim() + '.');
  }

  // ── GP EXPERIENCE ─────────────────────────────────────────────────────────
  sectionHeader('Professional Experience');

  const gpTitle = 'Environmental Coordinator | Georgia-Pacific (Koch Industries)';
  
  const bulletsPool = {
    compliance: [
      'Owns five active regulatory programs across two plywood and lumber facilities — Title V air, SPCC, SWPPP, RCRA hazardous waste, and stormwater — with no major violations under any of them',
      'Manages Title V air permit compliance including PCWP-MACT and BMACT standards; coordinates permit deviations, compliance certifications, and NCDEQ correspondence',
      'Runs monthly water quality sampling under NCMA certification; maintains SWPPP documentation and stormwater BMP inspections for both facilities',
      'Conducts regular compliance audits across SPCC, stormwater, hazardous waste, and air programs; manages corrective actions through to closure'
    ],
    data: [
      'Built a Power BI compliance analytics dashboard from scratch — used across two facilities by 600+ employees to track KPIs, inspection status, and corrective actions in real time',
      'Automated roughly 80% of manual department reporting using Python and Power Automate, saving the team about 30% of monthly working hours'
    ],
    ai: [
      'Deployed AI agents for regulatory research — cuts permit condition lookup time from hours to minutes and runs in a live production environment',
      'Uses GitHub Copilot to build and maintain in-house automation tools in production, without external IT support'
    ],
    impl: [
      'Led the rollout of the company\'s in-house inspection application — assisted with development and testing, produced training materials, and trained 100+ environmental managers nationally'
    ],
    always: [
      'Runs weekly environmental compliance training for new plant hires and works directly with plant management on facility operations'
    ]
  };

  let selectedBullets = [];
  if (isImpl) {
    selectedBullets = [bulletsPool.impl[0], ...bulletsPool.compliance.slice(0,2), ...bulletsPool.data, bulletsPool.always[0]];
  } else if (isAI) {
    selectedBullets = [...bulletsPool.ai, ...bulletsPool.data, bulletsPool.always[0]];
  } else if (isData) {
    selectedBullets = [...bulletsPool.data, bulletsPool.compliance[0], bulletsPool.always[0]];
  } else if (isGIS) {
    selectedBullets = [bulletsPool.compliance[2], ...bulletsPool.compliance.slice(0,2), bulletsPool.always[0]];
  } else if (isEHS) {
    selectedBullets = [...bulletsPool.compliance, bulletsPool.always[0]];
  } else {
    selectedBullets = [
      'Owns Title V air, SPCC, SWPPP, RCRA hazardous waste, stormwater, and water quality programs across two manufacturing facilities — no major violations',
      'Built Power BI compliance dashboard (600+ users), automated 80% of manual tasks with Python and Power Automate',
      'Deployed AI agents for regulatory research; led nationwide inspection app rollout and trained 100+ managers',
      bulletsPool.always[0]
    ];
  }

  drawUnbreakableJobBlock(gpTitle, 'Dudley, NC | June 2024 – Present', selectedBullets, 2);

  // ── QORVO ────────────────────────────────────────────────────────────────
  const qorvo1Bullets = [
    'Worked in the RF characterization lab running hardware tests on mobile chips — operated handlers, set up test routines, and logged results for the engineering team',
    'Learned Spotfire and built data visualization dashboards to help engineers track chip performance across test batches and flag outliers',
    'Got direct exposure to RF chip design, the cellular network stack, and device validation processes from early testing through production sign-off'
  ];
  drawUnbreakableJobBlock('Mobile Engineering Intern | Qorvo', 'Greensboro, NC | May 2022 – August 2022', qorvo1Bullets, 2);

  const qorvo2Bullets = [
    'Taught myself C# in the first few weeks and built an internal data parsing application — took Excel files from multiple engineers, cleaned and reformatted them for a downstream code generator used in chip characterization',
    'The tool went into regular production use and eliminated a manual, error-prone file prep step the team had been doing by hand',
    'Scoped, built, tested, and shipped the project independently — no prior C# experience, minimal guidance, first real software deliverable'
  ];
  drawUnbreakableJobBlock('Mobile Engineering Intern | Qorvo', 'Greensboro, NC | May 2021 – August 2021', qorvo2Bullets, 2);

  // ── FERTIVO ──────────────────────────────────────────────────────────────
  const fertivoBullets = [
    'Co-founded a startup building a trash can that converted organic waste into fertilizer — developed the concept, assembled the founding team, and drove product direction from idea through prototype',
    'Led weekly team meetings, coordinated hardware prototyping and business development in parallel, and reached out to competitors to map the market landscape',
    'Planned multiple revenue streams: direct consumer sales, commercial facility partnerships, and municipal solid waste contracts'
  ];
  drawUnbreakableJobBlock('Co-Founder and CEO | Fertivo', 'Cary, NC | September 2017 – April 2018', fertivoBullets, 2);

  // ── LYFEWARE ─────────────────────────────────────────────────────────────
  sectionHeader('Personal Projects');
  const lyfeWareBullets = [
    'Engineered and deployed a centralized "Sign in with LyfeWare" SSO authentication portal for a multi-app ecosystem (Pantry, HomeBase, Vinyl), leveraging React, Vite, and Supabase Auth with Google and Apple OAuth for seamless cross-platform session persistence and data portability.',
    'Engineered a cross-app real-time signal bus using PostgreSQL triggers and Supabase Realtime — e.g., automatically triggering high-BPM playlists in Vinyl when a deep-clean chore is started in HomeBase',
    'Designed a unified multi-tenant Supabase schema with Row Level Security policies handling shared household data across grocery lists, expenses, and analytics',
    'Orchestrated a CI/CD pipeline with TypeScript for end-to-end type safety, Netlify for web hosting, and Expo for cross-platform mobile deployment'
  ];
  drawUnbreakableJobBlock('LyfeWare — Integrated Lifestyle Ecosystem', 'Solo Build | 2024 – Present', lyfeWareBullets, 2);

  // ── EDUCATION ────────────────────────────────────────────────────────────
  checkY(90); // Ensure enough space for the entire education section header + first entry
  sectionHeader('Education');

  const bsBullets = ['Minor in Economics'];
  drawUnbreakableJobBlock('B.S. Environmental Science | North Carolina State University', 'Raleigh, NC | Graduated August 2024', bsBullets);

  const capstoneBullets = [
    'Built Natural Resources Management Plans to solve issues, such as forest fire prevention, optimal land-use allocation, and watershed management strategies',
    'Collaborated with a team to analyze how Hofmann Forest in NC can be better managed in a both more environmentally sustainable as well as more profitable way',
    'Completed a "Business as Usual" assessment of various environments, such as watersheds, forests, and farmland, to establish baseline impact metrics',
    'Performed two comprehensive case studies (one independent and one with a group) on how respective environmental issues can be addressed',
    'Utilized advanced Excel modeling to generate numerous reports, including sustainability reports, economic analysis, and data-driven assessments'
  ];
  drawUnbreakableJobBlock('Capstone Project: Natural Resource Management', 'Raleigh, NC | January 2024 – May 2024', capstoneBullets);

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
    window.RESUMES[String(job.id)] = { name: fname, b64 };
    return { name: fname, b64 };
  } catch(e) {
    console.error('Resume build failed:', e);
    return null;
  }
}
