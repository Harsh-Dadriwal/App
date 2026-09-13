import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { getCorsOptions } from "./cors.config";

describe("CORS Security Controls", () => {
  test("allows requests with no origin header (mobile apps, server calls)", () => {
    const corsOptions = getCorsOptions();
    let resultErr: Error | null = null;
    let allowed: boolean | undefined = false;

    corsOptions.origin(undefined, (err, allow) => {
      resultErr = err;
      allowed = allow;
    });

    assert.equal(resultErr, null);
    assert.equal(allowed, true);
  });

  test("allows configured production origin", () => {
    const corsOptions = getCorsOptions();
    let resultErr: Error | null = null;
    let allowed: boolean | undefined = false;

    corsOptions.origin("https://app-rho-one-49.vercel.app", (err, allow) => {
      resultErr = err;
      allowed = allow;
    });

    assert.equal(resultErr, null);
    assert.equal(allowed, true);
  });

  test("rejects unapproved third-party origin", () => {
    const corsOptions = getCorsOptions();
    let resultErr: Error | null = null;
    let allowed: boolean | undefined = false;

    corsOptions.origin("https://malicious-attacker.com", (err, allow) => {
      resultErr = err;
      allowed = allow;
    });

    assert.notEqual(resultErr, null);
    assert.match((resultErr as any)?.message ?? "", /CORS policy rejection/);
    assert.equal(allowed, undefined);
  });
});
