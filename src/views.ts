import type { SessionUser } from "./db.js";
import { hasLibraryAccess, libraryAccessState } from "./access.js";

interface PageOptions {
  canonicalUrl?: string;
  description?: string;
  indexable?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const assetVersion = "20260829-auth-tabs";
const policyDate = "29 August 2026";

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
  const memberDestination = user && user.role === "customer" && !hasLibraryAccess(user) ? "/access" : "/vehicles";
  const memberLabel = memberDestination === "/access" ? "Access status" : "Vehicle library";
  const navigation = user
    ? `<nav aria-label="Primary navigation"><a href="/">Home</a><a href="${memberDestination}">${memberLabel}</a>${user.role === "admin" ? '<a href="/admin">Administration</a>' : ""}<form method="post" action="/logout"><input type="hidden" name="_csrf" value="${escapeHtml(user.csrfToken)}"><button type="submit">Sign out</button></form></nav>`
    : `<nav aria-label="Primary navigation"><a href="/#about">About</a><a href="/#coverage">Coverage</a><a href="/#faq">FAQ</a><a class="header-cta" href="/login">Member sign in</a></nav>`;
  const description = options.description || "Supercar Docs is an independent, protected supercar repair manual and workshop information library.";
  const robots = options.indexable ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" : "noindex,nofollow";
  const canonical = options.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(options.canonicalUrl)}">` : "";
  const social = options.indexable
    ? `<meta property="og:type" content="website"><meta property="og:site_name" content="Supercar Docs"><meta property="og:locale" content="en_US"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(options.canonicalUrl || "")}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}">`
    : "";
  const structuredData = options.structuredData
    ? `<script type="application/ld+json">${JSON.stringify(options.structuredData).replaceAll("<", "\\u003c")}</script>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a0c10"><meta name="application-name" content="Supercar Docs"><title>${escapeHtml(documentTitle)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${robots}">${canonical}${social}${structuredData}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/app.css?v=${assetVersion}"><script src="/app.js?v=${assetVersion}" defer></script></head><body><header class="site-header"><a class="brand" href="/" aria-label="Supercar Docs home"><img class="brand-mark" src="/favicon.svg" alt=""><span><strong>Supercar Docs</strong><small>Repair manual library</small></span></a>${navigation}</header><main>${content}</main><footer><div class="footer-summary"><span class="footer-brand">Supercar Docs</span><span>Independent multi-brand service information platform.</span><nav class="footer-links" aria-label="Legal and support"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact &amp; takedown</a></nav></div><p class="footer-disclaimer"><strong>Independent content notice:</strong> Information on this website is collected from publicly available online sources for reference. Supercar Docs does not own, represent, endorse, or claim affiliation with any vehicle manufacturer or brand. All brand names, trademarks, documents, and related rights belong to their respective owners. Rights holders may submit a review or removal request through our <a href="/contact">takedown process</a>.</p></footer></body></html>`;
}

