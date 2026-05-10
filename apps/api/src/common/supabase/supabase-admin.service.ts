import { Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseAdminService {
  private readonly client: SupabaseClient;
  private readonly readClient: SupabaseClient;
  private readonly url: string;
  private readonly anonKey: string;
  private readonly readUrl: string;
  private readonly readAnonKey: string;

  constructor() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const readUrl = process.env.SUPABASE_READ_URL || process.env.NEXT_PUBLIC_SUPABASE_READ_URL || url;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const readAnonKey =
      process.env.SUPABASE_READ_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_READ_ANON_KEY ||
      anonKey;

    if (!url || !anonKey) {
      throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured for the NestJS API.");
    }

    this.url = url;
    this.anonKey = anonKey;
    this.readUrl = readUrl || url;
    this.readAnonKey = readAnonKey || anonKey;

    this.client = createClient(url, serviceRoleKey || anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    this.readClient = createClient(this.readUrl, serviceRoleKey || this.readAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  getClient() {
    return this.client;
  }

  getReadClient() {
    return this.readClient;
  }

  createUserClient(accessToken: string) {
    return createClient(this.url, this.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    });
  }

  createReadUserClient(accessToken: string) {
    return createClient(this.readUrl, this.readAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    });
  }
}
