// ── BULK RESUME GENERATION UTILITY ──────────────────────────────────────────
// Instructions: Copy/Paste this into the browser console while on your dashboard.
// It will generate resumes for all ALL_JOBS and download them as resumes_N.json files.

async function runBulkResumeGeneration() {
  const CHUNK_SIZE = 35; // Splitting 384 jobs into ~11 manageable chunks
  const total = ALL_JOBS.length;
  console.log(`🚀 Starting bulk generation for ${total} jobs...`);

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = ALL_JOBS.slice(i, i + CHUNK_SIZE);
    const chunkIndex = Math.floor(i / CHUNK_SIZE);
    const chunkData = {};

    console.log(`📦 Processing Chunk ${chunkIndex} (${i} to ${Math.min(i + CHUNK_SIZE, total)})...`);

    for (const job of chunk) {
      // Use the specific 'why' field to create a uniquely tailored ATS-friendly summary
      // If 'why' is missing, use the Master Document Fallback
      const summary = job.why 
        ? `Environmental professional with expertise in ${job.tags.slice(0,4).join(', ')}. ${job.why.split('.').slice(0,2).join('.')}. B.S. Environmental Science, NC State.`
        : `Environmental compliance professional with two years owning Title V, SPCC, SWPPP, RCRA, and stormwater programs at two manufacturing facilities, with zero major violations. Builds production-grade data tools (Power BI, Python, AI agents). B.S. Environmental Science, NC State.`;
      const result = await buildAndStoreResume(job, summary);
      if (result) {
        // The buildAndStoreResume function puts data into the global RESUMES object
        chunkData[String(job.id)] = RESUMES[String(job.id)];
      }
    }

    // Trigger download of the chunk JSON
    const blob = new Blob([JSON.stringify(chunkData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resumes_${chunkIndex}.json`;
    a.click();
    console.log(`✅ Chunk ${chunkIndex} downloaded.`);
    await new Promise(r => setTimeout(r, 500)); // Brief pause to prevent browser hang
  }
  console.log("🏁 All chunks generated. Upload these files to your Resume Storage folder.");
}