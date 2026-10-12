(function (root) {
  const $ = (id) => document.getElementById(id);
  const M = () => root.POSItemMaster;
  const state = () => root.state || {};

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function kind() {
    return root.POSFootwear?.shopKind?.(state().businessMeta) || "general";
  }

  function copy() {
    return M()?.brandCopy(kind()) || { brandLab: "Brand", brandHint: "Brand / make" };
  }

  function brands() {
    return state().brands || [];
  }

  function mergedBrands() {
    return M().collectBrands({
      brands: brands(),
      items: state().items,
      barProducts: state().barProducts,
    });
  }

  function applyCopy() {
    const c = copy();
    if ($("item-brand-lab")) $("item-brand-lab").textContent = c.brandLab;
    if ($("item-brand")) $("item-brand").placeholder = c.brandHint;
    if ($("brand-name")) $("brand-name").placeholder = c.brandHint;
    if ($("items-kicker")) $("items-kicker").textContent = "Item Master";
    if ($("brands-kicker")) $("brands-kicker").textContent = "Brand Management";
  }

  function syncItemBrandId() {
    const name = $("item-brand")?.value || "";
    const row = findBrand(name);
    if ($("item-brand-id")) $("item-brand-id").value = row?.id || "";
  }

  function paintTabs(name) {
    const on = name === "brands" ? "brands" : "items";
    document.querySelectorAll("[data-items-tab]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.itemsTab === on);
    });
  }

  function fillBrandLists() {
    const rows = mergedBrands().filter((b) => b.status !== "inactive");
    const opts = rows.map((b) => `<option value="${escapeHtml(b.name)}">`).join("");
    if ($("brand-list")) $("brand-list").innerHTML = opts;
    const filter = $("item-brand-filter");
    if (filter) {
      const cur = filter.value;
      filter.innerHTML = `<option value="">All brands</option>${rows
        .map((b) => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`)
        .join("")}`;
      if (cur) filter.value = cur;
    }
  }

  function paintBrandHero() {
    const stats = $("brands-hero-stats");
    if (!stats || !M()) return;
    const s = M().summarizeBrands(mergedBrands(), state().items);
    stats.innerHTML = `<div class="items-stat"><span>Brands</span><strong>${s.brands}</strong></div>
      <div class="items-stat"><span>Active</span><strong>${s.active}</strong></div>
      <div class="items-stat"><span>Items tagged</span><strong>${s.assigned}</strong></div>`;
  }

  function paintBrandDesk() {
    const el = $("brands-table");
    if (!el) return;
    paintBrandHero();
    fillBrandLists();
    const q = String($("brand-catalog-search")?.value || "").trim().toLowerCase();
    const rows = mergedBrands().filter((b) => {
      if (!q) return true;
      return `${b.name} ${b.company || ""} ${b.notes || ""}`.toLowerCase().includes(q);
    });
    if (!rows.length) {
      el.innerHTML = `<div class="item-empty-card"><strong>No brands yet</strong><p>Add a brand on the left. Every shop type can assign it on Item Master — restaurant, bar, resort, pharmacy, garment, grocery, and others.</p></div>`;
      return;
    }
    const editing = $("brand-id")?.value || "";
    el.innerHTML = `<div class="brand-list">${rows
      .map((b) => `<article class="brand-card${editing === b.id ? " is-editing" : ""}${b.status === "inactive" ? " is-inactive" : ""}">
        <div>
          <h4>${escapeHtml(b.name)}</h4>
          <p>${escapeHtml(b.company || "—")} · ${Number(b.item_count) || 0} items${b.status === "inactive" ? " · Inactive" : ""}</p>
        </div>
        <div class="brand-card-actions">
          <button class="btn" type="button" data-edit-brand="${escapeHtml(b.id || b.name)}">Edit</button>
          <button class="btn" type="button" data-use-brand="${escapeHtml(b.name)}">Use on item</button>
        </div>
      </article>`)
      .join("")}</div>`;
  }

  function resetBrandForm() {
    if ($("brand-form")) $("brand-form").reset();
    if ($("brand-id")) $("brand-id").value = "";
    if ($("brand-status")) $("brand-status").value = "active";
    if ($("brand-mode")) $("brand-mode").textContent = "New brand";
    if ($("brand-hint")) {
      $("brand-hint").textContent = "";
      $("brand-hint").className = "hint";
    }
  }

  function fillBrandForm(b) {
    if (!b) return;
    if ($("brand-id")) $("brand-id").value = b.id || "";
    if ($("brand-name")) $("brand-name").value = b.name || "";
    if ($("brand-company")) $("brand-company").value = b.company || "";
    if ($("brand-notes")) $("brand-notes").value = b.notes || "";
    if ($("brand-status")) $("brand-status").value = b.status || "active";
    if ($("brand-mode")) $("brand-mode").textContent = b.id ? `Editing ${b.name}` : "New brand";
  }

  async function loadBrands() {
    try {
      const data = await root.api?.("/api/brands");
      state().brands = data?.brands || [];
    } catch {
      state().brands = collectFromItems();
    }
    fillBrandLists();
    paintBrandDesk();
    return state().brands;
  }

  function collectFromItems() {
    return M().collectBrands({ items: state().items, barProducts: state().barProducts });
  }

  function findBrand(idOrName) {
    return mergedBrands().find((b) => b.id === idOrName || M().sameBrand(b.name, idOrName));
  }

  async function saveBrand(e) {
    e?.preventDefault?.();
    const name = M().normalizeBrandName($("brand-name")?.value);
    const hint = $("brand-hint");
    if (!name) {
      if (hint) {
        hint.textContent = "Brand name is required";
        hint.className = "hint error";
      }
      return;
    }
    const body = {
      name,
      company: $("brand-company")?.value || "",
      notes: $("brand-notes")?.value || "",
      status: $("brand-status")?.value || "active",
    };
    const id = $("brand-id")?.value || "";
    try {
      if (id) await root.api(`/api/brands/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      else await root.api("/api/brands", { method: "POST", body: JSON.stringify(body) });
      if (hint) {
        hint.textContent = "Saved";
        hint.className = "hint ok";
      }
      resetBrandForm();
      await loadBrands();
    } catch (err) {
      if (hint) {
        hint.textContent = err.message || "Could not save brand";
        hint.className = "hint error";
      }
    }
  }

  function useBrandOnItem(name) {
    if ($("item-brand")) $("item-brand").value = name;
    const row = findBrand(name);
    if ($("item-brand-id")) $("item-brand-id").value = row?.id || "";
    if (typeof root.showView === "function") root.showView("items");
    $("item-name")?.focus();
  }

  function bind() {
    $("brand-form")?.addEventListener("submit", saveBrand);
    $("brand-cancel")?.addEventListener("click", resetBrandForm);
    $("brand-catalog-search")?.addEventListener("input", paintBrandDesk);
    $("item-brand-filter")?.addEventListener("change", () => root.renderItemsTable?.());
    $("item-brand")?.addEventListener("input", syncItemBrandId);
    $("item-brand")?.addEventListener("change", syncItemBrandId);
    $("item-brand-add")?.addEventListener("click", () => {
      if (typeof root.showView === "function") root.showView("brands");
      if ($("brand-name") && $("item-brand")?.value) $("brand-name").value = $("item-brand").value;
    });
    $("brands-table")?.addEventListener("click", (e) => {
      const edit = e.target.closest("[data-edit-brand]");
      if (edit) {
        fillBrandForm(findBrand(edit.dataset.editBrand));
        return;
      }
      const use = e.target.closest("[data-use-brand]");
      if (use) useBrandOnItem(use.dataset.useBrand);
    });
    document.querySelectorAll("[data-items-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.itemsTab;
        if (tab === "brands" && typeof root.showView === "function") root.showView("brands");
        else if (typeof root.showView === "function") root.showView("items");
      });
    });
  }

  function hookShowView() {
    if (typeof root.showView !== "function" || root.showView.__itemMaster) return;
    const orig = root.showView;
    root.showView = function (name) {
      const out = orig.apply(this, arguments);
      if (name === "brands" || name === "items") {
        applyCopy();
        fillBrandLists();
        paintTabs(name);
        if (name === "brands") {
          paintBrandDesk();
          if (!state().brands?.length) loadBrands();
        }
      }
      return out;
    };
    root.showView.__itemMaster = true;
  }

  function boot() {
    if (!M()) return;
    applyCopy();
    fillBrandLists();
    bind();
    hookShowView();
    if (state().items?.length) {
      state().brands = state().brands?.length ? state().brands : collectFromItems();
      fillBrandLists();
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  root.POSItemMasterUi = {
    applyCopy,
    fillBrandLists,
    paintBrandDesk,
    loadBrands,
    mergedBrands,
  };
})(typeof window !== "undefined" ? window : globalThis);
