import { describe, it } from "mocha";
import assert from "node:assert/strict";
import * as skir from "./skir-client.js";

function binary(...payload: number[]): ArrayBuffer {
  return Uint8Array.from([115, 107, 105, 114, ...payload]).buffer;
}

function structSerializer(fields: skir.Json[]): skir.Serializer<skir.Json> {
  return skir.parseTypeDescriptorFromJson({
    type: { kind: "record", value: "test.skir:Strings" },
    records: [{ kind: "struct", id: "test.skir:Strings", fields }],
  }) as unknown as skir.Serializer<skir.Json>;
}

describe("string serialization consistency", () => {
  const serializer = skir.primitiveSerializer("string");
  const stringType: skir.Json = { kind: "primitive", value: "string" };
  const struct = structSerializer([
    { name: "text", number: 0, type: stringType },
    {
      name: "optional",
      number: 1,
      type: { kind: "optional", value: stringType },
    },
    {
      name: "items",
      number: 2,
      type: { kind: "array", value: { item: stringType } },
    },
  ]);

  it("preserves leading BOMs in standalone strings", () => {
    for (const string of ["\uFEFF", "\uFEFF\uFEFFtext", "\uFEFF\uD83D\uDE00"]) {
      assert.equal(
        serializer.fromBytes(serializer.toBytes(string).toBuffer()),
        string,
      );
    }
  });

  it("round-trips defined string, optional string and string array fields across formats", () => {
    for (const text of [
      "",
      "\uFEFF",
      "\uFEFF\uFEFFtext",
      "a\uD83D\uDE00z",
      "\uFFFF",
      "é😀".repeat(5000),
    ]) {
      const input = struct.fromJson([text, text, [text]]);
      const dense: skir.Json = [text, text, [text]];
      const readable: skir.Json =
        text === ""
          ? { optional: text, items: [text] }
          : { text, optional: text, items: [text] };
      assert.deepEqual(struct.toJson(input), dense);
      assert.deepEqual(struct.toJson(input, "readable"), readable);
      assert.deepEqual(
        struct.toJson(struct.fromBytes(struct.toBytes(input).toBuffer())),
        dense,
      );
      assert.deepEqual(
        struct.toJson(struct.fromJsonCode(struct.toJsonCode(input))),
        dense,
      );
      assert.deepEqual(struct.toJson(struct.fromJson(readable)), dense);
      for (const source of [
        dense,
        readable,
        struct.toBytes(input).toBuffer(),
      ]) {
        assert.deepEqual(
          struct.typeDescriptor.transform(source, "dense"),
          dense,
        );
        assert.deepEqual(
          struct.typeDescriptor.transform(source, "readable"),
          readable,
        );
        const bytes = struct.typeDescriptor.transform(source, "bytes");
        assert.ok(bytes instanceof ArrayBuffer);
        assert.deepEqual(struct.toJson(struct.fromBytes(bytes)), dense);
      }
    }
  });

  it("rejects malformed UTF-8 in standalone and defined string fields", () => {
    for (const payload of [
      [243, 1, 255],
      [243, 2, 192, 175],
      [243, 3, 237, 160, 128],
    ]) {
      assert.throws(() => serializer.fromBytes(binary(...payload)));
      assert.throws(() => struct.fromBytes(binary(247, ...payload)));
    }
  });

  it("rejects invalid string tags, lengths and truncated payloads", () => {
    for (const payload of [
      [247, 1, 65],
      [243, 3, 65],
      [243, 235, 255],
      [243, 234, 0, 0, 0, 0, 0, 0, 0, 0],
      [243, 241, 0, 0, 0, 0, 0, 0, 248, 63],
    ]) {
      assert.throws(() => serializer.fromBytes(binary(...payload)));
      assert.throws(() => struct.fromBytes(binary(247, ...payload)));
    }
  });

  it("checks UTF-8 in skipped fields as well as defined fields", () => {
    const empty = structSerializer([]);
    for (const keep of [undefined, "keep-unrecognized-values"] as const) {
      assert.throws(() => empty.fromBytes(binary(247, 243, 1, 255), keep));
      assert.throws(() => empty.fromBytes(binary(247, 243, 3, 65), keep));
    }
  });

  it("validates defined string fields before omitting defaults", () => {
    const writer = struct as skir.Serializer<unknown>;
    for (const text of [null, false, 0, "\uD800z"]) {
      const input = { text, optional: null, items: [] };
      assert.throws(() => writer.toJson(input));
      assert.throws(() => writer.toJson(input, "readable"));
      assert.throws(() => writer.toBytes(input));
    }
    for (const text of ["\uD800z", "\uDC00"]) {
      for (const json of [[text], ["", text], ["", null, [text]]]) {
        assert.throws(() => struct.fromJson(json));
      }
    }
  });
});
