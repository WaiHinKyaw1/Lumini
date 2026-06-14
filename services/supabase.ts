
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const defaultUrl = 'https://orkfiludwzrasotntrgs.supabase.co';
const defaultAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ya2ZpbHVkd3pyYXNvdG50cmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0Njk0MzIsImV4cCI6MjA4NzA0NTQzMn0.RD33PXwNo80g0s-MfE9mXkkR-Xy_tSQ4A6m5xrE5o7s';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || defaultAnonKey;

export const isSupabaseConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'your-project-url.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key'
);

// Only initialize if keys are present to prevent "supabaseUrl is required" error
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl!, supabaseAnonKey!) 
  : null as unknown as SupabaseClient;

// Standard TypeScript interface for module log records
export interface GenerationRecord {
  id?: string;
  user_id: string;
  user_email: string;
  module: string;
  input_data: string;
  output_data: string;
  created_at?: string;
}

/**
 * Persists a user generation log to Supabase in real-time.
 * If the table does not exist or has schema issues, fails gracefully to preserve user experience.
 */
export async function logGeneration(
  userId: string,
  userEmail: string,
  module: string,
  inputData: any,
  outputData: any
): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) {
    console.warn('Supabase not configured or available for logging.');
    return false;
  }

  try {
    const record: GenerationRecord = {
      user_id: userId,
      user_email: userEmail,
      module: module,
      input_data: typeof inputData === 'string' ? inputData : JSON.stringify(inputData),
      output_data: typeof outputData === 'string' ? outputData : JSON.stringify(outputData),
    };

    const { error } = await supabase
      .from('user_records')
      .insert([record]);

    if (error) {
      console.warn('Supabase logging failed directly, trying secondary format:', error.message);
      // Try fallback schema structures or log to local console
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to insert log entry to Supabase:', err);
    return false;
  }
}

/**
 * Deletes a record from Supabase by its id.
 */
export async function deleteRecord(id: string): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) {
    return false;
  }
  try {
    const { error } = await supabase
      .from('user_records')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete from Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to delete log entry from Supabase:', err);
    return false;
  }
}

/**
 * Fetches log entries for a specific module or modules and user.
 */
export async function fetchModuleLogs(userId: string, modules: string | string[]): Promise<GenerationRecord[]> {
  if (!supabase || !isSupabaseConfigured) {
    return [];
  }
  try {
    let query = supabase
      .from('user_records')
      .select('*')
      .eq('user_id', userId);
    
    if (Array.isArray(modules)) {
      query = query.in('module', modules);
    } else {
      query = query.eq('module', modules);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch module logs:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Failed to fetch module logs:', err);
    return [];
  }
}

