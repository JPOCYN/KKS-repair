import type { SessionUser } from "./db.js";

interface PageOptions {
  canonicalUrl?: string;
  description?: string;
  indexable?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const assetVersion = "20260829-supercar-docs";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page(title: string, content: string, user?: SessionUser | null, options: PageOptions = {}): string {
  const documentTitle = title.includes("Supercar Docs") ? title : `${title} · Supercar Docs`;
  const navigation = user
    ? `<nav aria-label="Primary navigation"><a href="/">Home</a><a href="/vehicles">Vehicle library</a>${user.role === "admin" ? '<a href="/admin">Administration</a>' : ""}<form method="post" action="/logout"><input type="hidden" name="_csrf" value="${escapeHtml(user.csrfToken)}"><button type="submit">Sign out</button></form></nav>`
    : `<nav aria-label="Primary navigation"><a href="/#about">About</a><a href="/#coverage">Coverage</a><a href="/#faq">FAQ</a><a class="header-cta" href="/login">Member sign in</a></nav>`;
  const description = options.description || "Independent access to recovered vehicle repair and service information for professional workshops.";
  const robots = options.indexable ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" : "noindex,nofollow";
  const canonical = options.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(options.canonicalUrl)}">` : "";
  const social = options.indexable
    ? `<meta property="og:type" content="website"><meta property="og:site_name" content="Supercar Docs"><meta property="og:locale" content="en_US"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(options.canonicalUrl || "")}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}">`
    : "";
  const structuredData = options.structuredData
    ? `<script type="application/ld+json">${JSON.stringify(options.structuredData).replaceAll("<", "\\u003c")}</script>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a0c10"><title>${escapeHtml(documentTitle)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${robots}">${canonical}${social}${structuredData}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/app.css?v=${assetVersion}"><script src="/app.js?v=${assetVersion}" defer></script></head><body><header class="site-header"><a class="brand" href="/" aria-label="Supercar Docs home"><span class="brand-mark" aria-hidden="true">S</span><span><strong>Supercar Docs</strong><small>Repair manual library</small></span></a>${navigation}</header><main>${content}</main><footer><div class="footer-summary"><span class="footer-brand">Supercar Docs</span><span>Independent multi-brand service information platform.</span></div><p class="footer-disclaimer"><strong>Independent content notice:</strong> Information on this website is collected from publicly available online sources for reference. Supercar Docs does not own, represent, endorse, or claim affiliation with any vehicle manufacturer or brand. All brand names, trademarks, documents, and related rights belong to their respective owners.</p></footer></body></html>`;
}

