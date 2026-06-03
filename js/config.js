// ── CONFIG ─────────────────────────────────────────────────────────────────────
const SB_URL = 'https://zbzuoovbqhlywzbamlhk.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpienVvb3ZicWhseXd6YmFtbGhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Mjc5OTYsImV4cCI6MjA5NDEwMzk5Nn0.qhhBJYQDf3fsx44-ZI7H8Gq060KcrM88y-jSpIVoX4Q';
const ROW_ID = 'omkar_apte_jobs';
const SB_READ  = { 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY, 'Accept':'application/json' };
const SB_WRITE = { 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY, 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates' };