import assert from "node:assert/strict";
import test from "node:test";
import type { SessionUser } from "./db.js";
import {
  accessStatusView,
  adminCodesView,
  adminMemberFormView,
  adminMembersView,
  adminVehiclesView,
  adminView,
  contactView,
  englishOnlyManualMenu,
  formatAccessDuration,
  landingView,
  privacyView,
  registerView,
  termsView,
  vehicleDetailView,
  vehicleListView,
} from "./views.js";

const user: SessionUser = {
  id: 1,
  email: "member@example.com",
  name: "Workshop Member",
  role: "customer",
  csrfToken: "csrf",
  vipStatus: true,
  vipExpiresAt: null,
};

test("removes non-English manual branches and all of their descendants", () => {
  const menu = [
    { id: 1, parent_id: null, name: "Repair instructions", relative_file: null },
    { id: 2, parent_id: 1, name: "Service sheets", relative_file: null },
    { id: 3, parent_id: 2, name: "First service", relative_file: "Repair/100.html" },
    { id: 4, parent_id: 1, name: "服务手册", relative_file: null },
    { id: 5, parent_id: 4, name: "First service", relative_file: "Repair/200.html" },
    { id: 6, parent_id: 1, name: "サービスシート", relative_file: null },
    { id: 7, parent_id: 6, name: "PDI", relative_file: "Repair/300.html" },
    { id: 8, parent_id: 1, name: "P23 PDI Sheet - JA", relative_file: "Repair/400.html" },
    { id: 9, parent_id: 1, name: "Emergency Response Sheet - German", relative_file: "Repair/500.html" },
  ];
  assert.deepEqual(englishOnlyManualMenu(menu).map((item) => item.id), [1, 2, 3]);
});

test("customer pages render a modern English-only interface", () => {
  const list = vehicleListView(user, [{ id: 21, name: "12C", brand_name: "McLaren", code: "12C", image_path: "/car.png", synopsis: "中文車輛描述" }]);
  const detail = vehicleDetailView(user, { id: 21, name: "12C", brand_name: "McLaren", folder_name: "manual", image_path: "/car.png" }, [
    { id: 1, parent_id: null, name: "Repair instructions", relative_file: null },
    { id: 2, parent_id: 1, name: "English service sheet", relative_file: "Repair/100.html" },
    { id: 3, parent_id: 1, name: "服務手冊", relative_file: null },
    { id: 4, parent_id: 3, name: "Hidden descendant", relative_file: "Repair/200.html" },
  ]);
  assert.match(list, /Vehicle repair library/);
  assert.match(list, /Access remaining/);
  assert.match(list, /No expiry/);
  assert.match(list, /Search by vehicle or model/);
  assert.match(list, /Vehicle brands/);
  assert.match(list, /McLaren/);
  assert.match(list, /Ferrari/);
  assert.match(list, /Lamborghini/);
  assert.match(list, /Coming soon/);
  assert.match(detail, /English service sheet/);
  assert.match(detail, />Start reading</);
  assert.match(detail, /<a class="brand" href="\/" aria-label="Supercar Docs home">/);
  assert.match(detail, /\/modern-manuals\/index\.html\?manual=manual&amp;page=Repair%2F100\.html/);
  assert.doesNotMatch(detail, /\/manuals\/manual\/html\/Repair\/100\.html/);
  assert.doesNotMatch(detail, /Legacy fallback/);
  assert.doesNotMatch(detail, /服務手冊|Hidden descendant/);
  assert.doesNotMatch(`${list}${detail}`, /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/);
});

test("customer library shows the remaining access period", () => {
  const expiringUser: SessionUser = { ...user, vipExpiresAt: "2030-01-01" };
  const html = vehicleListView(expiringUser, []);
  assert.match(html, /Access remaining/);
  assert.match(html, /\d+ days left/);
  assert.match(html, /href="\/access"/);
});

test("public landing page includes SEO, GEO-friendly answers, future coverage, and the site disclaimer", () => {
  const html = landingView(undefined, "https://example.com", "https://app.example.com");
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /FAQPage/);
  assert.match(html, /McLaren workshop library available now/);
  assert.match(html, /Ferrari[^]*Planned/);
  assert.match(html, /Lamborghini[^]*Planned/);
  assert.match(html, /Supercar Docs/);
  assert.match(html, /<title>Supercar Repair Manuals for Workshops \| Supercar Docs<\/title>/);
  assert.match(html, /property="og:image" content="https:\/\/example\.com\/supercar-workshop-hero\.jpg"/);
  assert.match(html, /"@type":"Organization"/);
  assert.match(html, /"@type":"Service"/);
  assert.match(html, /CollectionPage/);
  assert.doesNotMatch(html, /ItemList/);
  assert.match(html, /supercar-workshop-hero\.jpg/);
  assert.match(html, /How to approach McLaren front brake service information/);
  assert.match(html, /How to troubleshoot a McLaren door latch concern/);
  assert.match(html, /How to find the correct McLaren torque settings/);
  assert.match(html, /Original topic summary—not a copied manufacturer procedure/);
  assert.match(html, /Independent and transparent/);
  assert.match(html, /Who is the platform designed for\?/);
  assert.match(html, /does not own, represent, endorse, or claim affiliation/);
  assert.match(html, /Member sign in/);
  assert.match(html, /href="https:\/\/app\.example\.com\/login"/);
  assert.match(html, /href="https:\/\/app\.example\.com\/login#register"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/contact"/);
});