export function landingView(user: SessionUser | undefined, siteOrigin: string): string {
  const canonicalUrl = new URL("/", siteOrigin).toString();
  const description = "Browse protected McLaren repair manuals, workshop procedures, system information, wiring documentation, and technical PDFs. Ferrari and Lamborghini coverage is planned.";
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Supercar Docs",
      url: canonicalUrl,
      description,
      inLanguage: "en",
      audience: { "@type": "Audience", audienceType: "Independent automotive workshops and repair professionals" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Supercar Docs?",
          acceptedAnswer: { "@type": "Answer", text: "Supercar Docs is an independent, English-language library that helps workshop professionals navigate recovered supercar repair and service information collected from publicly available online sources." },
        },
        {
          "@type": "Question",
          name: "Is Supercar Docs affiliated with McLaren, Ferrari, Lamborghini, or other manufacturers?",
          acceptedAnswer: { "@type": "Answer", text: "No. Supercar Docs is independent and does not represent, endorse, or claim affiliation with any vehicle manufacturer or brand." },
        },
        {
          "@type": "Question",
          name: "Will more vehicle brands be added?",
          acceptedAnswer: { "@type": "Answer", text: "McLaren repair information is available now. Ferrari and Lamborghini catalogues are planned but are not yet available." },
        },
      ],
    },
  ];
  const destination = user ? (user.role === "admin" ? "/admin" : "/vehicles") : "/login";
  const action = user ? "Open your workspace" : "Access the repair library";
  return page(
    "McLaren Repair Manuals & Supercar Service Docs | Supercar Docs",
    `<section class="landing-hero"><div class="landing-hero__copy"><span class="section-label">Independent supercar workshop intelligence</span><h1>Supercar repair information, organised for the work ahead.</h1><p class="landing-lead">Supercar Docs gives automotive professionals private, English-language access to recovered service procedures, system descriptions, wiring documentation, and technical PDFs in one modern workspace.</p><div class="landing-actions"><a class="primary button" href="${destination}">${action}</a><a class="secondary button" href="#coverage">Explore coverage</a></div><div class="landing-proof"><span><strong>107,000+</strong> indexed documents and assets</span><span><strong>McLaren</strong> manuals available now</span><span><strong>Private</strong> member access</span></div></div><div class="landing-visual" aria-label="Supercar Docs document workflow"><div class="signal-card signal-card--large"><span class="section-label">Workshop search</span><strong>Vehicle → System → Procedure</strong><p>Move from a vehicle catalogue to the exact service document without digging through disconnected folders.</p><div class="signal-lines"><i></i><i></i><i></i><i></i></div></div><div class="signal-card signal-card--small"><span>Platform status</span><strong>McLaren library online</strong><i class="status-dot"></i></div></div></section><section class="brand-strip" aria-label="Platform direction"><span>Built for independent repair professionals</span><strong>McLaren available now</strong><span>Ferrari and Lamborghini planned</span></section><section id="about" class="landing-section landing-section--split"><div><span class="section-label">One reliable workspace</span><h2>Designed around workshop speed, not software complexity.</h2></div><div class="feature-grid"><article><span>01</span><h3>Find the vehicle</h3><p>Search a clean visual catalogue by supercar model or vehicle code.</p></article><article><span>02</span><h3>Navigate the manual</h3><p>Browse an English-only document tree with fast in-page search.</p></article><article><span>03</span><h3>Open the procedure</h3><p>Load recovered HTML, diagrams, technical images, and protected PDFs inside the same workspace.</p></article></div></section><section id="coverage" class="coverage-panel"><div><span class="section-label">Supercar manual coverage</span><h2>McLaren today. A multi-brand platform for tomorrow.</h2><p>Supercar Docs currently provides recovered McLaren repair procedures, system descriptions, wiring information, and technical PDFs. Ferrari and Lamborghini catalogues are planned additions; they will be listed as available only after their documents are verified and loaded.</p></div><ul><li><strong>McLaren repair manuals</strong><span>Available now for the recovered vehicle catalogue</span></li><li><strong>Ferrari manuals</strong><span>Planned future catalogue</span></li><li><strong>Lamborghini manuals</strong><span>Planned future catalogue</span></li><li><strong>Protected access</strong><span>Manual pages and PDFs require a member account</span></li></ul></section><section id="faq" class="faq-section"><div><span class="section-label">Clear answers</span><h2>About Supercar Docs</h2></div><div class="faq-list"><details open><summary>What is Supercar Docs?</summary><p>An independent, English-language library that helps workshop professionals navigate recovered supercar service information collected from publicly available online sources.</p></details><details><summary>Which repair manuals are available now?</summary><p>The current verified catalogue covers McLaren vehicles. Ferrari and Lamborghini catalogues are planned but are not yet available.</p></details><details><summary>Is this an official manufacturer website?</summary><p>No. Supercar Docs is independent and is not affiliated with, endorsed by, or representative of McLaren, Ferrari, Lamborghini, or any other vehicle manufacturer or brand.</p></details><details><summary>Why is an account required?</summary><p>Member access protects the document library, including manual pages and technical PDFs, and lets administrators control account and authorization-code validity.</p></details></div></section><section class="landing-cta"><div><span class="section-label">Ready for the next repair</span><h2>Open the supercar workshop library.</h2><p>Sign in with your Supercar Docs member account or activate access with an authorization code.</p></div><div class="landing-actions"><a class="primary button" href="${destination}">${action}</a>${user ? "" : '<a class="secondary button" href="/register">Activate a code</a>'}</div></section>`,
    user,
    { canonicalUrl, description, indexable: true, structuredData },
  );
}

