import { createClient } from '@supabase/supabase-js';

// Same project + anon key as the marketing pages (login/account) and the iOS
// app. The anon key is public by design — access is gated by Postgres RLS.
export const SUPABASE_URL = 'https://jatxquhxqxrnjbmjoqna.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphdHhxdWh4cXhybmpibWpvcW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTAyMTksImV4cCI6MjA5NjE4NjIxOX0.cx2qMXzadunoJtq82FT-UYAstFZ_ym3FAnIpHkzgzdM';

// Default storage key (sb-<ref>-auth-token) matches the login/account pages,
// so one sign-in covers the whole site.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
