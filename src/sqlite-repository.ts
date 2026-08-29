import { existsSync } from "node:fs";
import path from "node:path";
import {
  adoptRecoveredDatabase,
  createSession,
  deleteSession,
  getSessionUser,
  initializeDatabase,
} from "./db.js";
import type {
  AppRepository,
  CodeInput,
  DashboardData,
  DataRecord,
  LoginUser,
  MemberInput,
  VehicleInput,
} from "./repository.js";
import { findPersistentPrivateDirectory } from "./persistent-storage.js";

export class SqliteRepository implements AppRepository {
  readonly backend = "sqlite" as const;
  private readonly database;
  private readonly recoveredDatabaseFile: string | undefined;
  private readonly environment: NodeJS.ProcessEnv;
  private recoveredDatabaseChecked: boolean;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.environment = environment;
    this.database = initializeDatabase(environment);
    const persistentDirectory = findPersistentPrivateDirectory(process.cwd(), environment.PUBLIC_ORIGIN);
    const persistentRecoveredDatabase = persistentDirectory && path.join(persistentDirectory, "recovered", "kks-repair.db");
    this.recoveredDatabaseFile = persistentRecoveredDatabase && existsSync(persistentRecoveredDatabase)
      ? persistentRecoveredDatabase
      : environment.RECOVERY_DB_PATH;
    this.recoveredDatabaseChecked = !this.recoveredDatabaseFile;
  }

  async checkRecoveredDatabase(): Promise<void> {
    if (this.recoveredDatabaseChecked || !this.recoveredDatabaseFile) return;
    const result = adoptRecoveredDatabase(this.database, this.recoveredDatabaseFile, this.environment);
    if (result !== "missing") {
      this.recoveredDatabaseChecked = true;
      console.log(`Recovered database status: ${result}`);
    }
  }

  async health(): Promise<void> {
    this.database.prepare("SELECT 1").get();
  }

  async close(): Promise<void> {
    this.database.close();
  }

  async getSessionUser(token: string | undefined) {
    return getSessionUser(this.database, token);
  }

  async createSession(userId: number) {
    return createSession(this.database, userId);
  }

  async deleteSession(token: string | undefined): Promise<void> {
    deleteSession(this.database, token);
  }

  async registerCustomer(input: { email: string; name: string; authCode: string; passwordHash: string }): Promise<number | null> {
    return this.database.transaction(() => {
      const code = this.database.prepare("SELECT id, duration_hours FROM authorization_codes WHERE code=? AND status=1 AND is_used=0")
        .get(input.authCode) as { id: number; duration_hours: number } | undefined;
      if (!code) return null;
      const vipExpiresAt = code.duration_hours > 0
        ? new Date(Date.now() + code.duration_hours * 60 * 60 * 1000).toISOString()
        : null;
      const inserted = this.database.prepare(`
        INSERT INTO users (email, name, password_hash, auth_code, status, vip_status, vip_expires_at, role)
        VALUES (?, ?, ?, ?, 1, 1, ?, 'customer')
      `).run(input.email, input.name, input.passwordHash, input.authCode, vipExpiresAt);
      const redeemed = this.database.prepare("UPDATE authorization_codes SET is_used=1 WHERE id=? AND is_used=0").run(code.id);
      if (redeemed.changes !== 1) throw new Error("Authorization code redemption failed");
      return Number(inserted.lastInsertRowid);
    })();
  }

  async findLoginUser(email: string): Promise<LoginUser | null> {
    const row = this.database.prepare("SELECT id, password_hash, role, status FROM users WHERE email = ? COLLATE NOCASE")
      .get(email) as { id: number; password_hash: string; role: "admin" | "customer"; status: number } | undefined;
    return row ? { id: row.id, passwordHash: row.password_hash, role: row.role, status: row.status === 1 } : null;
  }

  async listVisibleVehicles(): Promise<DataRecord[]> {
    return this.database.prepare(`SELECT c.*, b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id WHERE c.is_show=1 ORDER BY c.sort DESC, c.name`).all() as DataRecord[];
  }

  async getVehicleDetail(id: number): Promise<{ car: DataRecord; menu: DataRecord[] } | null> {
    const car = this.database.prepare(`SELECT c.*, b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id WHERE c.id=?`).get(id) as DataRecord | undefined;
    if (!car) return null;
    const menu = this.database.prepare("SELECT * FROM manual_menu WHERE car_id=? ORDER BY sort, name").all(id) as DataRecord[];
    return { car, menu };
  }

  async getDashboard(): Promise<DashboardData> {
    const count = (table: string) => Number((this.database.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get() as { value: number }).value);
    const cars = this.database.prepare(`SELECT c.*, b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id ORDER BY c.sort DESC LIMIT 8`).all() as DataRecord[];
    const users = this.database.prepare("SELECT email,name,status,vip_status,vip_expires_at FROM users WHERE role='customer' ORDER BY id DESC LIMIT 8").all() as DataRecord[];
    const codes = this.database.prepare("SELECT code,duration_hours,is_used,status FROM authorization_codes ORDER BY id DESC LIMIT 8").all() as DataRecord[];
    const customerCount = Number((this.database.prepare("SELECT COUNT(*) AS value FROM users WHERE role='customer'").get() as { value: number }).value);
    return {
      counts: { Vehicles: count("cars"), Brands: count("brands"), Members: customerCount, "Authorization codes": count("authorization_codes") },
      cars,
      users,
      codes,
    };
  }

  async listBrands(): Promise<DataRecord[]> {
    return this.database.prepare("SELECT id, brand_name FROM brands ORDER BY sort DESC, brand_name").all() as DataRecord[];
  }

  async listVehicles(): Promise<DataRecord[]> {
    return this.database.prepare(`SELECT c.*, b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id ORDER BY c.sort DESC, c.name`).all() as DataRecord[];
  }

  async getVehicle(id: number): Promise<DataRecord | null> {
    return (this.database.prepare("SELECT * FROM cars WHERE id=?").get(id) as DataRecord | undefined) || null;
  }

  async createVehicle(input: VehicleInput): Promise<void> {
    this.database.prepare(`INSERT INTO cars (brand_id,code,name,image_path,synopsis,is_show,folder_name,manual_id,menu_type,sort) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(input.brandId, input.code, input.name, input.imagePath, input.synopsis, input.isShow ? 1 : 0, input.folderName, input.manualId, input.menuType, input.sort);
  }

  async updateVehicle(id: number, input: VehicleInput): Promise<boolean> {
    const result = this.database.prepare(`UPDATE cars SET brand_id=?,code=?,name=?,image_path=?,synopsis=?,is_show=?,folder_name=?,manual_id=?,menu_type=?,sort=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(input.brandId, input.code, input.name, input.imagePath, input.synopsis, input.isShow ? 1 : 0, input.folderName, input.manualId, input.menuType, input.sort, id);
    return result.changes > 0;
  }

  async listMembers(): Promise<DataRecord[]> {
    return this.database.prepare("SELECT id,email,name,contact_address,status,vip_status,vip_expires_at FROM users WHERE role='customer' ORDER BY id DESC").all() as DataRecord[];
  }

  async getMember(id: number): Promise<DataRecord | null> {
    return (this.database.prepare("SELECT id,email,name,contact_address,status,vip_status,vip_expires_at FROM users WHERE id=? AND role='customer'").get(id) as DataRecord | undefined) || null;
  }

  async createMember(input: MemberInput & { passwordHash: string }): Promise<void> {
    this.database.prepare(`INSERT INTO users (email,name,password_hash,contact_address,status,vip_status,vip_expires_at,role) VALUES (?,?,?,?,?,?,?,'customer')`)
      .run(input.email, input.name, input.passwordHash, input.contactAddress, input.status ? 1 : 0, input.vipStatus ? 1 : 0, input.vipExpiresAt);
  }

  async updateMember(id: number, input: MemberInput): Promise<boolean> {
    const result = input.passwordHash
      ? this.database.prepare(`UPDATE users SET email=?,name=?,password_hash=?,contact_address=?,status=?,vip_status=?,vip_expires_at=? WHERE id=? AND role='customer'`)
        .run(input.email, input.name, input.passwordHash, input.contactAddress, input.status ? 1 : 0, input.vipStatus ? 1 : 0, input.vipExpiresAt, id)
      : this.database.prepare(`UPDATE users SET email=?,name=?,contact_address=?,status=?,vip_status=?,vip_expires_at=? WHERE id=? AND role='customer'`)
        .run(input.email, input.name, input.contactAddress, input.status ? 1 : 0, input.vipStatus ? 1 : 0, input.vipExpiresAt, id);
    return result.changes > 0;
  }

  async extendMemberVip(id: number, days: number): Promise<string | null> {
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("Invalid VIP extension");
    return this.database.transaction(() => {
      const member = this.database.prepare("SELECT vip_expires_at FROM users WHERE id=? AND role='customer'")
        .get(id) as { vip_expires_at: string | null } | undefined;
      if (!member) return null;
      const currentExpiry = member.vip_expires_at ? new Date(member.vip_expires_at) : null;
      const base = currentExpiry && Number.isFinite(currentExpiry.valueOf()) && currentExpiry > new Date()
        ? currentExpiry
        : new Date();
      const expiresAt = new Date(base.valueOf() + days * 24 * 60 * 60 * 1000).toISOString();
      this.database.prepare("UPDATE users SET vip_status=1, vip_expires_at=? WHERE id=? AND role='customer'")
        .run(expiresAt, id);
      return expiresAt;
    })();
  }

  async listCodes(): Promise<DataRecord[]> {
    return this.database.prepare("SELECT id,code,duration_hours,is_used,status FROM authorization_codes ORDER BY id DESC").all() as DataRecord[];
  }

  async getCode(id: number): Promise<DataRecord | null> {
    return (this.database.prepare("SELECT id,code,duration_hours,is_used,status FROM authorization_codes WHERE id=?").get(id) as DataRecord | undefined) || null;
  }

  async createCode(input: CodeInput): Promise<void> {
    this.database.prepare("INSERT INTO authorization_codes (code,duration_hours,is_used,status) VALUES (?,?,0,?)")
      .run(input.code, input.durationHours, input.status ? 1 : 0);
  }

  async updateCode(id: number, input: CodeInput): Promise<boolean> {
    const result = this.database.prepare("UPDATE authorization_codes SET code=?,duration_hours=?,status=? WHERE id=?")
      .run(input.code, input.durationHours, input.status ? 1 : 0, id);
    return result.changes > 0;
  }
}
