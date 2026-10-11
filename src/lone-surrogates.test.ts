import { describe, it } from "mocha";
import assert from "node:assert/strict";
import { primitiveSerializer } from "./skir-client.js";

describe("lone surrogate validation", () => {
  const serializer = primitiveSerializer("string");

  for (const string of ["\uD800z", "\uDC00", "\uD800\uD800"]) {
    it(`rejects ${JSON.stringify(string)} in JSON and binary writers and JSON readers`, () => {
      assert.throws(() => serializer.toBytes(string), /surrogate/i);
      assert.throws(() => serializer.toJson(string), /surrogate/i);
      assert.throws(() => serializer.fromJson(string), /surrogate/i);
      assert.throws(
        () => serializer.fromJsonCode(JSON.stringify(string)),
        /surrogate/i,
      );
    });
  }

  it("preserves ordinary text and paired surrogates", () => {
    for (const string of ["", "text", "a\uD83D\uDE00z", "\uD800\uDC00"]) {
      assert.equal(serializer.fromJson(serializer.toJson(string)), string);
      assert.equal(
        serializer.fromBytes(serializer.toBytes(string).toBuffer()),
        string,
      );
    }
  });
});
