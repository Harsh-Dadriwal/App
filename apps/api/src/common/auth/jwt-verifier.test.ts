import assert from "node:assert/strict";
import test from "node:test";
import { createSign, generateKeyPairSync } from "crypto";
import { SupabaseJwtVerifier } from "./jwt-verifier";

function signToken(privateKey: any, kid: string, claims: Record<string, unknown>, alg = "ES256") {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode({ alg, typ: "JWT", kid })}.${encode(claims)}`;
  const signature = createSign("SHA256").update(signingInput).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function setup() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "key-1", alg: "ES256" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })) as typeof fetch;
  return { privateKey, restore: () => (globalThis.fetch = originalFetch) };
}

test("accepts a valid ES256 token and returns its subject", async () => {
  const { privateKey, restore } = setup();
  try {
    const verifier = new SupabaseJwtVerifier("https://example.supabase.co");
    const token = signToken(privateKey, "key-1", { sub: "user-1", exp: Math.floor(Date.now() / 1000) + 600 });
    assert.equal((await verifier.verify(token))?.sub, "user-1");
  } finally {
    restore();
  }
});

test("rejects expired, tampered and unknown-key tokens", async () => {
  const { privateKey, restore } = setup();
  try {
    const verifier = new SupabaseJwtVerifier("https://example.supabase.co");
    const future = Math.floor(Date.now() / 1000) + 600;

    const expired = signToken(privateKey, "key-1", { sub: "user-1", exp: Math.floor(Date.now() / 1000) - 5 });
    assert.equal(await verifier.verify(expired), null);

    const good = signToken(privateKey, "key-1", { sub: "user-1", exp: future });
    const [header, , signature] = good.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin", exp: future })).toString("base64url");
    assert.equal(await verifier.verify(`${header}.${forgedPayload}.${signature}`), null);

    const otherKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    assert.equal(await verifier.verify(signToken(otherKey, "key-1", { sub: "user-1", exp: future })), null);
    assert.equal(await verifier.verify(signToken(privateKey, "missing-kid", { sub: "user-1", exp: future })), null);
  } finally {
    restore();
  }
});

test("returns null for symmetric (HS256) tokens so the caller can fall back", async () => {
  const verifier = new SupabaseJwtVerifier("https://example.supabase.co");
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-1" })}.abc`;
  assert.equal(await verifier.verify(token), null);
});