export function landingView(user: SessionUser | undefined, siteOrigin: string, appOrigin = siteOrigin): string {
  const canonicalUrl = new URL("/", siteOrigin).toString();
  const description = "Supercar Docs is an independent, protected supercar repair manual library for workshops. Browse McLaren service procedures now, with Ferrari and Lamborghini coverage planned.";
  const repairPreviews = [
    {
      title: "How to approach McLaren front brake service information",
      category: "Braking systems",
      summary: "Start with the exact model and vehicle identity, then confirm the correct brake system variant, approved lifting method, component condition checks, consumables, and model-specific tightening data before disassembly.",
      detail: "The protected library organises front brake disc, caliper, cooling duct, brake-fluid, and related torque documents under the relevant vehicle. Always use the complete vehicle-specific procedure and current safety information before work begins.",
    },
    {
      title: "How to troubleshoot a McLaren door latch concern",
      category: "Body systems",
      summary: "A useful diagnostic path separates mechanical latch alignment, emergency-release operation, wiring, control-unit faults, and door-seal interference before parts are removed.",
      detail: "Members can navigate from Door Hardware to latch, striker, hinge, glazing, and electronic-control documents without exposing the source manual publicly. Scan data and the correct model procedure remain essential.",
    },
    {
      title: "How to find the correct McLaren torque settings",
      category: "Workshop specifications",
      summary: "Torque values should be selected by exact vehicle, component, fastener, and procedure—not copied from a similar model. Confirm whether angle tightening, replacement hardware, or a staged sequence applies.",
      detail: "Supercar Docs connects repair procedures with their protected torque-setting references so technicians can verify context rather than relying on an isolated number from a search result.",
    },
  ];
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Supercar Docs",
      alternateName: "Supercar Docs Repair Manual Library",
      url: canonicalUrl,
      description,
      keywords: "supercar repair manuals, workshop manuals, McLaren repair manuals, Ferrari repair manuals, Lamborghini repair manuals",
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
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Supercar Docs supercar repair manual library",
      url: canonicalUrl,
      description,
      inLanguage: "en",
      about: [
        { "@type": "Brand", name: "McLaren" },
        { "@type": "Brand", name: "Ferrari" },
        { "@type": "Brand", name: "Lamborghini" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Supercar repair information previews",
      itemListElement: repairPreviews.map((preview, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: { "@type": "TechArticle", headline: preview.title, description: preview.summary, inLanguage: "en" },
      })),
    },
  ];
  const destinationPath = user ? (user.role === "admin" ? "/admin" : hasLibraryAccess(user) ? "/vehicles" : "/access") : "/login";
  const destination = new URL(destinationPath, appOrigin).toString();
  const registrationUrl = new URL("/login#register", appOrigin).toString();
  const action = user ? "Open your workspace" : "Access the repair library";
  const previewCards = repairPreviews.map((preview) => `<article class="repair-preview"><span class="section-label">${escapeHtml(preview.category)}</span><h3>${escapeHtml(preview.title)}</h3><p>${escapeHtml(preview.summary)}</p><div class="repair-preview__fade"><p>${escapeHtml(preview.detail)}</p></div><small>Original index preview—not a copied manufacturer procedure.</small><a href="${destination}">${user ? "Open the protected library" : "Sign in for the full library"} <span aria-hidden="true">→</span></a></article>`).join("");
  return page(
    "Supercar Docs | Supercar Repair Manuals & Workshop Library",
    `<section class="landing-hero"><div class="landing-hero__copy"><span class="section-label">Independent supercar workshop intelligence</span><h1>The supercar repair manual library for independent workshops.</h1><p class="landing-lead">Supercar Docs gives automotive professionals private, English-language access to recovered service procedures, system descriptions, wiring documentation, and technical PDFs in one modern workspace.</p><div class="landing-actions"><a class="primary button" href="${destination}">${action}</a><a class="secondary button" href="#coverage">Explore coverage</a></div><div class="landing-proof"><span><strong>107,000+</strong> indexed documents and assets</span><span><strong>McLaren</strong> manuals available now</span><span><strong>Private</strong> member access</span></div></div><div class="landing-visual" aria-label="Independent supercar workshop and Supercar Docs document workflow"><img class="landing-visual__image" src="/supercar-workshop-hero.jpg" alt="Fictional unbranded supercar in a professional independent workshop" width="1672" height="941" fetchpriority="high"><div class="signal-card signal-card--large"><span class="section-label">Workshop search</span><strong>Vehicle → System → Procedure</strong><p>Move from a vehicle catalogue to the exact service document without digging through disconnected folders.</p><div class="signal-lines"><i></i><i></i><i></i><i></i></div></div><div class="signal-card signal-card--small"><span>Platform status</span><strong>McLaren library online</strong><i class="status-dot"></i></div></div></section><section class="brand-strip" aria-label="Platform direction"><span>Built for independent repair professionals</span><strong>McLaren available now</strong><span>Ferrari and Lamborghini planned</span></section><section class="coverage-brands" aria-label="Supercar Docs brand coverage"><div class="coverage-brand coverage-brand--available"><span class="coverage-brand__name">McLaren</span><small>Manuals available</small></div><div class="coverage-brand"><span class="coverage-brand__name">Ferrari</span><small>Catalogue planned</small></div><div class="coverage-brand"><span class="coverage-brand__name">Lamborghini</span><small>Catalogue planned</small></div><p>Independent coverage labels only. Supercar Docs is not affiliated with or endorsed by these manufacturers.</p></section><section id="about" class="landing-section landing-section--split"><div><span class="section-label">One reliable workspace</span><h2>Designed around workshop speed, not software complexity.</h2></div><div class="feature-grid"><article><span>01</span><h3>Find the vehicle</h3><p>Search a clean visual catalogue by supercar model or vehicle code.</p></article><article><span>02</span><h3>Navigate the manual</h3><p>Browse an English-only document tree with fast in-page search.</p></article><article><span>03</span><h3>Open the procedure</h3><p>Load recovered HTML, diagrams, technical images, and protected PDFs inside the same workspace.</p></article></div></section><section id="coverage" class="coverage-panel"><div><span class="section-label">Supercar manual coverage</span><h2>McLaren today. A multi-brand platform for tomorrow.</h2><p>Supercar Docs currently provides recovered McLaren repair procedures, system descriptions, wiring information, and technical PDFs. Ferrari and Lamborghini catalogues are planned additions; they will be listed as available only after their documents are verified and loaded.</p></div><ul><li><strong>McLaren repair manuals</strong><span>Available now for the recovered vehicle catalogue</span></li><li><strong>Ferrari manuals</strong><span>Planned future catalogue</span></li><li><strong>Lamborghini manuals</strong><span>Planned future catalogue</span></li><li><strong>Protected access</strong><span>Manual pages and PDFs require a member account with current library access</span></li></ul></section><section class="repair-preview-section" aria-labelledby="repair-preview-heading"><div class="repair-preview-heading"><span class="section-label">Searchable repair topics</span><h2 id="repair-preview-heading">Preview the questions the library helps workshops answer.</h2><p>These original summaries make the catalogue discoverable without publishing protected manufacturer pages, specifications, or procedures.</p></div><div class="repair-preview-grid">${previewCards}</div></section><section id="faq" class="faq-section"><div><span class="section-label">Clear answers</span><h2>About Supercar Docs</h2></div><div class="faq-list"><details open><summary>What is Supercar Docs?</summary><p>An independent, English-language library that helps workshop professionals navigate recovered supercar service information collected from publicly available online sources.</p></details><details><summary>Which repair manuals are available now?</summary><p>The current verified catalogue covers McLaren vehicles. Ferrari and Lamborghini catalogues are planned but are not yet available.</p></details><details><summary>Is this an official manufacturer website?</summary><p>No. Supercar Docs is independent and is not affiliated with, endorsed by, or representative of McLaren, Ferrari, Lamborghini, or any other vehicle manufacturer or brand.</p></details><details><summary>Why is an account required?</summary><p>Member access protects the document library, including manual pages and technical PDFs, and lets administrators separately control account sign-in and library validity.</p></details></div></section><section class="landing-cta"><div><span class="section-label">Ready for the next repair</span><h2>Open the supercar workshop library.</h2><p>Sign in with your Supercar Docs member account or activate access with an authorization code.</p></div><div class="landing-actions"><a class="primary button" href="${destination}">${action}</a>${user ? "" : `<a class="secondary button" href="${registrationUrl}">Activate a code</a>`}</div></section>`,
    user,
    { canonicalUrl, description, indexable: true, structuredData },
  );
}

interface AuthPortalOptions {
  loginError?: string;
  registerError?: string;
  registerValues?: Record<string, unknown>;
}