export function loginView(error = ""): string {
  return page("Sign in", `<section class="auth-layout"><div class="auth-intro"><span class="section-label">Professional workshop access</span><h1>Technical knowledge, ready when the job begins.</h1><p>Open the protected Supercar Docs library from any modern browser. Your vehicle catalogue and manual access remain private behind your account.</p><ul class="trust-list"><li><span>01</span>Recovered manufacturer service information</li><li><span>02</span>Fast vehicle and document navigation</li><li><span>03</span>Private account access</li></ul></div><section class="auth-card"><div class="card-heading"><span class="section-label">Member portal</span><h2>Welcome back</h2><p>Sign in to continue to your repair library.</p></div>${error ? `<div class="alert" role="alert">${escapeHtml(error)}</div>` : ""}<form method="post" action="/login" class="stack"><label>Email address<input name="email" type="email" autocomplete="username" placeholder="name@example.com" required></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label><button class="primary" type="submit">Sign in to Supercar Docs</button></form><p class="auth-help">Have an unused authorization code? <a href="/register">Create an account</a>.</p></section></section>`);
}

export function registerView(error = "", values: Record<string, unknown> = {}): string {
  return page("Create account", `<section class="auth-layout"><div class="auth-intro"><span class="section-label">Activate your access</span><h1>Bring the complete repair library into your workflow.</h1><p>Create your private Supercar Docs account with an authorization code.</p><ul class="trust-list"><li><span>01</span>One account for the complete catalogue</li><li><span>02</span>Secure, time-controlled access</li><li><span>03</span>Desktop and mobile browser support</li></ul></div><section class="auth-card"><div class="card-heading"><span class="section-label">New member</span><h2>Create your account</h2><p>Enter your details and unused authorization code.</p></div>${error ? `<div class="alert" role="alert">${escapeHtml(error)}</div>` : ""}<form method="post" action="/register" class="stack"><label>Email address<input name="email" type="email" autocomplete="email" value="${escapeHtml(values.email)}" required></label><label>Full name<input name="name" maxlength="120" value="${escapeHtml(values.name)}" required></label><label>Authorization code<input name="authCode" autocomplete="off" maxlength="100" value="${escapeHtml(values.authCode)}" required></label><label>Password <small>Minimum 10 characters</small><input name="password" type="password" autocomplete="new-password" minlength="10" required></label><button class="primary" type="submit">Create account</button></form><p class="auth-help">Already registered? <a href="/login">Return to sign in</a>.</p></section></section>`);
}

const nonEnglishScripts = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
const nonEnglishDocumentLabel = /(?:japanese|arabic|french|german|spanish|italian|chinese|korean|portuguese|russian|\s-\s(?:ja|jp|de|fr|es|it|zh|ko|pt|ru)(?:\s-|\s|$))/i;

function isNonEnglishLabel(value: unknown): boolean {
  const label = String(value || "");
  return nonEnglishScripts.test(label) || nonEnglishDocumentLabel.test(label);
}

function englishVehicleDescription(car: Record<string, unknown>): string {
  const description = String(car.synopsis || "").trim();
  if (description && !nonEnglishScripts.test(description)) return description;
  const vehicle = [car.brand_name, car.name].filter(Boolean).join(" ");
  return `Recovered service information for ${vehicle || "this vehicle"}, including repair procedures, system descriptions and wiring documentation.`;
}

export function vehicleListView(user: SessionUser, cars: Array<Record<string, unknown>>): string {
  const cards = cars.map((car) => `<article class="vehicle-card" data-vehicle-card data-search="${escapeHtml(`${car.brand_name || ""} ${car.name || ""} ${car.code || ""}`.toLowerCase())}"><div class="vehicle-card__media"><img src="${escapeHtml(car.image_path)}" alt="${escapeHtml(car.name)}" loading="lazy"><span class="availability"><i></i> Manual available</span></div><div class="vehicle-card__body"><span class="section-label">${escapeHtml(car.brand_name)}</span><h2>${escapeHtml(car.name)}</h2><p>${escapeHtml(englishVehicleDescription(car))}</p><a class="card-link" href="/vehicles/${escapeHtml(car.id)}"><span>Open service manual</span><span aria-hidden="true">→</span></a></div></article>`).join("");
  return page("Vehicle library", `<section class="library-hero"><div><span class="section-label">Member workspace</span><h1>Vehicle repair library</h1><p>Welcome back, ${escapeHtml(user.name)}. Choose a vehicle to browse its recovered technical documentation.</p></div><div class="library-meta"><strong>${cars.length}</strong><span>vehicles available</span></div></section><section class="library-toolbar" aria-label="Vehicle filters"><label class="search-field"><span class="sr-only">Search vehicles</span><span aria-hidden="true">⌕</span><input type="search" placeholder="Search by vehicle or model" data-vehicle-search autocomplete="off"></label><p><strong data-result-count>${cars.length}</strong> vehicles</p></section><section class="vehicle-grid">${cards}</section><p class="empty-results" data-empty-results hidden>No vehicles match your search.</p>`, user);
}

