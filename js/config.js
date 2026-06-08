// ── CONFIG ─────────────────────────────────────────────────────────────────────
window.SB_URL = 'https://zbzuoovbqhlywzbamlhk.supabase.co';
window.SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpienVvb3ZicWhseXd6YmFtbGhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Mjc5OTYsImV4cCI6MjA5NDEwMzk5Nn0.qhhBJYQDf3fsx44-ZI7H8Gq060KcrM88y-jSpIVoX4Q';
window.ROW_ID = 'omkar_apte_jobs';
window.SB_READ  = { 'apikey':window.SB_KEY, 'Authorization':'Bearer '+window.SB_KEY, 'Accept':'application/json' };
window.SB_WRITE = { 'apikey':window.SB_KEY, 'Authorization':'Bearer '+window.SB_KEY, 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates' };

window.RESUME_BASE_URL = 'https://zbzuoovbqhlywzbamlhk.supabase.co/storage/v1/object/public/resumes/';

// ── INITIAL STATE ────────────────────────────────────────────────────────────
// Initializing these here ensures they exist before ui.js or init.js try to use them.
window.RESUMES = {};
window.COVER_LETTERS = {};
window._clGenerating = {};
window.resumesLoaded = false;
window.resumeLoadError = null;

window.statuses = {};
window.flags = {};
window.coverLetters = {};
window.expanded = null;
window.activeTab = 'why';
window.sortBy = 'fit';
window.filters = { batch: 'all', status: 'all', flag: 'all', cl: 'all' };

window.saveTimer = null;
window.sbReady = false;
window.searchQuery = '';
window._autoFetching = {};
window.JD_DATA = {};      // {[jobId]: {accessible, atsScore, tags, fit, why, resume_angle, pay}}