export function authPortalView(options: AuthPortalOptions = {}): string {
  const values = options.registerValues || {};
  const registerActive = Boolean(options.registerError);
  return page("Member access", `<section class="auth-portal"><div class="auth-portal__intro"><span class="section-label">Protected workshop access</span><h1>Access Supercar Docs.</h1><p>Sign in to your account or create one with an unused authorization code.</p></div><div class="auth-shell" data-auth-portal data-default-auth-tab="${registerActive ? "register" : "signin"}"><div class="auth-switch" role="tablist" aria-label="Member access"><button type="button" role="tab" id="signin-tab" aria-controls="signin" aria-selected="${String(!registerActive)}" class="${registerActive ? "" : "is-active"}" data-auth-tab="signin">Sign in</button><button type="button" role="tab" id="register-tab" aria-controls="register" aria-selected="${String(registerActive)}" class="${registerActive ? "is-active" : ""}" data-auth-tab="register">Sign up</button></div><section class="auth-card" id="signin" role="tabpanel" aria-labelledby="signin-tab"${registerActive ? " hidden" : ""}><div class="card-heading"><span class="section-label">Existing member</span><h2>Sign in</h2><p>Continue to your account and repair library.</p></div>${options.loginError ? `<div class="alert" role="alert">${escapeHtml(options.loginError)}</div>` : ""}<form method="post" action="/login" class="stack"><label>Email address<input name="email" type="email" autocomplete="username" placeholder="name@example.com" required></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label><button class="primary" type="submit">Sign in to Supercar Docs</button></form></section><section class="auth-card auth-card--register" id="register" role="tabpanel" aria-labelledby="register-tab"${registerActive ? "" : " hidden"}><div class="card-heading"><span class="section-label">New member</span><h2>Create account</h2><p>Use your email and an unused authorization code. No profile name is required.</p></div>${options.registerError ? `<div class="alert" role="alert">${escapeHtml(options.registerError)}</div>` : ""}<form method="post" action="/register" class="stack"><label>Email address<input name="email" type="email" autocomplete="email" value="${escapeHtml(values.email)}" required></label><label>Authorization code<input name="authCode" autocomplete="off" maxlength="100" value="${escapeHtml(values.authCode)}" required></label><label>Password <small>Minimum 10 characters</small><input name="password" type="password" autocomplete="new-password" minlength="10" required></label><label class="consent-check"><input name="acceptPolicies" type="checkbox" value="yes" required><span>I agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Use</a> and acknowledge the <a href="/privacy" target="_blank" rel="noopener">Privacy and Personal Information Collection Statement</a>.</span></label><button class="primary" type="submit">Create account</button></form><p class="collection-notice"><strong>Why we collect this data:</strong> your email identifies and secures your account, controls access, and allows account support.</p></section></div></section>`);
}

export function loginView(error = ""): string {
  return authPortalView({ loginError: error });
}

export function registerView(error = "", values: Record<string, unknown> = {}): string {
  return authPortalView({ registerError: error, registerValues: values });
}

export function accessStatusView(user: SessionUser): string {
  const state = libraryAccessState(user);
  const expiry = user.vipExpiresAt ? dateValue(user.vipExpiresAt) : "No expiry set";
  const active = state === "active";
  const heading = active ? "Your library is ready" : state === "expired" ? "Your library access has expired" : "Your library access is inactive";
  const detail = active
    ? "Your account and library access are active. You can open the vehicle catalogue and protected manuals."
    : "Your account is still enabled, so you can sign in and view this status. Vehicle pages, manual files, and PDFs remain locked until an administrator renews or activates library access.";
  return page("Access status", `<section class="access-status"><span class="section-label">Member account</span><h1>${heading}</h1><p>${detail}</p><dl><div><dt>Account</dt><dd><span class="status-pill status-pill--active">Enabled</span></dd></div><div><dt>Library access</dt><dd><span class="status-pill status-pill--${active ? "active" : state === "expired" ? "warning" : "disabled"}">${active ? "Active" : state === "expired" ? "Expired" : "Off"}</span></dd></div><div><dt>Expiry</dt><dd>${escapeHtml(expiry)}</dd></div></dl><div class="landing-actions">${active ? '<a class="primary button" href="/vehicles">Open vehicle library</a>' : '<a class="primary button" href="/contact">Request access help</a>'}<a class="secondary button" href="/">Return home</a></div></section>`, user);
}

function legalLayout(label: string, title: string, introduction: string, sections: string): string {
  return `<section class="legal-hero"><span class="section-label">${escapeHtml(label)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(introduction)}</p><small>Last updated: ${policyDate}</small></section><article class="legal-content">${sections}</article>`;
}

export function privacyView(siteOrigin: string): string {
  const canonicalUrl = new URL("/privacy", siteOrigin).toString();
  return page("Privacy Statement", legalLayout("Privacy", "Privacy and Personal Information Collection Statement", "This statement explains what personal data Supercar Docs collects, why it is used, and how you can exercise your data rights.", `<section><h2>Data we collect</h2><p>When you register or sign in, we process your email address, authorization and membership status, session identifiers, and security events. If you contact us, we also process the name and message you provide. Ordinary server logs may include IP address, browser type, requested URL, and time.</p></section><section><h2>Purposes and necessity</h2><p>We use this data to create and secure accounts, control access to the manual library, administer memberships, answer support, privacy, and copyright requests, prevent misuse, diagnose faults, maintain security, and comply with applicable legal obligations. Required registration fields are necessary to provide an account; without them we cannot activate access.</p></section><section><h2>Cookies</h2><p>The service uses a strictly necessary, secure session cookie to keep signed-in members authenticated. It is not used for advertising or cross-site tracking.</p></section><section><h2>Disclosure and hosting</h2><p>Data is available only to authorised site administrators and service providers needed to operate the platform, including Hostinger hosting and database infrastructure. We do not sell personal data. Data may be disclosed where required by law or necessary to protect users, the service, or third-party rights.</p></section><section><h2>Retention and security</h2><p>Account information is retained while an account is active and for a reasonable period needed for administration, security, disputes, and legal compliance. Contact and takedown requests are retained while they are handled and for a reasonable audit period. We use access controls, password hashing, protected sessions, encrypted transport, and private document storage, but no internet service can guarantee absolute security.</p></section><section><h2>Your choices and rights</h2><p>You may request access to or correction of your personal data, ask about retention or deletion, or raise a privacy concern through the <a href="/contact">contact form</a>. We may need to verify your identity before acting.</p></section><section><h2>Changes</h2><p>We may update this statement as the service changes. The current version and update date will remain available on this page.</p></section>`), undefined, { canonicalUrl, description: "How Supercar Docs collects, uses, secures, and handles personal data.", indexable: false });
}