test("registration and public policy pages provide launch-ready privacy and takedown notices", () => {
  const registration = registerView();
  const privacy = privacyView("https://supercardocs.com");
  const terms = termsView("https://supercardocs.com");
  const contact = contactView("https://supercardocs.com");
  assert.match(registration, /name="acceptPolicies"/);
  assert.match(registration, /role="tablist"/);
  assert.match(registration, /data-auth-tab="signin">Sign in/);
  assert.match(registration, /data-auth-tab="register">Sign up/);
  assert.match(registration, /id="register"[^>]* hidden/);
  assert.match(registration, /action="\/login"/);
  assert.match(registration, /action="\/register"/);
  assert.match(registration, /Personal Information Collection Statement/);
  assert.doesNotMatch(registration, /name="name"/);
  assert.match(privacy, /Data we collect/);
  assert.match(privacy, /strictly necessary, secure session cookie/);
  assert.match(terms, /must not republish, redistribute, mirror, bulk-download/);
  assert.match(contact, /name="requestType"/);
  assert.match(contact, /Copyright or takedown/);
  assert.match(contact, /name="website"/);
});

test("a registration error opens the sign-up tab without showing sign-in", () => {
  const registration = registerView("That authorization code is invalid.", { email: "member@example.com" });
  assert.match(registration, /data-default-auth-tab="register"/);
  assert.match(registration, /aria-selected="true" class="is-active" data-auth-tab="register"/);
  assert.doesNotMatch(registration, /id="register"[^>]* hidden/);
  assert.match(registration, /id="signin"[^>]* hidden/);
});

test("expired members keep an account status page while the library remains unavailable", () => {
  const expiredUser: SessionUser = { ...user, vipExpiresAt: "2020-01-01" };
  const html = accessStatusView(expiredUser);
  assert.match(html, /library access has expired/i);
  assert.match(html, /Account[\s\S]*Enabled/);
  assert.match(html, /manual files, and PDFs remain locked/);
});

test("admin views expose quick code creation and member expiry actions", () => {
  const dashboard = adminView(user, {
    counts: { Vehicles: 1, Brands: 1, Members: 1, "Authorization codes": 1 },
    cars: [],
    users: [],
    codes: [],
  });
  const members = adminMembersView(user, [{
    id: 7,
    email: "customer@example.com",
    name: "Customer",
    status: 1,
    vip_status: 1,
    vip_expires_at: "2030-01-01",
  }]);
  const memberForm = adminMemberFormView(user);
  const codes = adminCodesView(user, [{ id: 9, code: "USED-CODE", duration_hours: 720, is_used: 1, status: 1 }]);
  const vehicles = adminVehiclesView(user, [{ id: 21, brand_name: "McLaren", code: "12C", name: "12C", is_show: 1 }]);
  assert.match(dashboard, /Generate an access code/);
  assert.match(dashboard, /Contact requests/);
  assert.match(dashboard, /name="durationHours"/);
  assert.match(members, /\/admin\/members\/7\/extend/);
  assert.match(members, /\+1 year/);
  assert.match(members, /\+1 day/);
  assert.match(members, /\+7 days/);
  assert.match(members, /data-member-filter="expired"/);
  assert.match(members, /Library access active/);
  assert.doesNotMatch(memberForm, /name="name"/);
  assert.match(codes, /action="\/admin\/codes\/bulk"/);
  assert.match(codes, /Redeemed codes remain in the Used list for audit/);
  assert.match(codes, /data-code-state="used"/);
  assert.match(codes, /720 hours \(30 days\)/);
  assert.doesNotMatch(vehicles, /Add vehicle/);
  assert.match(vehicles, /\/admin\/vehicles\/21\/visibility/);
  assert.match(vehicles, />Hide</);
  assert.match(`${dashboard}${members}`, /Independent content notice/);
});

test("authorization code access periods show useful day equivalents", () => {
  assert.equal(formatAccessDuration(1), "1 hour");
  assert.equal(formatAccessDuration(24), "24 hours");
  assert.equal(formatAccessDuration(25), "25 hours (1 day)");
  assert.equal(formatAccessDuration(168), "168 hours (7 days)");
});
