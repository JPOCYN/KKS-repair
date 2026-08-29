import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashPassword } from "./password.js";
import type {
  AppRepository,
  CodeInput,
  DashboardData,
  DataRecord,
  LoginUser,
  MemberInput,
  VehicleInput,
} from "./repository.js";
import {
  createSupabaseServerClient,
  readSupabaseServerConfig,
  requireExpectedSupabaseProject,
} from "./supabase-client.js";
import type { Database } from "./supabase-types.js";

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertNoError(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function collectPages<T>(loader: (from: number, to: number) => PromiseLike<QueryResult<T>>): Promise<T[]> {
  const pageSize = 1000;
  const result: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loader(from, from + pageSize - 1);
    assertNoError(error, "Supabase paginated query failed");
    const page = data || [];
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

export class SupabaseRepository implements AppRepository {
  readonly backend = "supabase" as const;

  private constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly environment: NodeJS.ProcessEnv,
  ) {}

  static async create(environment: NodeJS.ProcessEnv = process.env): Promise<SupabaseRepository> {
    const config = readSupabaseServerConfig(environment);
    requireExpectedSupabaseProject(config, environment);
    const repository = new SupabaseRepository(createSupabaseServerClient(config), environment);
    await repository.health();
    await repository.ensureConfiguredAdmin();
    return repository;
  }

  private async ensureConfiguredAdmin(): Promise<void> {
    const email = this.environment.ADMIN_EMAIL?.trim();
    const password = this.environment.ADMIN_PASSWORD;
    if (!email || !password) return;
    const { data, error } = await this.client.from("app_users").select("id").eq("email", email).maybeSingle();
    assertNoError(error, "Cannot check configured administrator");
    if (data) return;
    const created = await this.client.from("app_users").insert({
      email,
      name: "Administrator",
      password_hash: hashPassword(password),
      contact_address: null,
      auth_code: null,
      status: true,
      vip_status: true,
      vip_expires_at: null,
      role: "admin",
    });
    if (created.error && created.error.code !== "23505") {
      throw new Error(`Cannot create configured administrator: ${created.error.message}`);
    }
  }

  async checkRecoveredDatabase(): Promise<void> {}

  async health(): Promise<void> {
    const { error } = await this.client.from("brands").select("id", { head: true, count: "exact" });
    assertNoError(error, "Supabase database health check failed");
  }

  async close(): Promise<void> {}

  async getSessionUser(token: string | undefined) {
    if (!token) return null;
    const { data, error } = await this.client.rpc("get_app_session", { p_token_hash: sha256(token) });
    assertNoError(error, "Cannot read application session");
    const row = data?.[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      email: row.email,
      name: row.name,
      role: row.role,
      csrfToken: row.csrf_token,
    };
  }

  async createSession(userId: number): Promise<{ token: string; csrfToken: string }> {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { error } = await this.client.from("app_sessions").insert({
      token_hash: sha256(token),
      user_id: userId,
      csrf_token: csrfToken,
      expires_at: expiresAt,
    });
    assertNoError(error, "Cannot create application session");
    return { token, csrfToken };
  }

  async deleteSession(token: string | undefined): Promise<void> {
    if (!token) return;
    const { error } = await this.client.from("app_sessions").delete().eq("token_hash", sha256(token));
    assertNoError(error, "Cannot delete application session");
  }

  async registerCustomer(input: { email: string; name: string; authCode: string; passwordHash: string }): Promise<number | null> {
    const { data, error } = await this.client.rpc("register_app_user", {
      p_auth_code: input.authCode,
      p_email: input.email,
      p_name: input.name,
      p_password_hash: input.passwordHash,
    });
    assertNoError(error, "Cannot register customer");
    return data === null ? null : Number(data);
  }

  async findLoginUser(email: string): Promise<LoginUser | null> {
    const { data, error } = await this.client.from("app_users")
      .select("id,password_hash,role,status")
      .eq("email", email)
      .maybeSingle();
    assertNoError(error, "Cannot read login account");
    return data ? {
      id: Number(data.id),
      passwordHash: data.password_hash,
      role: data.role,
      status: data.status,
    } : null;
  }

  private async brandNames(): Promise<Map<number, string>> {
    const { data, error } = await this.client.from("brands").select("id,brand_name");
    assertNoError(error, "Cannot read vehicle brands");
    return new Map((data || []).map((brand) => [Number(brand.id), brand.brand_name]));
  }

  private async addBrandNames(rows: DataRecord[]): Promise<DataRecord[]> {
    const names = await this.brandNames();
    return rows.map((row) => ({ ...row, brand_name: names.get(Number(row.brand_id)) || "" }));
  }

  async listVisibleVehicles(): Promise<DataRecord[]> {
    const { data, error } = await this.client.from("cars").select("*")
      .eq("is_show", true)
      .order("sort", { ascending: false })
      .order("name", { ascending: true });
    assertNoError(error, "Cannot list visible vehicles");
    return this.addBrandNames((data || []) as unknown as DataRecord[]);
  }

  async getVehicleDetail(id: number): Promise<{ car: DataRecord; menu: DataRecord[] } | null> {
    const { data: car, error } = await this.client.from("cars").select("*").eq("id", id).maybeSingle();
    assertNoError(error, "Cannot read vehicle");
    if (!car) return null;
    const menu = await collectPages((from, to) => this.client.from("manual_menu").select("*")
      .eq("car_id", id)
      .order("sort", { ascending: true })
      .order("name", { ascending: true })
      .range(from, to));
    const [withBrand] = await this.addBrandNames([car as unknown as DataRecord]);
    return { car: withBrand!, menu: menu as unknown as DataRecord[] };
  }

  private async countRows(table: "brands" | "cars" | "authorization_codes"): Promise<number> {
    const { count, error } = await this.client.from(table).select("id", { count: "exact", head: true });
    assertNoError(error, `Cannot count ${table}`);
    return count || 0;
  }

  async getDashboard(): Promise<DashboardData> {
    const [vehicleCount, brandCount, codeCount, memberCountResult, carsResult, usersResult, codesResult] = await Promise.all([
      this.countRows("cars"),
      this.countRows("brands"),
      this.countRows("authorization_codes"),
      this.client.from("app_users").select("id", { count: "exact", head: true }).eq("role", "customer"),
      this.client.from("cars").select("*").order("sort", { ascending: false }).range(0, 7),
      this.client.from("app_users").select("email,name,status,vip_status,vip_expires_at").eq("role", "customer").order("id", { ascending: false }).range(0, 7),
      this.client.from("authorization_codes").select("code,duration_hours,is_used,status").order("id", { ascending: false }).range(0, 7),
    ]);
    assertNoError(memberCountResult.error, "Cannot count members");
    assertNoError(carsResult.error, "Cannot read dashboard vehicles");
    assertNoError(usersResult.error, "Cannot read dashboard members");
    assertNoError(codesResult.error, "Cannot read dashboard authorization codes");
    return {
      counts: {
        Vehicles: vehicleCount,
        Brands: brandCount,
        Members: memberCountResult.count || 0,
        "Authorization codes": codeCount,
      },
      cars: await this.addBrandNames((carsResult.data || []) as unknown as DataRecord[]),
      users: (usersResult.data || []) as unknown as DataRecord[],
      codes: (codesResult.data || []) as unknown as DataRecord[],
    };
  }

  async listBrands(): Promise<DataRecord[]> {
    const { data, error } = await this.client.from("brands").select("id,brand_name")
      .order("sort", { ascending: false })
      .order("brand_name", { ascending: true });
    assertNoError(error, "Cannot list brands");
    return (data || []) as unknown as DataRecord[];
  }

  async listVehicles(): Promise<DataRecord[]> {
    const { data, error } = await this.client.from("cars").select("*")
      .order("sort", { ascending: false })
      .order("name", { ascending: true });
    assertNoError(error, "Cannot list vehicles");
    return this.addBrandNames((data || []) as unknown as DataRecord[]);
  }

  async getVehicle(id: number): Promise<DataRecord | null> {
    const { data, error } = await this.client.from("cars").select("*").eq("id", id).maybeSingle();
    assertNoError(error, "Cannot read vehicle");
    return data as unknown as DataRecord | null;
  }

  async createVehicle(input: VehicleInput): Promise<void> {
    const { error } = await this.client.from("cars").insert({
      brand_id: input.brandId,
      code: input.code,
      name: input.name,
      image_path: input.imagePath,
      synopsis: input.synopsis,
      is_show: input.isShow,
      folder_name: input.folderName,
      manual_id: input.manualId,
      menu_type: input.menuType,
      sort: input.sort,
      created_at: new Date().toISOString(),
      updated_at: null,
    });
    assertNoError(error, "Cannot create vehicle");
  }

  async updateVehicle(id: number, input: VehicleInput): Promise<boolean> {
    const { data, error } = await this.client.from("cars").update({
      brand_id: input.brandId,
      code: input.code,
      name: input.name,
      image_path: input.imagePath,
      synopsis: input.synopsis,
      is_show: input.isShow,
      folder_name: input.folderName,
      manual_id: input.manualId,
      menu_type: input.menuType,
      sort: input.sort,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("id").maybeSingle();
    assertNoError(error, "Cannot update vehicle");
    return Boolean(data);
  }

  async listMembers(): Promise<DataRecord[]> {
    const rows = await collectPages((from, to) => this.client.from("app_users")
      .select("id,email,name,contact_address,status,vip_status,vip_expires_at")
      .eq("role", "customer")
      .order("id", { ascending: false })
      .range(from, to));
    return rows as unknown as DataRecord[];
  }

  async getMember(id: number): Promise<DataRecord | null> {
    const { data, error } = await this.client.from("app_users")
      .select("id,email,name,contact_address,status,vip_status,vip_expires_at")
      .eq("id", id)
      .eq("role", "customer")
      .maybeSingle();
    assertNoError(error, "Cannot read member");
    return data as unknown as DataRecord | null;
  }

  async createMember(input: MemberInput & { passwordHash: string }): Promise<void> {
    const { error } = await this.client.from("app_users").insert({
      email: input.email,
      name: input.name,
      password_hash: input.passwordHash,
      contact_address: input.contactAddress,
      auth_code: null,
      status: input.status,
      vip_status: input.vipStatus,
      vip_expires_at: input.vipExpiresAt,
      role: "customer",
    });
    assertNoError(error, "Cannot create member");
  }

  async updateMember(id: number, input: MemberInput): Promise<boolean> {
    const values: Database["public"]["Tables"]["app_users"]["Update"] = {
      email: input.email,
      name: input.name,
      contact_address: input.contactAddress,
      status: input.status,
      vip_status: input.vipStatus,
      vip_expires_at: input.vipExpiresAt,
    };
    if (input.passwordHash) values.password_hash = input.passwordHash;
    const { data, error } = await this.client.from("app_users").update(values)
      .eq("id", id)
      .eq("role", "customer")
      .select("id")
      .maybeSingle();
    assertNoError(error, "Cannot update member");
    return Boolean(data);
  }

  async listCodes(): Promise<DataRecord[]> {
    const rows = await collectPages((from, to) => this.client.from("authorization_codes")
      .select("id,code,duration_hours,is_used,status")
      .order("id", { ascending: false })
      .range(from, to));
    return rows as unknown as DataRecord[];
  }

  async getCode(id: number): Promise<DataRecord | null> {
    const { data, error } = await this.client.from("authorization_codes")
      .select("id,code,duration_hours,is_used,status")
      .eq("id", id)
      .maybeSingle();
    assertNoError(error, "Cannot read authorization code");
    return data as unknown as DataRecord | null;
  }

  async createCode(input: CodeInput): Promise<void> {
    const { error } = await this.client.from("authorization_codes").insert({
      code: input.code,
      duration_hours: input.durationHours,
      expires_at: null,
      is_used: false,
      status: input.status,
      created_at: new Date().toISOString(),
    });
    assertNoError(error, "Cannot create authorization code");
  }

  async updateCode(id: number, input: CodeInput): Promise<boolean> {
    const { data, error } = await this.client.from("authorization_codes").update({
      code: input.code,
      duration_hours: input.durationHours,
      status: input.status,
    }).eq("id", id).select("id").maybeSingle();
    assertNoError(error, "Cannot update authorization code");
    return Boolean(data);
  }
}
