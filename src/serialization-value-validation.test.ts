import { describe, it } from "mocha";
import assert from "node:assert/strict";
import * as skir from "./skir-client.js";

function binary(...payload: number[]): ArrayBuffer {
  return Uint8Array.from([115, 107, 105, 114, ...payload]).buffer;
}

describe("serialization value validation", () => {
  describe("hexadecimal input", () => {
    it("rejects malformed hex without truncation or partial parsing", () => {
      for (const hex of ["abc", "0g", "g0", " 0", "0\n", "0x"]) {
        assert.throws(() => skir.ByteString.fromBase16(hex));
        assert.throws(() =>
          skir.primitiveSerializer("bytes").fromJson("hex:" + hex),
        );
      }
      assert.equal(skir.ByteString.fromBase16("00aBFF").toBase16(), "00abff");
      assert.equal(skir.ByteString.fromBase16("").byteLength, 0);
    });
  });

  describe("numeric rules", () => {
    it("canonicalizes float zeros, including float32 underflow", () => {
      for (const primitive of ["float32", "float64"] as const) {
        const serializer = skir.primitiveSerializer(primitive);
        const inputs = primitive === "float32" ? [-0, -1e-50, 1e-50] : [-0];
        for (const input of inputs) {
          assert.equal(serializer.fromJson(input), 0);
          assert.equal(serializer.toJson(input), 0);
          assert.equal(
            serializer.fromBytes(serializer.toBytes(input).toBuffer()),
            0,
          );
          assert.deepEqual(serializer.toBytes(input).toBuffer(), binary(0));
        }
      }
    });

    it("validates numeric struct fields before omitting defaults", () => {
      for (const primitive of [
        "bool",
        "int32",
        "int64",
        "hash64",
        "timestamp",
      ] as const) {
        const serializer = skir.parseTypeDescriptorFromJson({
          type: { kind: "record", value: "test.skir:Record" },
          records: [
            {
              kind: "struct",
              id: "test.skir:Record",
              fields: [
                {
                  name: "value",
                  number: 0,
                  type: { kind: "primitive", value: primitive },
                },
              ],
            },
          ],
        }) as unknown as skir.Serializer<unknown>;
        for (const input of [{ value: null }, { value: "" }]) {
          assert.throws(() => serializer.toJson(input));
          assert.throws(() => serializer.toJson(input, "readable"));
          assert.throws(() => serializer.toBytes(input));
        }
      }
    });
    for (const [input, expected] of [
      [-3.8, -3],
      [2147483648, -2147483648],
      [NaN, 0],
      [Infinity, 0],
      [-2147483649, 2147483647],
    ] as const) {
      it(`normalizes int32 ${input} identically in JSON and binary`, () => {
        const serializer = skir.primitiveSerializer("int32");
        assert.equal(serializer.toJson(input), expected);
        assert.equal(
          serializer.fromBytes(serializer.toBytes(input).toBuffer()),
          expected,
        );
      });
    }

    for (const [input, expected] of [
      [0.1, 0.10000000149011612],
      [1e40, Infinity],
      [1111111111, 1111111168],
    ] as const) {
      it(`normalizes float32 ${input} on every path`, () => {
        const serializer = skir.primitiveSerializer("float32");
        assert.equal(serializer.fromJson(input), expected);
        assert.equal(serializer.fromJson(serializer.toJson(input)), expected);
        assert.equal(
          serializer.fromBytes(serializer.toBytes(input).toBuffer()),
          expected,
        );
        assert.equal(
          serializer.fromBytes(
            skir.primitiveSerializer("float64").toBytes(input).toBuffer(),
          ),
          expected,
        );
      });
    }

    for (const primitive of ["int64", "hash64"] as const) {
      it(`clamps ${primitive} on reading as well as writing`, () => {
        const serializer = skir.primitiveSerializer(primitive);
        const min =
          primitive === "int64" ? BigInt("-9223372036854775808") : BigInt(0);
        const max =
          primitive === "int64"
            ? BigInt("9223372036854775807")
            : BigInt("18446744073709551615");
        assert.equal(serializer.fromJson((min - BigInt(1)).toString()), min);
        assert.equal(serializer.fromJson((max + BigInt(1)).toString()), max);
        const bytes =
          primitive === "hash64"
            ? skir.primitiveSerializer("int64").toBytes(BigInt(-1)).toBuffer()
            : skir
                .primitiveSerializer("hash64")
                .toBytes(BigInt("18446744073709551615"))
                .toBuffer();
        assert.equal(
          serializer.fromBytes(bytes),
          primitive === "hash64" ? min : max,
        );
        for (const input of [-3.8, 3.8]) {
          assert.equal(
            serializer.fromJson(input),
            serializer.fromBytes(
              skir.primitiveSerializer("float64").toBytes(input).toBuffer(),
            ),
          );
        }
      });
    }

    it("rejects nonfinite boolean numbers in both formats", () => {
      const serializer = skir.primitiveSerializer("bool");
      for (const input of [NaN, Infinity, -Infinity]) {
        assert.throws(() => serializer.fromJson(input));
        assert.throws(() => serializer.fromJson(input.toString()));
        assert.throws(() =>
          serializer.fromBytes(
            skir.primitiveSerializer("float64").toBytes(input).toBuffer(),
          ),
        );
      }
    });

    it("converts finite numbers to booleans in JSON and binary", () => {
      const serializer = skir.primitiveSerializer("bool");
      for (const input of [0, -0, -1, 888888, 2.5, -2.5, 1e-30, 1e20]) {
        assert.equal(serializer.fromJson(input), input !== 0);
        assert.equal(serializer.fromJson(input.toString()), input !== 0);
        assert.equal(serializer.fromJsonCode(input.toString()), input !== 0);
        for (const primitive of ["float32", "float64"] as const) {
          assert.equal(
            serializer.fromBytes(
              skir.primitiveSerializer(primitive).toBytes(input).toBuffer(),
            ),
            input !== 0,
          );
        }
      }
    });

    it("rejects invalid numeric JSON instead of coercing objects and garbage", () => {
      for (const primitive of [
        "bool",
        "int32",
        "int64",
        "hash64",
        "float32",
        "float64",
        "timestamp",
      ] as const) {
        const serializer = skir.primitiveSerializer(primitive);
        for (const json of [{}, [], null, "garbage", "", " "]) {
          assert.throws(() => serializer.fromJson(json));
        }
      }
      const serializer = skir.primitiveSerializer("timestamp");
      for (const json of [
        { unix_millis: "2" },
        { unix_millis: null },
        { unix_millis: false },
      ]) {
        assert.throws(() => serializer.fromJson(json));
      }
      assert.equal(serializer.fromJson({ unix_millis: 2 }).unixMillis, 2);
    });

    it("rejects wrong writer types in both formats", () => {
      for (const primitive of [
        "bool",
        "int32",
        "int64",
        "hash64",
        "float32",
        "float64",
        "timestamp",
      ] as const) {
        const serializer = skir.primitiveSerializer(
          primitive,
        ) as skir.Serializer<unknown>;
        for (const input of ["2", {}, null]) {
          assert.throws(() => serializer.toJson(input));
          assert.throws(() => serializer.toBytes(input));
        }
      }
    });
  });
});
