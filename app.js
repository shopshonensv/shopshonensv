/* Shop Shonen SV — tienda (frontend). Sin dependencias externas. */
(function () {
  "use strict";

  const CFG = Object.assign({
    API_URL: "", WHATSAPP_NEGOCIO: "", ENVIO_SAN_SALVADOR: 2.5, ENVIO_OTROS: 2.9,
    MAX_POR_PRODUCTO: 10, FOTOS: "drive"
  }, window.SS_CONFIG || {});
  const DEMO = !CFG.API_URL;
  const GEO = window.SS_GEO || {};

  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const money = n => "$" + (Math.round(n * 100) / 100).toFixed(2);
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- imágenes ----------
  const CAT_COLORS = ["#00819e", "#d9662a", "#7a4fd1", "#1f9d55", "#e0343c", "#c99a00", "#2b5cd6", "#c2418f", "#0f8a7a", "#8a5a2b", "#4b6b7a", "#d14f5b", "#3a7d2c"];
  const catColor = {};
  function placeholder(p) {
    const c = catColor[p.categoria] || "#00819e";
    const esc = s => s.replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><pattern id="d" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2" fill="#14202a" opacity=".12"/></pattern></defs><rect width="400" height="400" fill="#f4eab2"/><rect width="400" height="400" fill="url(#d)"/><circle cx="200" cy="178" r="118" fill="${c}" stroke="#14202a" stroke-width="8"/><circle cx="200" cy="178" r="92" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="10 9" opacity=".7"/><text x="200" y="196" text-anchor="middle" font-family="Arial Black,Impact,sans-serif" font-size="52" fill="#fff" stroke="#14202a" stroke-width="3" paint-order="stroke">${esc(p.id)}</text><text x="200" y="352" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="24" fill="#14202a" opacity=".7">Foto próximamente</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function imgSrc(p, size) {
    if (CFG.FOTOS === "placeholder" || !p.foto && CFG.FOTOS === "drive") return placeholder(p);
    if (CFG.FOTOS === "embed" && window.SS_FOTOS && window.SS_FOTOS[p.id]) return window.SS_FOTOS[p.id];
    if (CFG.FOTOS === "local") return encodeURIComponent(p.id) + ((size || 600) <= 500 ? "-m" : "") + ".webp";
    return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(p.foto) + "&sz=w" + (size || 600);
  }
  function productImg(p, size, cls) {
    const img = h("img", { src: imgSrc(p, size), alt: p.nombre, loading: "lazy", decoding: "async", class: cls || null, referrerpolicy: "no-referrer" });
    img.addEventListener("error", () => { if (!img.dataset.fb) { img.dataset.fb = "1"; img.src = placeholder(p); } }, { once: false });
    return img;
  }

  // ---------- estado ----------
  let products = [];
  const byId = new Map();
  let cart = store.get("ss_cart", {});          // { P001: 2 }
  let filter = { q: "", cat: "Todas", only: false };
  let page = 1;
  const PAGE_SIZE = Math.max(4, parseInt(CFG.PINES_POR_PAGINA, 10) || 20);
  let selectedCard = null;

  function setProducts(list) {
    products = list.map(p => ({ ...p, precio: Number(p.precio), stock: Math.max(0, parseInt(p.stock, 10) || 0) }));
    byId.clear(); products.forEach(p => byId.set(p.id, p));
    [...new Set(products.map(p => p.categoria))].sort().forEach((c, i) => catColor[c] = CAT_COLORS[i % CAT_COLORS.length]);
    // limpia el carrito de productos que ya no existen o exceden existencias
    for (const id in cart) {
      const p = byId.get(id);
      if (!p || p.stock <= 0) delete cart[id];
      else cart[id] = Math.min(cart[id], p.stock, CFG.MAX_POR_PRODUCTO);
    }
    saveCart();
  }
  const inCart = id => cart[id] || 0;
  const available = p => Math.max(0, Math.min(p.stock, CFG.MAX_POR_PRODUCTO) - inCart(p.id));
  function saveCart() { store.set("ss_cart", cart); renderCartCount(); }

  // ---------- catálogo ----------
  // Muestra el catálogo al instante (datos guardados) y actualiza existencias en segundo plano.
  async function loadCatalog(opts) {
    opts = opts || {};
    const local = (window.SS_PRODUCTOS || []).slice();
    if (DEMO) {
      const demoStock = store.get("ss_demo_stock", null);
      if (demoStock) local.forEach(p => { if (p.id in demoStock) p.stock = demoStock[p.id]; });
      setProducts(local); return true;
    }
    if (!products.length) {
      const cached = store.get("ss_cat_cache", null);
      setProducts(Array.isArray(cached) && cached.length ? cached : local);
    }
    const refresh = (async () => {
      try {
        const r = await fetch(CFG.API_URL + "?action=catalogo", { method: "GET", cache: "no-store" });
        const j = await r.json();
        if (!j.ok || !Array.isArray(j.productos)) throw new Error("respuesta inválida");
        setProducts(j.productos);
        store.set("ss_cat_cache", j.productos);
        return true;
      } catch (e) { return false; }
    })();
    if (opts.wait) return refresh;
    refresh.then(ok => {
      if (ok) { renderChips(); renderGrid(); if (current && !$("#detailOverlay").hidden) { current = byId.get(current.id) || current; updateDetailStock(); } }
      else toast("No pudimos actualizar las existencias. Inténtalo de nuevo en un momento.");
    });
    return true;
  }

  function renderChips() {
    const counts = {};
    products.forEach(p => counts[p.categoria] = (counts[p.categoria] || 0) + 1);
    const cats = ["Todas", ...Object.keys(counts).sort((a, b) => a.localeCompare(b, "es"))];
    const wrap = $("#chips"); wrap.textContent = "";
    cats.forEach(c => wrap.append(h("button", {
      type: "button", class: "chip", "aria-pressed": String(filter.cat === c),
      onclick: () => { filter.cat = c; page = 1; renderChips(); renderGrid(); }
    }, c, h("small", { text: c === "Todas" ? products.length : counts[c] }))));
    const sel = $("#catSelect");
    if (sel) {
      sel.textContent = "";
      cats.forEach(c => sel.append(h("option", { value: c, text: (c === "Todas" ? "Todas las temáticas" : c) + " (" + (c === "Todas" ? products.length : counts[c]) + ")" })));
      sel.value = filter.cat;
      sel.onchange = () => { filter.cat = sel.value; page = 1; renderChips(); renderGrid(); };
    }
    $("#pinesMeta").textContent = products.length + " diseños";
  }

  function stockPill(p) {
    const a = p.stock;
    if (a <= 0) return null;
    return h("span", { class: "stock-pill" + (a <= 2 ? " low" : ""), text: a === 1 ? "¡Último!" : a + " disp." });
  }

  function renderGrid() {
    const q = norm(filter.q);
    const list = products.filter(p =>
      (filter.cat === "Todas" || p.categoria === filter.cat) &&
      (!filter.only || p.stock > 0) &&
      (!q || norm(p.nombre + " " + p.descripcion + " " + p.categoria + " " + p.id).includes(q)));
    const grid = $("#grid"); grid.textContent = ""; selectedCard = null;
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), pages);
    const from = (page - 1) * PAGE_SIZE, shown = list.slice(from, from + PAGE_SIZE);
    $("#resultCount").textContent = list.length === 1 ? "1 pin encontrado"
      : list.length + " pines encontrados" + (pages > 1 ? " · mostrando " + (from + 1) + "–" + (from + shown.length) : "");
    renderPager(pages);
    if (!list.length) {
      grid.append(h("div", { class: "empty" }, h("b", { text: "No encontramos pines con esa búsqueda." }), h("br"), "Prueba con otra palabra o elige «Todas»."));
      return;
    }
    const frag = document.createDocumentFragment();
    shown.forEach((p, i) => {
      const out = p.stock <= 0;
      const more = h("button", { type: "button", class: "btn btn-sun btn-wide", onclick: e => { e.stopPropagation(); openDetail(p.id); } }, "Ver más info.");
      const card = h("article", {
        class: "card" + (out ? " out" : ""), tabindex: "0", "data-id": p.id,
        "aria-label": p.nombre + ", " + money(p.precio) + (out ? ", agotado" : "")
      },
        h("div", { class: "card-img" }, productImg(p, 500), out ? h("span", { class: "badge-out", text: "Agotado" }) : null, h("span", { class: "code-tag", text: p.id })),
        h("div", { class: "card-body" },
          h("span", { class: "card-cat", text: p.categoria }),
          h("h3", { class: "card-name", text: p.nombre }),
          h("div", { class: "card-row" }, h("span", { class: "price", text: money(p.precio) }), stockPill(p))),
        h("div", { class: "card-more" }, more));
      const select = () => {
        if (selectedCard === card) { openDetail(p.id); return; }
        if (selectedCard) selectedCard.classList.remove("sel");
        card.classList.add("sel"); selectedCard = card;
      };
      card.addEventListener("click", select);
      card.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target === card) { e.preventDefault(); select(); if (card.classList.contains("sel")) more.focus(); } });
      frag.append(card);
    });
    grid.append(frag);
  }

  function renderPager(pages) {
    const nav = $("#pager"); nav.textContent = "";
    if (pages <= 1) { nav.hidden = true; return; }
    nav.hidden = false;
    const go = n => { page = n; renderGrid(); const top = $("#chips").getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top, behavior: "smooth" }); };
    nav.append(h("button", { type: "button", class: "pg pg-nav", disabled: page === 1, "aria-label": "Página anterior", onclick: () => go(page - 1) }, "‹"));
    for (let n = 1; n <= pages; n++) {
      nav.append(h("button", { type: "button", class: "pg", "aria-current": n === page ? "page" : null, "aria-label": "Página " + n, onclick: () => go(n) }, String(n)));
    }
    nav.append(h("button", { type: "button", class: "pg pg-nav", disabled: page === pages, "aria-label": "Página siguiente", onclick: () => go(page + 1) }, "›"));
  }

  // ---------- redes sociales ----------
  const SOCIAL_ICONS = {
    INSTAGRAM: ["Instagram", '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17.4" cy="6.6" r="1.4" fill="currentColor"/></svg>'],
    FACEBOOK: ["Facebook", '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1Z"/></svg>'],
    TIKTOK: ["TikTok", '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v2.6c-1.4.1-2.7-.3-3.9-1.1v6.3c0 3.6-2.7 5.9-5.9 5.9A5.8 5.8 0 0 1 5 14.7c0-3.6 3-6.2 6.6-5.7v2.8c-1.8-.4-3.6.7-3.6 2.8 0 1.6 1.3 2.9 2.9 2.9 1.7 0 2.9-1.1 2.9-3.2V3h2.8Z"/></svg>']
  };
  function setupSocial() {
    const redes = CFG.REDES || {};
    const items = Object.keys(SOCIAL_ICONS).filter(k => /^https:\/\//.test(String(redes[k] || "")));
    $$("[data-social]").forEach(box => {
      if (!items.length) { box.hidden = true; return; }
      items.forEach(k => {
        const a = h("a", { class: "soc soc-" + k.toLowerCase(), href: redes[k], target: "_blank", rel: "noopener noreferrer", "aria-label": "Síguenos en " + SOCIAL_ICONS[k][0], title: SOCIAL_ICONS[k][0] });
        a.innerHTML = SOCIAL_ICONS[k][1];
        box.append(a);
      });
      box.hidden = false;
    });
    const hs = $("#heroSocial"); if (hs) hs.hidden = !items.length;
  }

  // ---------- pestañas de categoría ----------
  function showCat(cat, scroll) {
    $$(".cat-tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.cat === cat)));
    $("#panel-pines").hidden = cat !== "pines";
    $("#panel-camisetas").hidden = cat !== "camisetas";
    if (scroll) $("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- overlays ----------
  let lastFocus = null;
  function openOverlay(el) { lastFocus = document.activeElement; el.hidden = false; document.body.classList.add("locked"); const x = $(".x", el); if (x) x.focus(); }
  function closeOverlay(el) { el.hidden = true; if (!anyOpen()) document.body.classList.remove("locked"); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  const anyOpen = () => !$("#detailOverlay").hidden || !$("#privacyOverlay").hidden || $("#drawer").classList.contains("open") || !$("#checkout").hidden;

  // ---------- detalle ----------
  let current = null, dQty = 1;
  function openDetail(id) {
    const p = byId.get(id); if (!p) return;
    current = p; dQty = 1;
    const img = $("#dImg");
    delete img.dataset.fb;
    img.onerror = () => { if (!img.dataset.fb) { img.dataset.fb = "1"; img.src = placeholder(p); } };
    img.src = imgSrc(p, 1400); img.alt = p.nombre;
    $("#zoom").classList.remove("on"); $("#zoomHint").textContent = "Toca la foto para hacer zoom";
    $("#dCode").textContent = p.id + " · " + p.categoria;
    $("#dName").textContent = p.nombre;
    $("#dPrice").textContent = money(p.precio);
    $("#dDesc").textContent = p.descripcion;
    updateDetailStock();
    openOverlay($("#detailOverlay"));
  }
  function updateDetailStock() {
    const p = current; if (!p) return;
    const av = available(p), s = $("#dStock");
    s.className = "d-stock";
    if (p.stock <= 0) { s.textContent = "Agotado"; s.classList.add("out"); }
    else {
      s.textContent = "Existencias: " + p.stock + (p.stock === 1 ? " unidad" : " unidades") + (inCart(p.id) ? " · " + inCart(p.id) + " en tu carrito" : "");
      if (p.stock <= 2) s.classList.add("low");
    }
    dQty = Math.max(1, Math.min(dQty, av || 1));
    $("#dQty").textContent = dQty;
    $("#dMinus").disabled = dQty <= 1;
    $("#dPlus").disabled = dQty >= av;
    const add = $("#dAdd");
    add.disabled = av <= 0;
    add.textContent = p.stock <= 0 ? "Agotado" : av <= 0 ? "Ya tienes todas las unidades" : "Añadir al carrito";
  }
  function setupZoom() {
    const z = $("#zoom"), img = $("#dImg");
    const setOrigin = (x, y) => {
      const r = z.getBoundingClientRect();
      img.style.transformOrigin = (Math.min(100, Math.max(0, (x - r.left) / r.width * 100))) + "% " + (Math.min(100, Math.max(0, (y - r.top) / r.height * 100))) + "%";
    };
    let dragging = false, moved = false;
    z.addEventListener("pointerdown", e => { dragging = true; moved = false; if (z.classList.contains("on")) { z.setPointerCapture(e.pointerId); } });
    z.addEventListener("pointermove", e => { if (z.classList.contains("on") && (e.pointerType === "mouse" || dragging)) { moved = true; setOrigin(e.clientX, e.clientY); } });
    z.addEventListener("pointerup", e => {
      dragging = false;
      if (moved && e.pointerType !== "mouse") return;
      const on = !z.classList.contains("on");
      if (on) setOrigin(e.clientX, e.clientY);
      z.classList.toggle("on", on);
      $("#zoomHint").textContent = on ? (e.pointerType === "mouse" ? "Mueve el cursor · clic para salir" : "Arrastra para mover · toca para salir") : "Toca la foto para hacer zoom";
    });
    z.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); img.style.transformOrigin = "50% 50%"; z.classList.toggle("on"); } });
  }

  // ---------- carrito ----------
  function renderCartCount() {
    const n = Object.values(cart).reduce((a, b) => a + b, 0);
    $("#cartCount").textContent = n;
    $("#cartBtn").setAttribute("aria-label", "Abrir carrito, " + n + (n === 1 ? " producto" : " productos"));
  }
  const cartLines = () => Object.keys(cart).map(id => ({ p: byId.get(id), qty: cart[id] })).filter(l => l.p && l.qty > 0);
  const cartSubtotal = () => cartLines().reduce((s, l) => s + l.p.precio * l.qty, 0);

  function addToCart(p, qty) {
    const add = Math.min(qty, available(p));
    if (add <= 0) return;
    cart[p.id] = inCart(p.id) + add;
    saveCart();
    const b = $("#cartBtn"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
    closeOverlay($("#detailOverlay"));
    renderGrid();
    openDrawer("¡Agregado! " + p.nombre);
  }
  function setQty(id, q) {
    const p = byId.get(id); if (!p) return;
    const max = Math.min(p.stock, CFG.MAX_POR_PRODUCTO);
    if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, max);
    saveCart(); renderCart();
    if (!$("#checkout").hidden) renderSummary();
  }
  function renderCart() {
    const list = $("#cartList"); list.textContent = "";
    const lines = cartLines();
    if (!lines.length) {
      list.append(h("div", { class: "cart-empty" }, h("img", { src: $(".mascot").getAttribute("src"), alt: "" }), h("p", {}, h("b", { text: "Tu carrito está vacío." })), h("p", { text: "Explora los pines y agrega tus favoritos." })));
    }
    lines.forEach(({ p, qty }) => {
      const max = Math.min(p.stock, CFG.MAX_POR_PRODUCTO);
      list.append(h("div", { class: "line" },
        productImg(p, 200),
        h("div", {},
          h("p", { class: "line-name", text: p.nombre }),
          h("div", { class: "line-meta" }, h("span", { text: "Costo unitario: " + money(p.precio) }), h("span", { text: "Cant.: " + qty })),
          h("div", { class: "line-ctrl" },
            h("div", { class: "qty sm", role: "group", "aria-label": "Cantidad de " + p.nombre },
              h("button", { type: "button", "aria-label": "Quitar uno", onclick: () => setQty(p.id, qty - 1) }, "−"),
              h("output", { text: qty }),
              h("button", { type: "button", "aria-label": "Agregar uno", disabled: qty >= max, onclick: () => setQty(p.id, qty + 1) }, "+")),
            h("span", { class: "line-total", text: money(p.precio * qty) })),
          h("button", { type: "button", class: "rm", onclick: () => setQty(p.id, 0) }, "Quitar"))));
    });
    $("#cartTotal").textContent = money(cartSubtotal());
    $("#goCheckout").disabled = !lines.length;
  }
  let drawerT, drawerHideT;
  function openDrawer(msg) {
    renderCart();
    const d = $("#drawer");
    lastFocus = document.activeElement;
    clearTimeout(drawerHideT);
    $("#drawerBack").hidden = false; d.hidden = false; void d.offsetWidth; d.classList.add("open"); d.removeAttribute("inert"); d.setAttribute("aria-hidden", "false");
    document.body.classList.add("locked");
    const t = $("#drawerToast");
    if (msg) { t.textContent = msg; t.classList.add("show"); clearTimeout(drawerT); drawerT = setTimeout(() => t.classList.remove("show"), 2600); }
    setTimeout(() => $("#goCheckout").disabled ? $("#drawerClose").focus() : $("#goCheckout").focus(), 50);
  }
  function closeDrawer(restore = true) {
    const d = $("#drawer");
    d.classList.remove("open"); d.setAttribute("inert", ""); d.setAttribute("aria-hidden", "true");
    clearTimeout(drawerHideT); drawerHideT = setTimeout(() => { if (!d.classList.contains("open")) d.hidden = true; }, 350);
    $("#drawerBack").hidden = true;
    if (!anyOpen()) document.body.classList.remove("locked");
    if (restore && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---------- checkout ----------
  const F = {};
  function fillSelect(sel, items, placeholderTxt) {
    sel.textContent = "";
    sel.append(h("option", { value: "", text: placeholderTxt }));
    items.forEach(v => sel.append(h("option", { value: v, text: v })));
  }
  function setupCheckout() {
    ["Nombre", "Whats", "Depto", "Muni", "Dist", "Dir", "Ref", "Consent", "Web"].forEach(k => F[k] = $("#f" + k));
    fillSelect(F.Depto, Object.keys(GEO), "Selecciona un departamento");
    F.Depto.addEventListener("change", () => {
      const d = F.Depto.value;
      fillSelect(F.Muni, d ? Object.keys(GEO[d]) : [], d ? "Selecciona un municipio" : "Primero elige el departamento");
      F.Muni.disabled = !d;
      fillSelect(F.Dist, [], "Primero elige el municipio"); F.Dist.disabled = true;
      touched.Muni = touched.Dist = false;
      validate(); renderSummary();
    });
    F.Muni.addEventListener("change", () => {
      const d = F.Depto.value, m = F.Muni.value;
      const dist = d && m ? GEO[d][m] : [];
      fillSelect(F.Dist, dist, m ? "Selecciona un distrito" : "Primero elige el municipio");
      F.Dist.disabled = !m;
      if (dist.length === 1) F.Dist.value = dist[0];
      validate();
    });
    F.Whats.addEventListener("input", () => {
      let v = F.Whats.value.replace(/\D/g, "").slice(0, 8);
      if (v.length > 4) v = v.slice(0, 4) + "-" + v.slice(4);
      F.Whats.value = v;
    });
    $$("input, select", $("#coForm")).forEach(el => {
      el.addEventListener("input", validate);
      el.addEventListener("change", validate);
      el.addEventListener("blur", () => { const k = keyOf(el); if (k) { touched[k] = true; validate(); } });
    });
    $$('input[name="pago"]').forEach(r => r.addEventListener("change", () => { touched.Pago = true; $("#payNote").hidden = payValue() !== "Transferencia"; validate(); }));
    $("#coForm").addEventListener("submit", submitOrder);
    $("#coBack").addEventListener("click", closeCheckout);
  }
  const touched = {};
  const keyOf = el => ({ fNombre: "Nombre", fWhats: "Whats", fDepto: "Depto", fMuni: "Muni", fDist: "Dist", fDir: "Dir", fRef: "Ref", fConsent: "Consent" })[el.id];
  const payValue = () => { const r = $('input[name="pago"]:checked'); return r ? r.value : ""; };
  const phoneDigits = () => F.Whats.value.replace(/\D/g, "");

  function checks() {
    const nombre = F.Nombre.value.trim().replace(/\s+/g, " ");
    return {
      Nombre: nombre.length < 5 || nombre.split(" ").length < 2 ? "Escribe tu nombre y apellido." : /[<>{}]/.test(nombre) ? "El nombre contiene caracteres no permitidos." : "",
      Whats: !/^[67]\d{7}$/.test(phoneDigits()) ? "Escribe un número de WhatsApp válido de 8 dígitos (empieza con 6 o 7)." : "",
      Depto: !F.Depto.value ? "Selecciona el departamento." : "",
      Muni: !F.Muni.value ? "Selecciona el municipio." : "",
      Dist: !F.Dist.value ? "Selecciona el distrito." : "",
      Dir: F.Dir.value.trim().length < 8 ? "Escribe tu dirección completa (colonia, calle, número)." : "",
      Ref: F.Ref.value.trim().length < 4 ? "Agrega un punto de referencia para el repartidor." : "",
      Pago: !payValue() ? "Elige un método de pago." : "",
      Consent: !F.Consent.checked ? "Necesitamos tu autorización para usar tus datos en la entrega." : ""
    };
  }
  const LABELS = { Nombre: "nombre", Whats: "WhatsApp", Depto: "departamento", Muni: "municipio", Dist: "distrito", Dir: "dirección", Ref: "punto de referencia", Pago: "método de pago", Consent: "autorización de datos" };
  function validate() {
    const c = checks();
    const errIds = { Nombre: "eNombre", Whats: "eWhats", Depto: "eDepto", Muni: "eMuni", Dist: "eDist", Dir: "eDir", Ref: "eRef", Pago: "ePago", Consent: "eConsent" };
    for (const k in c) {
      const show = touched[k] && c[k];
      $("#" + errIds[k]).textContent = show ? c[k] : "";
      const input = F[k];
      const field = input && input.closest(".field");
      if (field) { field.classList.toggle("bad", !!show); field.classList.toggle("ok", !c[k]); }
      if (input) input.setAttribute("aria-invalid", show ? "true" : "false");
    }
    const missing = Object.keys(c).filter(k => c[k]);
    const ok = !missing.length && cartLines().length > 0;
    $("#coSubmit").disabled = !ok;
    $("#coMissing").textContent = ok ? "Todo listo. Revisa tu pedido y confírmalo." : "Te falta completar: " + missing.map(k => LABELS[k]).join(", ") + ".";
    return ok;
  }
  const shipping = () => !F.Depto.value ? null : (F.Depto.value === "San Salvador" ? CFG.ENVIO_SAN_SALVADOR : CFG.ENVIO_OTROS);
  function renderItems(box, lines) {
    box.textContent = "";
    lines.forEach(l => box.append(h("div", { class: "co-item" }, productImg(l.p, 160),
      h("span", {}, l.p.nombre, h("small", { text: l.qty + " × " + money(l.p.precio) })),
      h("b", { text: money(l.p.precio * l.qty) }))));
  }
  function renderSummary() {
    const lines = cartLines();
    renderItems($("#coItems"), lines);
    const sub = cartSubtotal(), sh = shipping();
    $("#coSub").textContent = money(sub);
    $("#coShip").textContent = sh == null ? "—" : money(sh);
    $("#coShipLbl").textContent = sh == null ? "(elige departamento)" : "(" + F.Depto.value + ")";
    $("#coTotal").textContent = money(sub + (sh || 0));
    if (!lines.length) closeCheckout();
  }
  function openCheckout() {
    if (!cartLines().length) return;
    closeDrawer(false);
    $("#coWrap").hidden = false; $("#done").hidden = true; $("#formAlert").hidden = true;
    $("#checkout").hidden = false; document.body.classList.add("locked");
    $("#checkout").scrollTop = 0;
    renderSummary(); validate();
    setTimeout(() => { if (!$("#coForm").contains(document.activeElement)) F.Nombre.focus(); }, 60);
  }
  function closeCheckout() {
    $("#checkout").hidden = true;
    if (!anyOpen()) document.body.classList.remove("locked");
  }

  function genId() {
    const d = new Date(), pad = n => String(n).padStart(2, "0");
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3))).map(b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
    return "SS-" + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + rnd;
  }

  async function submitOrder(e) {
    e.preventDefault();
    Object.keys(LABELS).forEach(k => touched[k] = true);
    if (!validate()) { const first = $(".field.bad input, .field.bad select"); if (first) first.focus(); return; }
    if (F.Web.value) return; // bot
    const btn = $("#coSubmit"); btn.classList.add("loading"); btn.disabled = true; btn.textContent = "Registrando tu compra";
    $("#formAlert").hidden = true;
    const payload = {
      items: cartLines().map(l => ({ id: l.p.id, qty: l.qty })),
      cliente: {
        nombre: F.Nombre.value.trim().replace(/\s+/g, " "),
        whatsapp: "503" + phoneDigits(),
        departamento: F.Depto.value, municipio: F.Muni.value, distrito: F.Dist.value,
        direccion: F.Dir.value.trim(), referencia: F.Ref.value.trim()
      },
      pago: payValue(),
      consentimiento: true,
      web: F.Web.value
    };
    try {
      const res = DEMO ? await demoOrder(payload) : await apiOrder(payload);
      if (!res.ok) throw res;
      cart = {}; saveCart();
      showDone(res, payload);
      await loadCatalog({ wait: true }); renderChips(); renderGrid();
    } catch (err) {
      const a = $("#formAlert"); a.hidden = false;
      if (err && err.agotados && err.agotados.length) {
        const names = err.agotados.map(x => (byId.get(x.id) || { nombre: x.id }).nombre + (x.disponible > 0 ? " (quedan " + x.disponible + ")" : " (agotado)"));
        a.textContent = "Alguien se nos adelantó con: " + names.join(", ") + ". Ajustamos tu carrito; revisa y vuelve a confirmar.";
        err.agotados.forEach(x => { const p = byId.get(x.id); if (p) p.stock = x.disponible; if (x.disponible <= 0) delete cart[x.id]; else cart[x.id] = Math.min(cart[x.id], x.disponible); });
        saveCart(); renderSummary(); renderGrid();
      } else {
        a.textContent = (err && err.mensaje) || "No pudimos registrar tu compra por un problema de conexión. Tus datos siguen aquí; intenta de nuevo.";
      }
      a.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      btn.classList.remove("loading"); btn.textContent = "Completar registro de compra"; validate();
    }
  }
  async function apiOrder(payload) {
    const r = await fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" });
    return r.json();
  }
  async function demoOrder(payload) {
    await new Promise(r => setTimeout(r, 900));
    const agotados = payload.items.map(it => ({ id: it.id, disponible: byId.get(it.id).stock, qty: it.qty })).filter(x => x.qty > x.disponible);
    if (agotados.length) return { ok: false, agotados };
    const stock = store.get("ss_demo_stock", {});
    let sub = 0;
    const items = payload.items.map(it => { const p = byId.get(it.id); stock[it.id] = p.stock - it.qty; sub += p.precio * it.qty; return { id: it.id, nombre: p.nombre, qty: it.qty, precio: p.precio }; });
    store.set("ss_demo_stock", stock);
    const envio = payload.cliente.departamento === "San Salvador" ? CFG.ENVIO_SAN_SALVADOR : CFG.ENVIO_OTROS;
    return { ok: true, pedido: genId(), items, subtotal: sub, envio, total: sub + envio, whatsapp: "demo" };
  }

  function showDone(res, payload) {
    $("#coWrap").hidden = true; $("#done").hidden = false; $("#checkout").scrollTop = 0;
    $("#doneName").textContent = payload.cliente.nombre.split(" ")[0];
    $("#doneId").textContent = res.pedido;
    renderItems($("#doneItems"), res.items.map(i => ({ p: Object.assign({}, byId.get(i.id) || {}, { id: i.id, nombre: i.nombre, precio: i.precio, foto: (byId.get(i.id) || {}).foto, categoria: (byId.get(i.id) || {}).categoria }), qty: i.qty })));
    $("#doneShip").textContent = money(res.envio) + " (" + payload.cliente.departamento + ")";
    $("#doneTotal").textContent = money(res.total);
    $("#donePay").textContent = payload.pago === "Transferencia"
      ? "Pago por transferencia: un asesor se comunicará contigo por WhatsApp para completar el pago. Tu pedido queda reservado."
      : "Pago contra entrega: ten listo " + money(res.total) + " en efectivo al recibir tu pedido.";
    const tel = "+503\u00A0" + payload.cliente.whatsapp.slice(3, 7) + "\u2011" + payload.cliente.whatsapp.slice(7);
    $("#doneWa").textContent = res.whatsapp === "enviado"
      ? "Te enviamos la confirmación por WhatsApp al " + tel + "."
      : res.whatsapp === "demo"
        ? "Modo demostración: en el sitio real, en este momento llega un WhatsApp al " + tel + " con el detalle del pedido."
        : "Registramos tu pedido. En breve te escribimos por WhatsApp al " + tel + ".";
    const chat = $("#doneChat");
    if (CFG.WHATSAPP_NEGOCIO) {
      const txt = "Hola Shop Shonen SV, acabo de registrar el pedido " + res.pedido + " por " + money(res.total) + " (" + payload.pago + ").";
      chat.href = "https://wa.me/" + encodeURIComponent(CFG.WHATSAPP_NEGOCIO) + "?text=" + encodeURIComponent(txt);
      chat.hidden = false;
    } else chat.hidden = true;
    $("#doneBack").focus();
  }


  // ---------- ubicación ----------
  function setupPlace() {
    const U = CFG.UBICACION; if (!U) return;
    $("#placeAddr").textContent = U.DIRECCION;
    const dl = $("#hours"); dl.textContent = "";
    (U.HORARIO || []).forEach(([d, hrs]) => dl.append(h("dt", { text: d }), h("dd", { text: hrs })));
    const ll = U.LAT + "," + U.LNG;
    const pid = U.PLACE_ID ? "&query_place_id=" + encodeURIComponent(U.PLACE_ID) : "";
    $("#mapOpen").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ll) + pid;
    $("#mapDirections").href = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(ll) + (U.PLACE_ID ? "&destination_place_id=" + encodeURIComponent(U.PLACE_ID) : "");
    const box = $("#map"); box.textContent = "";
    if (U.MAPA_INTERACTIVO) {
      box.append(h("iframe", {
        title: "Mapa de ubicación de Shop Shonen SV", loading: "lazy", referrerpolicy: "no-referrer-when-downgrade",
        src: "https://maps.google.com/maps?q=" + encodeURIComponent(ll) + "&z=16&hl=es&output=embed"
      }));
    } else {
      // Mapa ilustrado (vista previa sin mapa interactivo)
      const a = h("a", { class: "map-art", href: $("#mapOpen").href, target: "_blank", rel: "noopener noreferrer", "aria-label": "Abrir ubicación en Google Maps" });
      a.innerHTML = '<svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="600" height="400" fill="#e4f0f3"/><g stroke="#ffffff" stroke-width="22" stroke-linecap="round"><path d="M-20 120 L620 90"/><path d="M-20 300 L620 330"/><path d="M140 -20 L180 420"/><path d="M430 -20 L400 420"/></g><g stroke="#ffffff" stroke-width="10"><path d="M-20 210 L620 205"/><path d="M290 -20 L300 420"/><path d="M40 -20 L60 420"/><path d="M530 -20 L520 420"/></g><g fill="#cfe5d6"><rect x="190" y="130" width="90" height="62" rx="8"/><rect x="315" y="225" width="70" height="60" rx="8"/></g><g fill="#d5e3e8"><rect x="70" y="135" width="60" height="55" rx="6"/><rect x="70" y="225" width="60" height="60" rx="6"/><rect x="445" y="120" width="70" height="70" rx="6"/><rect x="445" y="225" width="65" height="85" rx="6"/><rect x="190" y="225" width="90" height="60" rx="6"/><rect x="315" y="128" width="70" height="64" rx="6"/></g><text x="168" y="60" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#5b6b75" transform="rotate(84 168 60)">Las Margaritas</text><text x="470" y="370" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#5b6b75">Soyapango</text><ellipse cx="300" cy="226" rx="34" ry="10" fill="#14202a" opacity=".25"/><path d="M300 222 C280 190 256 170 256 140 a44 44 0 0 1 88 0 C344 170 320 190 300 222Z" fill="#ffd500" stroke="#14202a" stroke-width="5"/><circle cx="300" cy="140" r="17" fill="#00819e" stroke="#14202a" stroke-width="4"/></svg><span class="map-label">Toca para abrir el mapa</span>';
      box.append(a);
    }
  }

  // ---------- contacto ----------
  function setupContact() {
    if (CFG.WHATSAPP_NEGOCIO) {
      const n = String(CFG.WHATSAPP_NEGOCIO).replace(/\D/g, "");
      const wa = $("#ctWa");
      wa.href = "https://wa.me/" + n + "?text=" + encodeURIComponent("Hola Shop Shonen SV, tengo una consulta.");
      $("#ctWaNum").textContent = n.length === 11 ? "+" + n.slice(0, 3) + "\u00A0" + n.slice(3, 7) + "\u2011" + n.slice(7) : "+" + n;
      wa.hidden = false;
    }
    const f = { n: $("#cNombre"), c: $("#cCorreo"), e: $("#cEmpresa"), q: $("#cConsulta"), w: $("#cWeb") };
    const t = {};
    const rules = () => ({
      n: f.n.value.trim().length < 3 || /[<>{}]/.test(f.n.value) ? "Escribe tu nombre." : "",
      c: !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(f.c.value.trim()) ? "Escribe un correo válido, por ejemplo nombre@gmail.com." : "",
      q: f.q.value.trim().length < 10 ? "Cuéntanos tu consulta (mínimo 10 caracteres)." : ""
    });
    const ids = { n: "ecNombre", c: "ecCorreo", q: "ecConsulta" };
    const check = (all) => {
      const r = rules();
      for (const k in ids) {
        const show = (all || t[k]) && r[k];
        $("#" + ids[k]).textContent = show ? r[k] : "";
        const fld = f[k].closest(".field"); fld.classList.toggle("bad", !!show); fld.classList.toggle("ok", !r[k] && !!t[k]);
        f[k].setAttribute("aria-invalid", show ? "true" : "false");
      }
      return !Object.values(r).some(Boolean);
    };
    ["n", "c", "q"].forEach(k => { f[k].addEventListener("blur", () => { t[k] = true; check(); }); f[k].addEventListener("input", () => check()); });
    f.q.addEventListener("input", () => $("#cCount").textContent = f.q.value.length + " / 1000");
    $("#ctForm").addEventListener("submit", async e => {
      e.preventDefault();
      if (!check(true)) { const b = $("#ctForm .field.bad input, #ctForm .field.bad textarea"); if (b) b.focus(); return; }
      if (f.w.value) return;
      const btn = $("#ctSubmit"); btn.classList.add("loading"); btn.disabled = true; btn.textContent = "Enviando";
      $("#ctAlert").hidden = true;
      const payload = { tipo: "contacto", nombre: f.n.value.trim(), correo: f.c.value.trim(), empresa: f.e.value.trim(), consulta: f.q.value.trim(), web: f.w.value };
      try {
        let res;
        if (DEMO) { await new Promise(r => setTimeout(r, 700)); res = { ok: true }; }
        else res = await (await fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" })).json();
        if (!res.ok) throw res;
        $("#ctDoneName").textContent = payload.nombre.split(" ")[0];
        $("#ctDoneMail").textContent = payload.correo;
        $("#ctForm").hidden = true; $("#ctDone").hidden = false; $("#ctAgain").focus();
      } catch (err) {
        const a = $("#ctAlert"); a.hidden = false;
        a.textContent = (err && err.mensaje) || "No pudimos enviar tu consulta por un problema de conexión. Inténtalo de nuevo.";
      } finally { btn.classList.remove("loading"); btn.disabled = false; btn.textContent = "Enviar consulta"; }
    });
    $("#ctAgain").addEventListener("click", () => {
      $("#ctForm").reset(); $("#cCount").textContent = "0 / 1000"; Object.keys(t).forEach(k => delete t[k]); check();
      $$("#ctForm .field").forEach(x => x.classList.remove("ok", "bad"));
      $("#ctDone").hidden = true; $("#ctForm").hidden = false; f.n.focus();
    });
  }

  // ---------- modo demo ----------
  function demoBanner() {
    if (!DEMO) return;
    const bar = h("div", { class: "demo-bar", style: "background:var(--ink);color:var(--cream);font-size:.82rem;padding:6px 16px;text-align:center;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;align-items:center" },
      h("span", {}, h("b", { text: "Vista previa · " }), "los pedidos y existencias solo se guardan en este navegador."),
      h("button", { type: "button", class: "linkish", style: "color:var(--sun)", onclick: async () => { store.del("ss_demo_stock"); cart = {}; saveCart(); await loadCatalog(); renderChips(); renderGrid(); toast("Inventario de prueba reiniciado"); } }, "Reiniciar inventario"));
    document.body.prepend(bar);
  }

  // ---------- arranque ----------
  async function init() {
    $("#year").textContent = new Date().getFullYear();
    demoBanner();
    if (CFG.FOTOS === "placeholder") document.body.classList.add("ph");
    loadCatalog();
    renderChips(); renderGrid(); renderCartCount();
    setupZoom(); setupCheckout(); setupPlace(); setupContact(); setupSocial();
    $$("[data-scroll]").forEach(b => b.addEventListener("click", () => { closeDd(); const t = document.getElementById(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }));

    $$("[data-goto]").forEach(b => b.addEventListener("click", () => { closeDd(); showCat(b.dataset.goto, true); }));
    const ddBtn = $("#ddBtn"), ddMenu = $("#ddMenu");
    const burger = $("#burger"), topbar = $("#topbar");
    function closeMenu() { if (!burger) return; topbar.classList.remove("menu-open"); burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Abrir menú"); }
    function closeDd() { closeMenu(); if (!ddBtn) return; ddMenu.hidden = true; ddBtn.setAttribute("aria-expanded", "false"); }
    if (burger) {
      burger.addEventListener("click", e => {
        e.stopPropagation();
        const open = !topbar.classList.contains("menu-open");
        topbar.classList.toggle("menu-open", open);
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
        if (open) { ddMenu.hidden = false; ddBtn.setAttribute("aria-expanded", "true"); const first = $("#topnav .navlink"); if (first) first.focus(); }
      });
      document.addEventListener("click", e => { if (!e.target.closest("#topbar")) closeMenu(); });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && topbar.classList.contains("menu-open")) { closeMenu(); burger.focus(); } });
      window.addEventListener("resize", () => { if (window.innerWidth > 960) closeMenu(); });
    }
    if (ddBtn) {
      ddBtn.addEventListener("click", e => { e.stopPropagation(); const open = ddMenu.hidden; ddMenu.hidden = !open; ddBtn.setAttribute("aria-expanded", String(open)); if (open) $(".dd-item", ddMenu).focus(); });
      document.addEventListener("click", e => { if (!e.target.closest("#ddTienda") && !topbar.classList.contains("menu-open")) { ddMenu.hidden = true; ddBtn.setAttribute("aria-expanded", "false"); } });
      $("#ddTienda").addEventListener("keydown", e => {
        if (e.key === "Escape") { closeDd(); ddBtn.focus(); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { const it = $$(".dd-item", ddMenu); const i = it.indexOf(document.activeElement); if (i >= 0) { e.preventDefault(); it[(i + (e.key === "ArrowDown" ? 1 : it.length - 1)) % it.length].focus(); } }
      });
    }
    $$(".cat-tab").forEach(t => t.addEventListener("click", () => showCat(t.dataset.cat, false)));
    $(".cat-tabs").addEventListener("keydown", e => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const tabs = $$(".cat-tab"), i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
    });
    let qt; $("#q").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { filter.q = e.target.value; page = 1; renderGrid(); }, 120); });
    $("#onlyStock").addEventListener("change", e => { filter.only = e.target.checked; page = 1; renderGrid(); });

    $("#dMinus").addEventListener("click", () => { dQty--; updateDetailStock(); });
    $("#dPlus").addEventListener("click", () => { dQty++; updateDetailStock(); });
    $("#dAdd").addEventListener("click", () => current && addToCart(current, dQty));

    $("#cartBtn").addEventListener("click", () => openDrawer());
    $("#drawerClose").addEventListener("click", () => closeDrawer());
    $("#drawerBack").addEventListener("click", () => closeDrawer());
    $("#keepShopping").addEventListener("click", () => closeDrawer());
    $("#goCheckout").addEventListener("click", openCheckout);
    $("#doneBack").addEventListener("click", () => { closeCheckout(); showCat("pines", true); });

    const openPrivacy = () => openOverlay($("#privacyOverlay"));
    $("#privacyLink").addEventListener("click", openPrivacy);
    $$("[data-privacy]").forEach(b => b.addEventListener("click", openPrivacy));

    $$(".overlay").forEach(o => {
      o.addEventListener("click", e => { if (e.target === o || e.target.closest("[data-close]")) closeOverlay(o); });
    });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (!$("#privacyOverlay").hidden) return closeOverlay($("#privacyOverlay"));
      if (!$("#detailOverlay").hidden) return closeOverlay($("#detailOverlay"));
      if ($("#drawer").classList.contains("open")) return closeDrawer();
    });
    document.addEventListener("click", e => {
      if (selectedCard && !e.target.closest(".card")) { selectedCard.classList.remove("sel"); selectedCard = null; }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
