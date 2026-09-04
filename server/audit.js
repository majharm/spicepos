import { createHash, randomBytes } from "node:crypto";
import { query } from "./db.js";
import { bid, branchId, authUser } from "./context.js";

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("hex");
}

export async function audit(action, details = {}, req) {
  try {
    const user = authUser();
    const businessId = (() => {
      try {
        return bid();
      } catch {
        return details.business_id || "platform";
      }
    })();
    await query(
      `INSERT INTO staff_audit_logs (
         id, actor_clerk_user_id, actor_name, module, target_id, target_name,
         action, details, business_id, branch_id, ip
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        user?.clerk_user_id || user?.id || "system",
        user?.email || user?.name || "system",
        details.module || "system",
        details.target_id || null,
        details.target_name || action,
        action,
        typeof details === "string" ? details : JSON.stringify(details),
        businessId,
        details.branch_id || branchId(),
        req?.ip || null,
      ],
    );
  } catch (err) {
    console.error("audit", err.message);
  }
}

export async function platformAudit(admin, action, details, req) {
  await query(
    `INSERT INTO staff_audit_logs (
       id, actor_clerk_user_id, actor_name, module, target_id, target_name,
       action, details, business_id, ip
     ) VALUES (?,?,?,?,?,?,?,?, 'platform', ?)`,
    [
      crypto.randomUUID(),
      admin?.id || "master",
      admin?.email || "master",
      details?.module || "master",
      details?.target_id || null,
      details?.target_name || action,
      action,
      JSON.stringify(details || {}),
      req?.ip || null,
    ],
  );
}
