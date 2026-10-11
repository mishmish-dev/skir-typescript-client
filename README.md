[![npm](https://img.shields.io/npm/v/skir)](https://www.npmjs.com/package/skir)
[![build](https://github.com/gepheum/skir-typescript-client/workflows/Build/badge.svg)](https://github.com/gepheum/skir-typescript-client/actions)

# Skir TypeScript Client

Library imported from TypeScript code generated from skir files.

Install with:
```shell
npm i skir-client
```

String serializers reject unpaired Unicode surrogates on JSON reads and writes
and binary writes. Previously, JSON preserved them and binary encoding replaced
them with U+FFFD. Ordinary text and valid surrogate pairs are preserved.
Binary string decoding rejects malformed UTF-8, invalid string tags and lengths,
and truncated payloads. Leading BOM characters are preserved. These rules apply
to defined string fields, optional strings and array items; skipped string fields
also receive UTF-8 validation. String fields are validated before default omission.

See:

*   [skir](https://github.com/gepheum/skir): home of the skir compiler
*   [skir-typescript-gen](https://github.com/gepheum/skir-typescript-gen): skir to TypeScript code generator
*   [skir-typescript-example](https://github.com/gepheum/skir-typescript-example): example showing how to use skir's TypeScript code generator in a project