export function termsView(siteOrigin: string): string {
  const canonicalUrl = new URL("/terms", siteOrigin).toString();
  return page("Terms of Use", legalLayout("Terms", "Terms of Use", "These terms apply when you access the Supercar Docs website, member library, and recovered service information.", `<section><h2>Independent service</h2><p>Supercar Docs is an independent information platform. It is not affiliated with, endorsed by, authorised by, or representative of McLaren, Ferrari, Lamborghini, or any other manufacturer or brand.</p></section><section><h2>Account access</h2><p>You must provide accurate registration information, keep your credentials confidential, and promptly report suspected unauthorised access. Accounts and authorization codes may not be sold, shared, automated, scraped, or used to give third parties access. We may suspend access needed to protect the service, other users, or third-party rights.</p></section><section><h2>Permitted use</h2><p>The library is provided for lawful reference by qualified automotive professionals. You may view information through your account for internal diagnostic and repair work. You must not republish, redistribute, mirror, bulk-download, remove rights notices from, or commercially resell the documents or platform.</p></section><section><h2>Workshop responsibility</h2><p>Service information may be incomplete, recovered, outdated, or unsuitable for a particular vehicle. Always confirm vehicle identity, current manufacturer information, safety procedures, tooling, specifications, and applicable regulations. Work on safety-critical systems should be performed only by appropriately qualified persons. You remain responsible for repair decisions and outcomes.</p></section><section><h2>Intellectual property and takedown</h2><p>Brand names, trademarks, documents, and related rights belong to their respective owners. If you are a rights holder or authorised representative and believe material should be reviewed or removed, use the <a href="/contact">copyright and takedown form</a> and identify the work, location, authority, and requested action.</p></section><section><h2>Availability and liability</h2><p>The service is provided on an “as available” basis without a guarantee that every document is complete, current, or continuously available. To the maximum extent permitted by applicable law, Supercar Docs is not responsible for indirect loss, loss of business, or damage resulting from reliance on the library. Nothing in these terms excludes liability that cannot legally be excluded.</p></section><section><h2>Changes and contact</h2><p>We may update these terms as the platform develops. Continued use after an update means the current terms apply. Questions may be submitted through the <a href="/contact">contact form</a>.</p></section>`), undefined, { canonicalUrl, description: "Terms governing access to the independent Supercar Docs repair information platform.", indexable: false });
}

