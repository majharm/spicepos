import assert from "node:assert/strict";
import test from "node:test";
import { foldSyncRows } from "./sync-status.js";

test("every business is listed and shops with waiting bills come first", () => {
  const rows = foldSyncRows(
    [
      { id: "b1", name: "Alpha" },
      { id: "b2", name: "Beta" },
      { id: "b3", name: "Gamma" },
    ],
    [
      { business_id: "b2", pending_count: 2, conflict_count: 1, last_error: "Unknown item", reported_at: "2026-11-18 01:00:00" },
      { business_id: "b2", pending_count: 1, conflict_count: 0, last_error: "", reported_at: "2026-11-18 01:10:00" },
    ],
  );
  assert.deepEqual(rows.map((row) => row.name), ["Beta", "Alpha", "Gamma"]);
  assert.equal(rows[0].devices, 2);
  assert.equal(rows[0].pending, 3);
  assert.equal(rows[0].conflicts, 1);
  assert.equal(rows[0].lastError, "Unknown item");
  assert.equal(rows[0].reportedAt, "2026-11-18 01:10:00");
  assert.equal(rows[1].devices, 0);
  assert.equal(rows[1].reportedAt, null);
});
