export const MODULES = [
  "dashboard",
  "counter",
  "items",
  "customers",
  "packs",
  "orders",
  "purchases",
  "suppliers",
  "stock",
  "staff",
  "branches",
  "devices",
  "reports",
  "accounts",
  "settings",
  "support",
  "discount",
  "loyalty",
  "damage",
];

export const ROLES = [
  "business_admin",
  "branch_manager",
  "manager",
  "cashier",
  "stock_manager",
  "accountant",
  "staff",
];

const ALL = Object.fromEntries(MODULES.map((m) => [m, true]));

export function defaultPerms(role) {
  if (role === "business_admin") return { ...ALL };
  if (role === "branch_manager" || role === "manager") {
    return {
      ...ALL,
      staff: role === "branch_manager",
      settings: role === "branch_manager",
      discount: true,
      accounts: true,
    };
  }
  if (role === "cashier") {
    return {
      dashboard: true,
      counter: true,
      customers: true,
      orders: true,
      reports: false,
      support: true,
      discount: true,
      loyalty: true,
    };
  }
  if (role === "stock_manager") {
    return {
      dashboard: true,
      items: true,
      stock: true,
      purchases: true,
      suppliers: true,
      reports: true,
      support: true,
      damage: true,
    };
  }
  if (role === "accountant") {
    return {
      dashboard: true,
      reports: true,
      accounts: true,
      purchases: true,
      suppliers: true,
      customers: true,
      orders: true,
      support: true,
    };
  }
  return { dashboard: true, counter: true, support: true };
}

export function can(perms, module) {
  if (!module) return true;
  if (perms?.[module] === true) return true;
  return false;
}

export function displayName(user) {
  const first = user?.first_name || "";
  const last = user?.last_name || "";
  const joined = `${first} ${last}`.trim();
  return joined || user?.email || "User";
}
