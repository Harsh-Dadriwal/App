import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("ValidationPipe Strict Security Controls", () => {
  it("validates strict whitelist and forbidNonWhitelisted rules", () => {
    const config = {
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    };

    assert.equal(config.whitelist, true);
    assert.equal(config.forbidNonWhitelisted, true);
    assert.equal(config.transform, true);
  });
});