export function contactView(siteOrigin: string, options: { sent?: boolean; error?: string; values?: Record<string, unknown> } = {}): string {
  const canonicalUrl = new URL("/contact", siteOrigin).toString();
  const values = options.values || {};
  const selected = (value: string) => values.requestType === value ? " selected" : "";
  const form = options.sent
    ? `<div class="success contact-success" role="status"><h2>Request received</h2><p>Your request has been recorded for administrator review. Keep a copy of the relevant URLs and supporting evidence in case more information is needed.</p><a class="secondary button" href="/">Return home</a></div>`
    : `${options.error ? `<div class="alert" role="alert">${escapeHtml(options.error)}</div>` : ""}<form method="post" action="/contact" class="stack contact-form"><label>Request type<select name="requestType" required><option value="general"${selected("general")}>General support</option><option value="privacy"${selected("privacy")}>Privacy or personal data</option><option value="copyright"${selected("copyright")}>Copyright or takedown</option></select></label><div class="form-grid"><label>Name<input name="name" maxlength="120" autocomplete="name" value="${escapeHtml(values.name)}" required></label><label>Email address<input name="email" type="email" maxlength="254" autocomplete="email" value="${escapeHtml(values.email)}" required></label></div><label>Details<textarea name="message" minlength="10" maxlength="5000" rows="9" required placeholder="For takedown requests, include the affected URL, the work or rights involved, your authority to act, and the action requested.">${escapeHtml(values.message)}</textarea></label><label class="request-check"><input name="confirmAccuracy" type="checkbox" value="yes" required><span>I confirm that the information supplied is accurate to the best of my knowledge and may be used to review and respond to this request.</span></label><label class="hp-field" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><button class="primary" type="submit">Submit request</button><p class="collection-notice">We use these details only to review, document, and respond to your request, subject to our <a href="/privacy">Privacy Statement</a>.</p></form>`;
  return page("Contact and Takedown", `<section class="contact-layout"><div>${legalLayout("Support and rights", "Contact, privacy, and takedown requests", "Send a request directly to the Supercar Docs administrator. Copyright notices and privacy requests are prioritised.", `<section><h2>Before submitting a copyright request</h2><p>Please identify the exact page or document, the protected work, your relationship to the rights holder, and the action you request. Good-faith, complete notices can be reviewed more quickly.</p></section><section><h2>Account support</h2><p>For account help, include the email address registered to the account. Never send your password or authorization code.</p></section>`)}</div><section class="contact-card">${form}</section></section>`, undefined, { canonicalUrl, description: "Contact Supercar Docs for account support, privacy requests, copyright review, or takedown notices.", indexable: false });
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
  const brandCounts = new Map<string, number>();
  for (const car of cars) {
    const brand = String(car.brand_name || "Unknown");
    brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
  }
  const plannedBrands = ["McLaren", "Ferrari", "Lamborghini"];
  const brands = [...plannedBrands, ...[...brandCounts.keys()].filter((brand) => !plannedBrands.includes(brand))];
  const brandTabs = brands.map((brand) => {
    const count = brandCounts.get(brand) || 0;
    return count
      ? `<button type="button" data-brand-filter="${escapeHtml(brand.toLowerCase())}" aria-pressed="false"><span>${escapeHtml(brand)}</span><small>${count} vehicles</small></button>`
      : `<button type="button" disabled aria-disabled="true"><span>${escapeHtml(brand)}</span><small>Coming soon</small></button>`;
  }).join("");
  const cards = cars.map((car) => `<article class="vehicle-card" data-vehicle-card data-brand="${escapeHtml(String(car.brand_name || "").toLowerCase())}" data-search="${escapeHtml(`${car.brand_name || ""} ${car.name || ""} ${car.code || ""}`.toLowerCase())}"><div class="vehicle-card__media"><img src="${escapeHtml(car.image_path)}" alt="${escapeHtml(car.name)}" loading="lazy"><span class="availability"><i></i> Manual available</span></div><div class="vehicle-card__body"><span class="section-label">${escapeHtml(car.brand_name)}</span><h2>${escapeHtml(car.name)}</h2><p>${escapeHtml(englishVehicleDescription(car))}</p><a class="card-link" href="/vehicles/${escapeHtml(car.id)}"><span>Open service manual</span><span aria-hidden="true">→</span></a></div></article>`).join("");
  return page("Vehicle library", `<section class="library-hero"><div><span class="section-label">Member workspace</span><h1>Vehicle repair library</h1><p>Welcome back, ${escapeHtml(user.name)}. Choose a vehicle to browse its recovered technical documentation.</p></div><div class="library-meta"><strong>${cars.length}</strong><span>vehicles available</span></div></section><nav class="vehicle-brand-tabs" aria-label="Vehicle brands"><button class="is-active" type="button" data-brand-filter="" aria-pressed="true"><span>All brands</span><small>${cars.length} vehicles</small></button>${brandTabs}</nav><section class="library-toolbar" aria-label="Vehicle filters"><label class="search-field"><span class="sr-only">Search vehicles</span><span aria-hidden="true">⌕</span><input type="search" placeholder="Search by vehicle or model" data-vehicle-search autocomplete="off"></label><p><strong data-result-count>${cars.length}</strong> vehicles</p></section><section class="vehicle-grid">${cards}</section><p class="empty-results" data-empty-results hidden>No vehicles match your filters.</p>`, user);
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
  const manualArea = englishMenu.length
    ? `<section class="manual-layout manual-layout--launch"><aside><div class="manual-sidebar__header"><span class="section-label">Service information</span><h2>Manual contents</h2><p>${linkedDocuments.toLocaleString("en-US")} English documents</p><label class="search-field search-field--compact"><span class="sr-only">Search manual contents</span><span aria-hidden="true">⌕</span><input type="search" placeholder="Search contents" data-manual-search autocomplete="off"></label></div><nav class="manual-navigation" aria-label="Manual contents">${menuItems}</nav></aside><div class="manual-reader-launch"><span class="reader-launch-mark" aria-hidden="true">S</span><span class="section-label">Modern manual reader</span><h2>Open a cleaner workshop workspace.</h2><p>Use the responsive reader for fast navigation, searchable English contents, technical images, and protected PDF attachments.</p><div class="form-buttons"><a class="primary button" href="${escapeHtml(firstReaderUrl)}">Open modern reader</a></div><small>Every document in the contents opens in the authenticated modern reader.</small></div></section>`
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
  const userTable = table(["Email", "Account", "Library access", "Expiry"], data.users.map((row) => [row.email, Number(row.status) === 1 ? "Enabled" : "Disabled", memberAccessLabel(row), dateValue(row.vip_expires_at) || "No expiry"]));
  const codeTable = table(["Authorization code", "Access period", "Used", "Status"], data.codes.map((row) => [row.code, formatAccessDuration(row.duration_hours), yesNo(row.is_used), statusLabel(row.status)]));
  const links = `<section class="admin-actions"><a href="/admin/vehicles"><span class="admin-action-icon" aria-hidden="true">V</span><strong>Vehicles</strong><span>Edit catalogue and visibility</span></a><a href="/admin/members"><span class="admin-action-icon" aria-hidden="true">M</span><strong>Members</strong><span>Create accounts and extend access</span></a><a href="/admin/codes"><span class="admin-action-icon" aria-hidden="true">C</span><strong>Authorization codes</strong><span>Issue, review, and disable codes</span></a><a href="/admin/requests"><span class="admin-action-icon" aria-hidden="true">R</span><strong>Contact requests</strong><span>Review support, privacy, and takedown requests</span></a></section>`;
  const quickActions = `<section class="admin-workbench"><div class="admin-section-heading"><div><span class="section-label">Daily operations</span><h2>Quick actions</h2></div><p>Complete common access tasks without navigating through multiple pages.</p></div><div class="quick-action-grid"><form method="post" action="/admin/codes" class="quick-action-card"><span class="quick-action-card__number">01</span><h3>Generate an access code</h3><p>Create an active code with a useful duration preset. The secure code is generated automatically.</p>${csrf(user)}<input type="hidden" name="code" value=""><input type="hidden" name="status" value="1"><label>Access period<select name="durationHours" required><option value="720">30 days</option><option value="2160">90 days</option><option value="4380">6 months</option><option value="8760">1 year</option></select></label><button class="primary" type="submit">Generate code</button></form><article class="quick-action-card"><span class="quick-action-card__number">02</span><h3>Add a customer</h3><p>Create a member account, set the library expiry, and choose whether manual access starts active.</p><a class="secondary button" href="/admin/members/new">Add member</a></article></div></section>`;
  return page("Administration", `<section class="admin-hero"><div><span class="eyebrow">Supercar Docs control room</span><h1>Administration</h1><p>Manage customer access, authorization codes, vehicle coverage, and the recovered catalogue from one operational dashboard.</p></div><div class="admin-hero__status"><i></i><span>Application online</span><strong>${escapeHtml(user.email)}</strong></div></section><section class="stats">${stats}</section>${quickActions}${links}<section class="admin-data-section"><div class="admin-section-heading"><h2>Recent vehicles</h2><a href="/admin/vehicles">Manage all</a></div>${carTable}</section><section class="admin-data-section"><div class="admin-section-heading"><h2>Recent members</h2><a href="/admin/members">Manage all</a></div>${userTable}</section><section class="admin-data-section"><div class="admin-section-heading"><h2>Recent authorization codes</h2><a href="/admin/codes">Manage all</a></div>${codeTable}</section>`, user);
}

