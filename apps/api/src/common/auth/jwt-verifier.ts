import { createPublicKey, createVerify, type KeyObject } from "crypto";

type Jwk = { kid?: string; kty: string; alg?: string; [key: string]: unknown };

export type VerifiedClaims = { sub: string; exp?: number; [key: string]: unknown };

const JWKS_TTL_MS = 10 * 60 * 1000;

/**
 * Checks a Supabase access token on this server instead of asking Supabase Auth over the
 * network on every request. Works for projects that sign with an asymmetric key (ES256 /
 * RS256); returns null for anything else so the caller can fall back to `auth.getUser`.
 */
export class SupabaseJwtVerifier {
  private keys = new Map<string, KeyObject>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(private readonly supabaseUrl: string) {}

  private async loadKeys() {
    if (!this.loading) {
      this.loading = (async () => {
        const response = await fetch(`${this.supabaseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`);
        if (!response.ok) throw new Error(`JWKS request failed (${response.status})`);
        const body = (await response.json()) as { keys?: Jwk[] };
        const next = new Map<string, KeyObject>();
        for (const jwk of body.keys ?? []) {
          if (jwk.kid && (jwk.kty === "EC" || jwk.kty === "RSA")) {
            next.set(jwk.kid, createPublicKey({ key: jwk as any, format: "jwk" }));
          }
        }
        this.keys = next;
        this.loadedAt = Date.now();
      })().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async getKey(kid: string) {
    if (Date.now() - this.loadedAt > JWKS_TTL_MS || !this.keys.has(kid)) {
      // An unknown kid right after a key rotation also lands here, so refresh at most once.
      if (!this.keys.has(kid) && Date.now() - this.loadedAt < 30_000 && this.loadedAt) return null;
      await this.loadKeys();
    }
    return this.keys.get(kid) ?? null;
  }

  async verify(token: string): Promise<VerifiedClaims | null> {
    try {
      const [headerPart, payloadPart, signaturePart] = token.split(".");
      if (!headerPart || !payloadPart || !signaturePart) return null;

      const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
      if (!header.kid || (header.alg !== "ES256" && header.alg !== "RS256")) return null;

      const key = await this.getKey(header.kid);
      if (!key) return null;

      const verifier = createVerify(header.alg === "ES256" ? "SHA256" : "RSA-SHA256");
      verifier.update(`${headerPart}.${payloadPart}`);
      const valid = verifier.verify(
        header.alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key,
        Buffer.from(signaturePart, "base64url")
      );
      if (!valid) return null;

      const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as VerifiedClaims;
      if (!claims.sub) return null;
      if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
      return claims;
    } catch {
      return null;
    }
  }
}
