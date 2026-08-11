import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FirebaseAuthService, firebaseAdminWrapper } from "./firebase-auth.service";
import * as jwt from "jsonwebtoken";

// Override wrapper functions for testing
firebaseAdminWrapper.getApps = () => [];
firebaseAdminWrapper.initializeApp = () => ({} as any);
firebaseAdminWrapper.cert = () => ({} as any);
firebaseAdminWrapper.verifyIdToken = async (token: string) => {
  if (token === "valid-token") {
    return { phone_number: "+919876543210" } as any;
  }
  throw new Error("Invalid token mock error");
};

describe("FirebaseAuthService", () => {
  it("exchanges valid firebase token for signed Supabase JWT", async () => {
    const mockSupabase = {
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "profile-123",
                  auth_user_id: "auth-123",
                  phone: "+919876543210",
                  role: "customer",
                  full_name: "Harsh"
                },
                error: null
              })
            })
          })
        })
      })
    };

    const service = new FirebaseAuthService(mockSupabase as any);
    (service as any).initialized = true; // prevent actual init

    const result = await service.exchangeFirebaseTokenForSupabaseSession("valid-token");
    assert.ok(result.session.access_token);
    assert.equal(result.session.user.phone, "+919876543210");
    assert.equal(result.session.user.id, "auth-123");

    // Verify token payload
    const decoded = jwt.decode(result.session.access_token) as any;
    assert.equal(decoded.sub, "auth-123");
    assert.equal(decoded.phone, "+919876543210");
    assert.equal(decoded.user_metadata.role, "customer");
  });
});
