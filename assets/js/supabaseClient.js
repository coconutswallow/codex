/**
 * supabase-config.js
 * Reusable asset for the Supabase connection
 *
 * Note the Supabase key is the anon key ("publishable" key, safe for public view) as long as role-level security is applied in conjuction.
 * (i.e. no need for secret keys in client-side code - this key is designed to be public)
 * Location: \assets\js\supabaseClient.js
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';


const supabaseUrl = 'https://kcbvryvmcbfpsibxthhn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjYnZyeXZtY2JmcHNpYnh0aGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTk1MzIsImV4cCI6MjA3OTE3NTUzMn0.9h81WHRCJfhouquG9tPHliY_5ezAbzKeDoLtGSARo5M';

export const supabase = createClient(supabaseUrl, supabaseKey);