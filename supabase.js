const SUPABASE_URL = "https://bhrxryaeemliqjgkfijl.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("CampusConnect Supabase connection is ready!");