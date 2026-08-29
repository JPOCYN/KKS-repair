import type { SessionUser } from "./db.js";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page(title: string, content: string, user?: SessionUser | null): string {
  const navigation = user
    ? `<nav><a href="/vehicles">Vehicles</a>${user.role === "admin" ? '<a href="/admin">Admin</a>' : ""}<form method="post" action="/logout"><input type="hidden" name="_csrf" value="${escapeHtml(user.csrfToken)}"><button type="submit">Log out</button></form></nav>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · KKS Repair</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/app.css"></head><body><header><a class="brand" href="/">KKS Repair</a>${navigation}</header><main>${content}</main><footer>Recovered and rebuilt for independent operation.</footer></body></html>`;
}

export function loginView(error = ""): string {
  return page("Sign in", `<section class="auth-card"><h1>Sign in</h1><p>Access your vehicle repair manuals.</p>${error ? `<div class="alert">${escapeHtml(error)}</div>` : ""}<form method="post" action="/login" class="stack"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Sign in</button></form><p class="auth-help">Have an unused authorization code? <a href="/register">Create an account</a>.</p></section>`);
}

export function registerView(error = "", values: Record<string, unknown> = {}): string {
  return page("Create account", `<section class="auth-card"><h1>Create account</h1><p>Use an unused KKS authorization code to activate access.</p>${error ? `<div class="alert">${escapeHtml(error)}</div>` : ""}<form method="post" action="/register" class="stack"><label>Email<input name="email" type="email" autocomplete="email" value="${escapeHtml(values.email)}" required></label><label>Name<input name="name" maxlength="120" value="${escapeHtml(values.name)}" required></label><label>Authorization code<input name="authCode" autocomplete="off" maxlength="100" value="${escapeHtml(values.authCode)}" required></label><label>Password<input name="password" type="password" autocomplete="new-password" minlength="10" required></label><button class="primary" type="submit">Create account</button></form><p class="auth-help"><a href="/login">Back to sign in</a></p></section>`);
}

export function vehicleListView(user: SessionUser, cars: Array<Record<string, unknown>>): string {
  const cards = cars.map((car) => `<article class="vehicle-card"><img src="${escapeHtml(car.image_path)}" alt="${escapeHtml(car.name)}"><div><span class="eyebrow">${escapeHtml(car.brand_name)}</span><h2>${escapeHtml(car.name)}</h2><p>${escapeHtml(car.synopsis || "Repair information and technical manual")}</p><a class="primary button" href="/vehicles/${escapeHtml(car.id)}">Open manual</a></div></article>`).join("");
  return page("Vehicles", `<section class="hero"><div><span class="eyebrow">Welcome, ${escapeHtml(user.name)}</span><h1>Your repair library</h1><p>Select a vehicle to open its recovered service information.</p></div></section><section class="vehicle-grid">${cards}</section>`, user);
}

export function vehicleDetailView(user: SessionUser, car: Record<string, unknown>, menu: Array<Record<string, unknown>>): string {
  const children = new Map<string, Array<Record<string, unknown>>>();
  for (const item of menu) {
    const key = item.parent_id === null ? "root" : String(item.parent_id);
    children.set(key, [...(children.get(key) || []), item]);
  }
  const renderBranch = (parentId: string): string => `<ul class="manual-tree">${(children.get(parentId) || []).map((item) => {
    const nested = children.has(String(item.id));
    const label = escapeHtml(item.name);
    const content = item.relative_file
      ? `<a href="/manuals/${escapeHtml(car.folder_name)}/html/${escapeHtml(item.relative_file)}" target="manual-frame">${label}</a>`
      : `<span>${label}</span>`;
    return nested
      ? `<li><details${item.parent_id === null ? " open" : ""}><summary>${label}</summary>${renderBranch(String(item.id))}</details></li>`
      : `<li>${content}</li>`;
  }).join("")}</ul>`;
  const menuItems = menu.length
    ? renderBranch("root")
    : `<div class="empty"><h2>Manual content recovery in progress</h2><p>The vehicle catalog is recovered. Its original manual page files still need to be copied from the old server.</p></div>`;
  const manualArea = menu.length
    ? `<section class="manual-layout"><aside><h2>Contents</h2>${menuItems}</aside><iframe name="manual-frame" title="Repair manual"></iframe></section>`
    : `<section class="manual-pending">${menuItems}</section>`;
  return page(String(car.name), `<a href="/vehicles">← Back to vehicles</a><section class="vehicle-heading"><img src="${escapeHtml(car.image_path)}" alt=""><div><span class="eyebrow">${escapeHtml(car.brand_name)}</span><h1>${escapeHtml(car.name)}</h1><p>${escapeHtml(car.synopsis)}</p></div></section>${manualArea}`, user);
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
  const links = `<section class="admin-actions"><a href="/admin/vehicles"><strong>Vehicles</strong><span>Edit catalogue and visibility</span></a><a href="/admin/members"><strong>Members</strong><span>Create and manage access</span></a><a href="/admin/codes"><strong>Authorization codes</strong><span>Issue and disable codes</span></a></section>`;
  return page("Administration", `<section class="hero"><div><span class="eyebrow">Independent administration</span><h1>Recovered KKS data</h1><p>The replacement database is running locally and no longer depends on the former vendor.</p></div></section><section class="stats">${stats}</section>${links}<section><h2>Recent vehicles</h2>${carTable}</section><section><h2>Recent members</h2>${userTable}</section><section><h2>Recent authorization codes</h2>${codeTable}</section>`, user);
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

export function adminMembersView(user: SessionUser, members: Array<Record<string, unknown>>, saved = false): string {
  const rows = members.map((row) => [row.email, row.name, statusLabel(row.status), statusLabel(row.vip_status), dateValue(row.vip_expires_at), `<a href="/admin/members/${escapeHtml(row.id)}/edit">Edit</a>`]);
  return page("Manage members", `<div class="page-heading"><div><a href="/admin">← Dashboard</a><h1>Members</h1></div><a class="primary button" href="/admin/members/new">Add member</a></div>${message(saved)}${tableHtml(["Email", "Name", "Account", "VIP", "Expiry", ""], rows)}`, user);
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
  return page(editing ? "Edit authorization code" : "Add authorization code", `<a href="/admin/codes">← Authorization codes</a><section class="form-card"><h1>${editing ? "Edit" : "Add"} authorization code</h1>${message(false, error)}<form method="post" action="${editing ? `/admin/codes/${escapeHtml(code.id)}` : "/admin/codes"}" class="form-grid">${csrf(user)}<label>Code<input name="code" maxlength="100" pattern="[A-Za-z0-9_-]+" value="${escapeHtml(code.code)}" placeholder="Leave blank to generate"></label><label>Access duration (hours)<input name="durationHours" type="number" min="1" step="1" value="${escapeHtml(code.duration_hours ?? 720)}" required></label><label class="check"><input name="status" type="checkbox" value="1"${checked(code.status ?? 1)}> Code active</label>${editing ? `<p class="wide muted">Used: ${yesNo(code.is_used)}</p>` : ""}<div class="wide form-buttons"><button class="primary" type="submit">Save code</button></div></form></section>`, user);
}

function tableHtml(headers: string[], rows: unknown[][]): string {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value, index) => `<td>${index === row.length - 1 ? String(value ?? "") : escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