function statusLabel(value: unknown): string {
  return Number(value) === 1 ? "Active" : "Disabled";
}

function yesNo(value: unknown): string {
  return Number(value) === 1 ? "Yes" : "No";
}

export function formatAccessDuration(value: unknown): string {
  const hours = Number(value);
  if (!Number.isFinite(hours)) return String(value || "");
  if (hours <= 24) return `${hours.toLocaleString("en-US")} hour${hours === 1 ? "" : "s"}`;
  const days = hours / 24;
  const dayLabel = Number.isInteger(days) ? days.toLocaleString("en-US") : days.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `${hours.toLocaleString("en-US")} hours (${dayLabel} day${Number(dayLabel.replaceAll(",", "")) === 1 ? "" : "s"})`;
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
  const rows = cars.map((row) => {
    const visible = Number(row.is_show) === 1;
    const controls = `<div class="vehicle-visibility"><span class="status-pill status-pill--${visible ? "active" : "disabled"}">${visible ? "Visible" : "Hidden"}</span><form method="post" action="/admin/vehicles/${escapeHtml(row.id)}/visibility">${csrf(user)}<input type="hidden" name="visible" value="${visible ? "0" : "1"}"><button type="submit">${visible ? "Hide" : "Show"}</button></form><a href="/admin/vehicles/${escapeHtml(row.id)}/edit">Edit</a></div>`;
    return [row.brand_name, row.code, row.name, controls];
  });
  return page("Manage vehicles", `<div class="page-heading"><div><a href="/admin">← Dashboard</a><h1>Vehicles</h1><p>Existing vehicles can be edited or shown and hidden here. New vehicle imports are handled through the documented AI-assisted workflow.</p></div></div>${message(saved)}${tableHtml(["Brand", "Code", "Vehicle", "Visibility"], rows)}`, user);
}

export function adminVehicleFormView(user: SessionUser, brands: Array<Record<string, unknown>>, car: Record<string, unknown> = {}, error = ""): string {
  const editing = Boolean(car.id);
  const brandOptions = brands.map((brand) => `<option value="${escapeHtml(brand.id)}"${Number(brand.id) === Number(car.brand_id) ? " selected" : ""}>${escapeHtml(brand.brand_name)}</option>`).join("");
  return page(editing ? "Edit vehicle" : "Add vehicle", `<a href="/admin/vehicles">← Vehicles</a><section class="form-card"><h1>${editing ? "Edit" : "Add"} vehicle</h1>${message(false, error)}<form method="post" action="${editing ? `/admin/vehicles/${escapeHtml(car.id)}` : "/admin/vehicles"}" class="form-grid">${csrf(user)}<label>Brand<select name="brandId" required>${brandOptions}</select></label><label>Code<input name="code" maxlength="100" value="${escapeHtml(car.code)}" required></label><label class="wide">Vehicle name<input name="name" maxlength="200" value="${escapeHtml(car.name)}" required></label><label class="wide">Image path<input name="imagePath" maxlength="500" value="${escapeHtml(car.image_path)}"></label><label class="wide">Description<textarea name="synopsis" maxlength="5000" rows="6">${escapeHtml(car.synopsis)}</textarea></label><label>Manual folder<input name="folderName" maxlength="200" value="${escapeHtml(car.folder_name)}" required></label><label>Manual type<input name="menuType" maxlength="100" value="${escapeHtml(car.menu_type)}"></label><label>Manual ID<input name="manualId" type="number" value="${escapeHtml(car.manual_id)}"></label><label>Sort order<input name="sort" type="number" value="${escapeHtml(car.sort ?? 0)}" required></label><label class="check"><input name="isShow" type="checkbox" value="1"${checked(car.is_show ?? 1)}> Visible to members</label><div class="wide form-buttons"><button class="primary" type="submit">Save vehicle</button></div></form></section>`, user);
}

