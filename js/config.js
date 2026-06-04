// ── CONFIG ─────────────────────────────────────────────────────────────────────
export const SB_URL = 'https://zbzuoovbqhlywzbamlhk.supabase.co';
export const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpienVvb3ZicWhseXd6YmFtbGhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Mjc5OTYsImV4cCI6MjA5NDEwMzk5Nn0.qhhBJYQDf3fsx44-ZI7H8Gq060KcrM88y-jSpIVoX4Q';
export const ROW_ID = 'omkar_apte_jobs';
export const SB_READ  = { 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY, 'Accept':'application/json' };
export const SB_WRITE = { 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY, 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates' };

export const RESUME_BASE_URL = 'https://zbzuoovbqhlywzbamlhk.supabase.co/storage/v1/object/public/resumes/';

// ── GLOBAL ATTACHMENTS ────────────────────────────────────────────────────────
// Ensures these are visible to non-module scripts like persistence.js and api.js
window.SB_URL = SB_URL;
window.SB_KEY = SB_KEY;
window.ROW_ID = ROW_ID;
window.SB_READ = SB_READ;
window.SB_WRITE = SB_WRITE;
window.RESUME_BASE_URL = RESUME_BASE_URL;