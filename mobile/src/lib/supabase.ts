import {
  createNativeReadSupabaseClient,
  createNativeSupabaseClient,
  isSupabaseConfigured
} from "@mahalaxmi/core/supabase/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

export { isSupabaseConfigured };

export const supabase = createNativeSupabaseClient(AsyncStorage);
export const supabaseRead = createNativeReadSupabaseClient(AsyncStorage) ?? supabase;
