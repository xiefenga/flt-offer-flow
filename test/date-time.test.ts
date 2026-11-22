import test from "node:test";
import assert from "node:assert/strict";

import { formatDateTime } from "../shared/date-time.mjs";

test("ISO timestamps display in local time with leading zeros; arrival stops at minutes", () => {
  const local = new Date(2026, 0, 2, 0, 4, 5, 123);
  assert.equal(formatDateTime(local.toISOString()), "2026-01-02 00:04:05");
  assert.equal(
    formatDateTime("2026-01-02T00:04:59", "minute"),
    "2026-01-02 00:04",
  );
  assert.equal(formatDateTime(null), "—");
});
