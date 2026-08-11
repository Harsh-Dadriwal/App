import { Injectable, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient;
  private readonly readClient: SupabaseClient;
  private readonly url: string;
  private readonly anonKey: string;
  private readonly readUrl: string;
  private readonly readAnonKey: string;

  constructor() {
    const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const rawAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!rawUrl || !rawAnonKey) {
      this.logger.warn(
        "SUPABASE_URL or SUPABASE_ANON_KEY not set. Operating with fallback placeholder client."
      );
    }

    const url = rawUrl || "https://placeholder.supabase.co";
    const anonKey = rawAnonKey || "placeholder-anon-key";
    const readUrl = process.env.SUPABASE_READ_URL || process.env.NEXT_PUBLIC_SUPABASE_READ_URL || url;
    const readAnonKey =
      process.env.SUPABASE_READ_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_READ_ANON_KEY ||
      anonKey;

    this.url = url;
    this.anonKey = anonKey;
    this.readUrl = readUrl;
    this.readAnonKey = readAnonKey;

    this.client = createClient(url, serviceRoleKey || anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    this.readClient = createClient(readUrl, serviceRoleKey || readAnonKey, {
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