export function adminMembersView(user: SessionUser, members: Array<Record<string, unknown>>, saved = false, extended = false): string {
  const counts = { all: members.length, active: 0, expired: 0, inactive: 0, disabled: 0 };
  const rows = members.map((row) => {
    const state = memberAccessState(row);
    counts[state] += 1;
    const account = Number(row.status) === 1 ? '<span class="status-pill status-pill--active">Enabled</span>' : '<span class="status-pill status-pill--disabled">Disabled</span>';
    const accessClass = state === "active" ? "active" : state === "expired" ? "warning" : "disabled";
    const access = `<span class="status-pill status-pill--${accessClass}">${escapeHtml(memberAccessLabel(row))}</span>`;
    return `<tr data-member-admin-row data-member-state="${state}" data-search="${escapeHtml(String(row.email || "").toLowerCase())}"><td>${escapeHtml(row.email)}</td><td>${account}</td><td>${access}</td><td>${escapeHtml(dateValue(row.vip_expires_at) || "No expiry")}</td><td><div class="row-actions"><a href="/admin/members/${escapeHtml(row.id)}/edit">Edit</a><form method="post" action="/admin/members/${escapeHtml(row.id)}/extend"><input type="hidden" name="_csrf" value="${escapeHtml(user.csrfToken)}"><label class="sr-only" for="extend-${escapeHtml(row.id)}">Extension period</label><select id="extend-${escapeHtml(row.id)}" name="days" aria-label="Extension period"><option value="1">+1 day</option><option value="7">+7 days</option><option value="30">+30 days</option><option value="90">+90 days</option><option value="365">+1 year</option></select><button type="submit">Extend</button></form></div></td></tr>`;
  }).join("");
  const notice = extended ? '<div class="success">Library access extended from the later of today or the current expiry date.</div>' : message(saved);
  const filters = `<div class="admin-filter-bar" role="group" aria-label="Filter members"><button class="is-active" type="button" data-member-filter="" aria-pressed="true">All <span>${counts.all}</span></button><button type="button" data-member-filter="active" aria-pressed="false">Active <span>${counts.active}</span></button><button type="button" data-member-filter="expired" aria-pressed="false">Expired <span>${counts.expired}</span></button><button type="button" data-member-filter="inactive" aria-pressed="false">Access off <span>${counts.inactive}</span></button><button type="button" data-member-filter="disabled" aria-pressed="false">Disabled <span>${counts.disabled}</span></button></div>`;
  const memberTable = `<div class="table-wrap"><table><thead><tr><th>Email</th><th>Account</th><th>Library access</th><th>Expiry</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table><div class="empty table-empty" data-member-empty hidden>No members match this filter.</div></div>`;
  return page("Manage members", `<div class="page-heading"><div><a href="/admin">← Dashboard</a><h1>Members</h1><p>Create accounts, control sign-in and manual access, and extend expiry dates.</p></div><a class="primary button" href="/admin/members/new">Add member</a></div>${notice}<section class="admin-explainer"><p><strong>Account enabled</strong> allows sign-in even when library access is off or expired. Disable it only when the customer must be blocked completely.</p><p><strong>Library access active</strong> allows vehicles, manual pages, and PDFs to open while the expiry is valid.</p></section><div class="admin-list-tools"><label class="search-field search-field--compact"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search member email" autocomplete="off" data-member-admin-search></label>${filters}<span class="admin-result-count"><strong data-member-result-count>${counts.all}</strong> members shown</span></div>${memberTable}`, user);
}

function memberAccessState(member: Record<string, unknown>): "active" | "expired" | "inactive" | "disabled" {
  if (Number(member.status) !== 1) return "disabled";
  if (Number(member.vip_status) !== 1) return "inactive";
  const expiry = String(member.vip_expires_at || "");
  const comparableExpiry = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? `${expiry}T23:59:59.999Z` : expiry;
  const expiryTime = comparableExpiry ? new Date(comparableExpiry).valueOf() : null;
  if (expiryTime !== null && (!Number.isFinite(expiryTime) || expiryTime <= Date.now())) return "expired";
  return "active";
}

function memberAccessLabel(member: Record<string, unknown>): string {
  const state = memberAccessState(member);
  if (state === "active") return "Active";
  if (state === "expired") return "Expired";
  if (state === "disabled") return "Blocked with account";
  return "Off";
}

export function adminContactRequestsView(user: SessionUser, requests: Array<Record<string, unknown>>, updated = false): string {
  const cards = requests.map((request) => {
    const open = request.status === "open";
    return `<article class="request-card${open ? " request-card--open" : ""}"><div class="request-card__heading"><div><span class="section-label">${escapeHtml(request.request_type)} request</span><h2>${escapeHtml(request.name)}</h2><a href="mailto:${escapeHtml(request.email)}">${escapeHtml(request.email)}</a></div><span class="request-status">${open ? "Open" : "Resolved"}</span></div><p class="request-message">${escapeHtml(request.message)}</p><div class="request-card__meta"><span>Received ${escapeHtml(String(request.created_at || "").replace("T", " ").slice(0, 19))}</span>${open ? `<form method="post" action="/admin/requests/${escapeHtml(request.id)}/resolve">${csrf(user)}<button type="submit">Mark resolved</button></form>` : `<span>Resolved ${escapeHtml(String(request.resolved_at || "").replace("T", " ").slice(0, 19))}</span>`}</div></article>`;
  }).join("");
  return page("Contact requests", `<div class="page-heading"><div><a href="/admin">← Dashboard</a><h1>Contact requests</h1><p>Review account support, personal-data enquiries, and rights-holder takedown notices.</p></div></div>${updated ? '<div class="success">Request marked as resolved.</div>' : ""}<section class="request-list">${cards || '<div class="empty"><h2>No requests yet</h2><p>New requests from the public contact form will appear here.</p></div>'}</section>`, user);
}

export function adminMemberFormView(user: SessionUser, member: Record<string, unknown> = {}, error = ""): string {
  const editing = Boolean(member.id);
  return page(editing ? "Edit member" : "Add member", `<a href="/admin/members">← Members</a><section class="form-card"><span class="section-label">Member access</span><h1>${editing ? "Edit" : "Add"} member</h1><p>Email is the member identifier; no profile name is required.</p>${message(false, error)}<form method="post" action="${editing ? `/admin/members/${escapeHtml(member.id)}` : "/admin/members"}" class="form-grid">${csrf(user)}<label>Email<input name="email" type="email" maxlength="254" value="${escapeHtml(member.email)}" required></label><label>${editing ? "New password (leave blank to keep it)" : "Password"}<input name="password" type="password" minlength="10" autocomplete="new-password"${editing ? "" : " required"}></label><label class="wide">Contact address <small>Optional internal note</small><input name="contactAddress" maxlength="500" value="${escapeHtml(member.contact_address)}"></label><label>Library expiry<input name="vipExpiresAt" type="date" value="${escapeHtml(dateValue(member.vip_expires_at))}"><small>Leave blank for no expiry.</small></label><div></div><label class="check"><input name="status" type="checkbox" value="1"${checked(member.status ?? 1)}> Account enabled <small>May sign in and view access status</small></label><label class="check"><input name="vipStatus" type="checkbox" value="1"${checked(member.vip_status ?? 0)}> Library access active <small>May open vehicles and protected manuals while unexpired</small></label><div class="wide form-buttons"><button class="primary" type="submit">Save member</button></div></form></section>`, user);
}

