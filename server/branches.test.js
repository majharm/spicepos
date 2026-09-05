import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("branches UI has add/edit, status, and login fields", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="br-id"/);
  assert.match(html, /id="br-login"/);
  assert.match(html, /id="br-pass"/);
  assert.match(html, /id="br-status"/);
  assert.match(html, /id="branch-save"/);
  const js = readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(js, /data-toggle-branch/);
  assert.match(js, /data-edit-branch/);
  assert.match(js, /\/api\/branches\/\$\{id\}/);
});

test("branch login is saved on Node and PHP APIs", () => {
  const tenant = readFileSync(path.join(root, "server/tenant.js"), "utf8");
  assert.match(tenant, /upsertBranchLogin/);
  assert.match(tenant, /branch_manager/);
  assert.match(tenant, /login_username/);
  const crud = readFileSync(path.join(root, "pos-crud.php"), "utf8");
  assert.match(crud, /pos_upsert_branch_login/);
  assert.match(crud, /branches\/\(\[\^\/\]\+\)/);
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  assert.match(core, /function pos_upsert_branch_login/);
  assert.match(core, /function pos_list_branches/);
});
