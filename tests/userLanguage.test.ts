import { test } from "node:test";
import assert from "node:assert/strict";
import { languageHeaders } from "../src/services/userLanguage.ts";

test("SuperOffice is asked for Norwegian, as the panel's own texts are", () => {
  assert.deepEqual(languageHeaders(), { "SO-Language": "no", "Accept-Language": "no" });
  assert.deepEqual(languageHeaders("sv"), { "SO-Language": "sv", "Accept-Language": "sv" });
});
