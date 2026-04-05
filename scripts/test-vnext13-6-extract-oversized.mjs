#!/usr/bin/env node
import assert from "node:assert/strict";
import { extractMvpFileFromBuffer } from "../src/features/slackFileIntake.js";

const buf = Buffer.alloc(2000, 65);
const r = await extractMvpFileFromBuffer({
  buffer: buf,
  filename: "big.txt",
  mimetype: "text/plain",
  maxBytes: 1000,
});
assert.equal(r.ok, false);
assert.equal(r.errorCode, "oversized");

console.log("ok: vnext13_6_extract_oversized");
