
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://orkfiludwzrasotntrgs.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_Xpd7Nuo7U6-GXHsf4ptEWA_OWoIQhBT';

export const supabase = createClient(supabaseUrl, supabaseKey);
