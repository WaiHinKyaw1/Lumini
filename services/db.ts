
import { supabase } from './supabaseClient';
import { GenerationResult, ContentType } from '../types';

export const db = {
  getUser: async (userId: string) => {
    if (!supabase) return { data: null, error: { message: "Supabase not configured" } };
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    return { data, error };
  },

  createUser: async (userId: string) => {
    if (!supabase) return { data: null, error: { message: "Supabase not configured" } };

    const { data, error } = await supabase
      .from('users')
      .insert([{ id: userId, credits: 100, total_generated: 0 }])
      .select()
      .single();
    return { data, error };
  },

  updateUser: async (userId: string, credits: number, totalGenerated: number) => {
    if (!supabase) return { error: { message: "Supabase not configured" } };

    const { error } = await supabase
      .from('users')
      .update({ credits, total_generated: totalGenerated })
      .eq('id', userId);
    return { error };
  },

  // READ (List)
  getHistory: async (userId: string, type?: ContentType) => {
    if (!supabase) return { data: [], error: { message: "Supabase not configured" } };

    let query = supabase
      .from('generations')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;
    return { data: data as GenerationResult[] | null, error };
  },

  // READ (Single)
  getGeneration: async (id: string) => {
    if (!supabase) return { data: null, error: { message: "Supabase not configured" } };

    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .eq('id', id)
      .single();
    
    return { data: data as GenerationResult | null, error };
  },

  // CREATE
  addHistory: async (userId: string, result: GenerationResult) => {
    if (!supabase) return { error: { message: "Supabase not configured" } };

    const { error } = await supabase
      .from('generations')
      .insert([{
        id: result.id,
        user_id: userId,
        type: result.type, 
        prompt: result.prompt,
        content: result.content,
        url: result.url,
        timestamp: result.timestamp,
        metadata: result.metadata
      }]);
    return { error };
  },

  // UPDATE
  updateHistory: async (id: string, updates: Partial<Omit<GenerationResult, 'id' | 'timestamp' | 'type'>>) => {
    if (!supabase) return { error: { message: "Supabase not configured" } };

    const { error } = await supabase
      .from('generations')
      .update(updates)
      .eq('id', id);
    return { error };
  },

  // DELETE
  deleteHistory: async (id: string) => {
    if (!supabase) return { error: { message: "Supabase not configured" } };

    const { error } = await supabase
      .from('generations')
      .delete()
      .eq('id', id);
    return { error };
  }
};