export function adminCodesView(user: SessionUser, codes: Array<Record<string, unknown>>, saved = false, generated = 0): string {
  const counts = { all: codes.length, available: 0, used: 0, disabled: 0 };
  const rows = codes.map((row) => {
    const state = Number(row.is_used) === 1 ? "used" : Number(row.status) === 1 ? "available" : "disabled";
    counts[state] += 1;
    const label = state === "available" ? "Available" : state === "used" ? "Used" : "Disabled";
    return `<tr data-code-admin-row data-code-state="${state}" data-search="${escapeHtml(String(row.code || "").toLowerCase())}"><td><code>${escapeHtml(row.code)}</code></td><td>${escapeHtml(formatAccessDuration(row.duration_hours))}</td><td><span class="status-pill status-pill--${state === "available" ? "active" : state === "used" ? "neutral" : "disabled"}">${label}</span></td><td><a href="/admin/codes/${escapeHtml(row.id)}/edit">Edit</a></td></tr>`;
  }).join("");
  const notice = generated ? `<div class="success">${generated} authorization code${generated === 1 ? "" : "s"} generated. They are listed under Available.</div>` : message(saved);
  const filters = `<div class="admin-filter-bar" role="group" aria-label="Filter authorization codes"><button class="is-active" type="button" data-code-filter="available" aria-pressed="true">Available <span>${counts.available}</span></button><button type="button" data-code-filter="used" aria-pressed="false">Used <span>${counts.used}</span></button><button type="button" data-code-filter="disabled" aria-pressed="false">Disabled <span>${counts.disabled}</span></button><button type="button" data-code-filter="" aria-pressed="false">All <span>${counts.all}</span></button></div>`;
  const bulkForm = `<section class="bulk-code-panel"><div><span class="section-label">Batch access</span><h2>Generate multiple codes</h2><p>Create up to 100 unique, one-time authorization codes with the same access duration.</p></div><form method="post" action="/admin/codes/bulk" class="bulk-code-form">${csrf(user)}<label>Quantity<input name="count" type="number" min="1" max="100" value="10" required></label><label>Access period<select name="durationHours" required><option value="720">30 days</option><option value="2160">90 days</option><option value="4380">6 months</option><option value="8760">1 year</option></select></label><label>Prefix <small>Optional</small><input name="prefix" maxlength="16" pattern="[A-Za-z0-9_-]+" placeholder="DEALER"></label><button class="primary" type="submit">Generate codes</button></form></section>`;
  const codeTable = `<div class="table-wrap"><table><thead><tr><th>Authorization code</th><th>Access period</th><th>State</th><th></th></tr></thead><tbody>${rows}</tbody></table><div class="empty table-empty" data-code-empty hidden>No authorization codes match this filter.</div></div>`;
  return page("Manage authorization codes", `<div class="page-heading"><div><a href="/admin">← Dashboard</a><h1>Authorization codes</h1><p>Codes are single-use. Redeemed codes remain in the Used list for audit and cannot be redeemed again.</p></div><a class="secondary button" href="/admin/codes/new">Add one code</a></div>${notice}${bulkForm}<div class="admin-list-tools"><label class="search-field search-field--compact"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search code" autocomplete="off" data-code-admin-search></label>${filters}<span class="admin-result-count"><strong data-code-result-count>${counts.available}</strong> codes shown</span></div>${codeTable}`, user);
}

export function adminCodeFormView(user: SessionUser, code: Record<string, unknown> = {}, error = ""): string {
  const editing = Boolean(code.id);
  return page(editing ? "Edit authorization code" : "Add authorization code", `<a href="/admin/codes">← Authorization codes</a><section class="form-card"><span class="section-label">Customer activation</span><h1>${editing ? "Edit" : "Add"} authorization code</h1><p>${editing ? "Change this code's validity or disable future use." : "Leave the code field blank to generate a secure value automatically."}</p>${message(false, error)}<form method="post" action="${editing ? `/admin/codes/${escapeHtml(code.id)}` : "/admin/codes"}" class="form-grid">${csrf(user)}<label>Code<input name="code" maxlength="100" pattern="[A-Za-z0-9_-]+" value="${escapeHtml(code.code)}" placeholder="Automatically generated"></label><label>Access duration (hours)<input name="durationHours" type="number" min="1" step="1" value="${escapeHtml(code.duration_hours ?? 720)}" required data-duration-input><small>Choose a preset or enter a custom number of hours.</small></label><div class="wide duration-presets" aria-label="Duration presets"><button type="button" data-duration-value="720">30 days</button><button type="button" data-duration-value="2160">90 days</button><button type="button" data-duration-value="4380">6 months</button><button type="button" data-duration-value="8760">1 year</button></div><label class="check"><input name="status" type="checkbox" value="1"${checked(code.status ?? 1)}> Code active</label>${editing ? `<p class="wide muted">Used: ${yesNo(code.is_used)}</p>` : ""}<div class="wide form-buttons"><button class="primary" type="submit">Save authorization code</button></div></form></section>`, user);
}

function tableHtml(headers: string[], rows: unknown[][]): string {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value, index) => `<td>${index === row.length - 1 ? String(value ?? "") : escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