export function englishOnlyManualMenu(menu: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const hidden = new Set(menu.filter((item) => isNonEnglishLabel(item.name)).map((item) => String(item.id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of menu) {
      if (item.parent_id !== null && hidden.has(String(item.parent_id)) && !hidden.has(String(item.id))) {
        hidden.add(String(item.id));
        changed = true;
      }
    }
  }
  return menu.filter((item) => !hidden.has(String(item.id)));
}

export function vehicleDetailView(user: SessionUser, car: Record<string, unknown>, menu: Array<Record<string, unknown>>): string {
  const englishMenu = englishOnlyManualMenu(menu);
  const children = new Map<string, Array<Record<string, unknown>>>();
  for (const item of englishMenu) {
    const key = item.parent_id === null ? "root" : String(item.parent_id);
    children.set(key, [...(children.get(key) || []), item]);
  }
  const renderBranch = (parentId: string): string => `<ul class="manual-tree">${(children.get(parentId) || []).map((item) => {
    const nested = children.has(String(item.id));
    const label = escapeHtml(item.name);
    const readerUrl = item.relative_file
      ? `/modern-manuals/index.html?manual=${encodeURIComponent(String(car.folder_name))}&page=${encodeURIComponent(String(item.relative_file))}`
      : "";
    const content = item.relative_file
      ? `<a href="${escapeHtml(readerUrl)}" data-manual-link>${label}</a>`
      : `<span>${label}</span>`;
    return nested
      ? `<li><details${item.parent_id === null ? " open" : ""}><summary>${label}</summary>${renderBranch(String(item.id))}</details></li>`
      : `<li>${content}</li>`;
  }).join("")}</ul>`;
  const menuItems = englishMenu.length
    ? renderBranch("root")
    : `<div class="empty"><h2>Manual content recovery in progress</h2><p>The vehicle catalog is recovered. Its original manual page files still need to be copied from the old server.</p></div>`;
  const linkedDocuments = englishMenu.filter((item) => item.relative_file).length;
  const firstDocument = englishMenu.find((item) => item.relative_file)?.relative_file;
  const firstReaderUrl = firstDocument
    ? `/modern-manuals/index.html?manual=${encodeURIComponent(String(car.folder_name))}&page=${encodeURIComponent(String(firstDocument))}`
    : "";
  const firstLegacyUrl = firstDocument
    ? `/manuals/${encodeURIComponent(String(car.folder_name))}/html/${String(firstDocument).split("/").map((part) => encodeURIComponent(part)).join("/")}`
    : "";
  const manualArea = englishMenu.length
    ? `<section class="manual-layout manual-layout--launch"><aside><div class="manual-sidebar__header"><span class="section-label">Service information</span><h2>Manual contents</h2><p>${linkedDocuments.toLocaleString("en-US")} English documents</p><label class="search-field search-field--compact"><span class="sr-only">Search manual contents</span><span aria-hidden="true">⌕</span><input type="search" placeholder="Search contents" data-manual-search autocomplete="off"></label></div><nav class="manual-navigation" aria-label="Manual contents">${menuItems}</nav></aside><div class="manual-reader-launch"><span class="reader-launch-mark" aria-hidden="true">S</span><span class="section-label">Modern manual reader</span><h2>Open a cleaner workshop workspace.</h2><p>Use the responsive reader for fast navigation, searchable English contents, technical images, and protected PDF attachments.</p><div class="form-buttons"><a class="primary button" href="${escapeHtml(firstReaderUrl)}">Open modern reader</a><a class="secondary button" href="${escapeHtml(firstLegacyUrl)}" target="_blank" rel="noopener">Legacy fallback</a></div><small>Every document in the contents opens in the authenticated modern reader. The original protected manual route remains available for recovery and troubleshooting.</small></div></section>`
    : `<section class="manual-pending">${menuItems}</section>`;
  return page(String(car.name), `<a class="back-link" href="/vehicles"><span aria-hidden="true">←</span> Vehicle library</a><section class="vehicle-heading"><div class="vehicle-heading__media"><img src="${escapeHtml(car.image_path)}" alt="${escapeHtml(car.name)}"></div><div><span class="section-label">${escapeHtml(car.brand_name)} service information</span><h1>${escapeHtml(car.name)}</h1><p>${escapeHtml(englishVehicleDescription(car))}</p><div class="vehicle-facts"><span><strong>${linkedDocuments.toLocaleString("en-US")}</strong> documents</span><span><strong>English</strong> interface</span><span><strong>Private</strong> access</span></div></div></section>${manualArea}`, user);
}

function table(headers: string[], rows: unknown[][]): string {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function adminView(user: SessionUser, data: {
  counts: Record<string, number>;
  cars: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  codes: Array<Record<string, unknown>>;
}): string {
  const stats = Object.entries(data.counts).map(([label, count]) => `<article><strong>${count}</strong><span>${escapeHtml(label)}</span></article>`).join("");
  const carTable = table(["Brand", "Vehicle", "Visible"], data.cars.map((row) => [row.brand_name, row.name, statusLabel(row.is_show)]));
  const userTable = table(["Email", "Name", "Status"], data.users.map((row) => [row.email, row.name, statusLabel(row.status)]));
  const codeTable = table(["Authorization code", "Access hours", "Used", "Status"], data.codes.map((row) => [row.code, row.duration_hours, yesNo(row.is_used), statusLabel(row.status)]));
  const links = `<section class="admin-actions"><a href="/admin/vehicles"><span class="admin-action-icon" aria-hidden="true">V</span><strong>Vehicles</strong><span>Edit catalogue and visibility</span></a><a href="/admin/members"><span class="admin-action-icon" aria-hidden="true">M</span><strong>Members</strong><span>Create accounts and extend access</span></a><a href="/admin/codes"><span class="admin-action-icon" aria-hidden="true">C</span><strong>Authorization codes</strong><span>Issue, review, and disable codes</span></a></section>`;
  const quickActions = `<section class="admin-workbench"><div class="admin-section-heading"><div><span class="section-label">Daily operations</span><h2>Quick actions</h2></div><p>Complete common access tasks without navigating through multiple pages.</p></div><div class="quick-action-grid"><form method="post" action="/admin/codes" class="quick-action-card"><span class="quick-action-card__number">01</span><h3>Generate an access code</h3><p>Create an active code with a useful duration preset. The secure code is generated automatically.</p>${csrf(user)}<input type="hidden" name="code" value=""><input type="hidden" name="status" value="1"><label>Access period<select name="durationHours" required><option value="720">30 days</option><option value="2160">90 days</option><option value="4380">6 months</option><option value="8760">1 year</option></select></label><button class="primary" type="submit">Generate code</button></form><article class="quick-action-card"><span class="quick-action-card__number">02</span><h3>Add a customer</h3><p>Create a member account, set its VIP expiry, and choose whether access starts active.</p><a class="secondary button" href="/admin/members/new">Add member</a></article><article class="quick-action-card"><span class="quick-action-card__number">03</span><h3>Add a vehicle</h3><p>Prepare the catalogue for another model or future brand and connect its manual folder.</p><a class="secondary button" href="/admin/vehicles/new">Add vehicle</a></article></div></section>`;
  return page("Administration", `<section class="admin-hero"><div><span class="eyebrow">Supercar Docs control room</span><h1>Administration</h1><p>Manage customer access, authorization codes, vehicle coverage, and the recovered catalogue from one operational dashboard.</p></div><div class="admin-hero__status"><i></i><span>Application online</span><strong>${escapeHtml(user.email)}</strong></div></section><section class="stats">${stats}</section>${quickActions}${links}<section class="admin-data-section"><div class="admin-section-heading"><h2>Recent vehicles</h2><a href="/admin/vehicles">Manage all</a></div>${carTable}</section><section class="admin-data-section"><div class="admin-section-heading"><h2>Recent members</h2><a href="/admin/members">Manage all</a></div>${userTable}</section><section class="admin-data-section"><div class="admin-section-heading"><h2>Recent authorization codes</h2><a href="/admin/codes">Manage all</a></div>${codeTable}</section>`, user);
}

function statusLabel(value: unknown): string {
  return Number(value) === 1 ? "Active" : "Disabled";
}

function yesNo(value: unknown): string {
  return Number(value) === 1 ? "Yes" : "No";
}

function message(saved: boolean, error = ""): string {
  if (error) return `<div class="alert">${escapeHtml(error)}</div>`;
  return saved ? '<div class="success">Changes saved.</div>' : "";
}

function csrf(user: SessionUser): string {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(user.csrfToken)}">`;
}

function checked(value: unknown): string {
  return Number(value) === 1 ? " checked" : "";
}

function dateValue(value: unknown): string {
  return String(value || "").slice(0, 10);
}

export function adminVehiclesView(user: SessionUser, cars: Array<Record<string, unknown>>, saved = false): string {
  const rows = cars.map((row) => [row.brand_name, row.code, row.name, statusLabel(row.is_show), `<a href="/admin/vehicles/${escapeHtml(row.id)}/edit">Edit</a>`]);
  return page("Manage vehicles", `<div class="page-heading"><div><a href="/admin">← Dashboard</a><h1>Vehicles</h1></div><a class="primary button" href="/admin/vehicles/new">Add vehicle</a></div>${message(saved)}${tableHtml(["Brand", "Code", "Vehicle", "Visible", ""], rows)}`, user);
}

export function adminVehicleFormView(user: SessionUser, brands: Array<Record<string, unknown>>, car: Record<string, unknown> = {}, error = ""): string {
  const editing = Boolean(car.id);
  const brandOptions = brands.map((brand) => `<option value="${escapeHtml(brand.id)}"${Number(brand.id) === Number(car.brand_id) ? " selected" : ""}>${escapeHtml(brand.brand_name)}</option>`).join("");
  return page(editing ? "Edit vehicle" : "Add vehicle", `<a href="/admin/vehicles">← Vehicles</a><section class="form-card"><h1>${editing ? "Edit" : "Add"} vehicle</h1>${message(false, error)}<form method="post" action="${editing ? `/admin/vehicles/${escapeHtml(car.id)}` : "/admin/vehicles"}" class="form-grid">${csrf(user)}<label>Brand<select name="brandId" required>${brandOptions}</select></label><label>Code<input name="code" maxlength="100" value="${escapeHtml(car.code)}" required></label><label class="wide">Vehicle name<input name="name" maxlength="200" value="${escapeHtml(car.name)}" required></label><label class="wide">Image path<input name="imagePath" maxlength="500" value="${escapeHtml(car.image_path)}"></label><label class="wide">Description<textarea name="synopsis" maxlength="5000" rows="6">${escapeHtml(car.synopsis)}</textarea></label><label>Manual folder<input name="folderName" maxlength="200" value="${escapeHtml(car.folder_name)}" required></label><label>Manual type<input name="menuType" maxlength="100" value="${escapeHtml(car.menu_type)}"></label><label>Manual ID<input name="manualId" type="number" value="${escapeHtml(car.manual_id)}"></label><label>Sort order<input name="sort" type="number" value="${escapeHtml(car.sort ?? 0)}" required></label><label class="check"><input name="isShow" type="checkbox" value="1"${checked(car.is_show ?? 1)}> Visible to members</label><div class="wide form-buttons"><button class="primary" type="submit">Save vehicle</button></div></form></section>`, user);
}

export function adminMembersView(user: SessionUser, members: Array<Record<string, unknown>>, saved = false, extended = false): string {
  const rows = members.map((row) => [row.email, row.name, statusLabel(row.status), statusLabel(row.vip_status), dateValue(row.vip_expires_at), `<div class="row-actions"><a href="/admin/members/${escapeHtml(row.id)}/edit">Edit</a><form method="post" action="/admin/members/${escapeHtml(row.id)}/extend"><input type="hidden" name="_csrf" value="${escapeHtml(user.csrfToken)}"><label class="sr-only" for="extend-${escapeHtml(row.id)}">Extension period</label><select id="extend-${escapeHtml(row.id)}" name="days" aria-label="Extension period"><option value="30">+30 days</option><option value="90">+90 days</option><option value="365">+1 year</option></select><button type="submit">Extend</button></form></div>`]);
  const notice = extended ? '<div class="success">VIP access extended from the later of today or the current expiry date.</div>' : message(saved);
  return page("Manage members", `<div class="page-heading"><div><a href="/admin">← Dashboard</a><h1>Members</h1><p>Create accounts, manage access status, and extend VIP dates.</p></div><a class="primary button" href="/admin/members/new">Add member</a></div>${notice}${tableHtml(["Email", "Name", "Account", "VIP", "Expiry", "Actions"], rows)}`, user);
}

export function adminMemberFormView(user: SessionUser, member: Record<string, unknown> = {}, error = ""): string {
  const editing = Boolean(member.id);
  return page(editing ? "Edit member" : "Add member", `<a href="/admin/members">← Members</a><section class="form-card"><h1>${editing ? "Edit" : "Add"} member</h1>${message(false, error)}<form method="post" action="${editing ? `/admin/members/${escapeHtml(member.id)}` : "/admin/members"}" class="form-grid">${csrf(user)}<label>Email<input name="email" type="email" maxlength="254" value="${escapeHtml(member.email)}" required></label><label>Name<input name="name" maxlength="120" value="${escapeHtml(member.name)}" required></label><label class="wide">Contact address<input name="contactAddress" maxlength="500" value="${escapeHtml(member.contact_address)}"></label><label>${editing ? "New password (leave blank to keep it)" : "Password"}<input name="password" type="password" minlength="10" autocomplete="new-password"${editing ? "" : " required"}></label><label>VIP expiry<input name="vipExpiresAt" type="date" value="${escapeHtml(dateValue(member.vip_expires_at))}"></label><label class="check"><input name="status" type="checkbox" value="1"${checked(member.status ?? 1)}> Account active</label><label class="check"><input name="vipStatus" type="checkbox" value="1"${checked(member.vip_status ?? 0)}> VIP active</label><div class="wide form-buttons"><button class="primary" type="submit">Save member</button></div></form></section>`, user);
}

export function adminCodesView(user: SessionUser, codes: Array<Record<string, unknown>>, saved = false): string {
  const rows = codes.map((row) => [row.code, row.duration_hours, yesNo(row.is_used), statusLabel(row.status), `<a href="/admin/codes/${escapeHtml(row.id)}/edit">Edit</a>`]);
  return page("Manage authorization codes", `<div class="page-heading"><div><a href="/admin">← Dashboard</a><h1>Authorization codes</h1></div><a class="primary button" href="/admin/codes/new">Add code</a></div>${message(saved)}${tableHtml(["Code", "Access hours", "Used", "Status", ""], rows)}`, user);
}

export function adminCodeFormView(user: SessionUser, code: Record<string, unknown> = {}, error = ""): string {
  const editing = Boolean(code.id);
  return page(editing ? "Edit authorization code" : "Add authorization code", `<a href="/admin/codes">← Authorization codes</a><section class="form-card"><span class="section-label">Customer activation</span><h1>${editing ? "Edit" : "Add"} authorization code</h1><p>${editing ? "Change this code's validity or disable future use." : "Leave the code field blank to generate a secure value automatically."}</p>${message(false, error)}<form method="post" action="${editing ? `/admin/codes/${escapeHtml(code.id)}` : "/admin/codes"}" class="form-grid">${csrf(user)}<label>Code<input name="code" maxlength="100" pattern="[A-Za-z0-9_-]+" value="${escapeHtml(code.code)}" placeholder="Automatically generated"></label><label>Access duration (hours)<input name="durationHours" type="number" min="1" step="1" value="${escapeHtml(code.duration_hours ?? 720)}" required data-duration-input><small>Choose a preset or enter a custom number of hours.</small></label><div class="wide duration-presets" aria-label="Duration presets"><button type="button" data-duration-value="720">30 days</button><button type="button" data-duration-value="2160">90 days</button><button type="button" data-duration-value="4380">6 months</button><button type="button" data-duration-value="8760">1 year</button></div><label class="check"><input name="status" type="checkbox" value="1"${checked(code.status ?? 1)}> Code active</label>${editing ? `<p class="wide muted">Used: ${yesNo(code.is_used)}</p>` : ""}<div class="wide form-buttons"><button class="primary" type="submit">Save authorization code</button></div></form></section>`, user);
}

function tableHtml(headers: string[], rows: unknown[][]): string {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value, index) => `<td>${index === row.length - 1 ? String(value ?? "") : escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
