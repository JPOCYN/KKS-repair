import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { hashPassword, verifyPassword } from "./password.js";
import type {
  AppRepository,
  CodeInput,
  ContactRequestInput,
  DashboardData,
  DataRecord,
  LoginUser,
  MemberInput,
  VehicleInput,
} from "./repository.js";
import { SqlJsDatabase } from "./sqlite.js";

type QueryRow = RowDataPacket & Record<string, unknown>;

interface MySqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const migrationKey = "sqlite-recovery-v1";

function required(environment: NodeJS.ProcessEnv, primary: string, fallback?: string): string {
  const value = environment[primary]?.trim() || (fallback ? environment[fallback]?.trim() : "");
  if (!value) throw new Error(`${primary} is required when DATA_BACKEND=mysql`);
  return value;
}

export function readMySqlConfig(environment: NodeJS.ProcessEnv = process.env): MySqlConfig {
  const portValue = environment.MYSQL_PORT?.trim() || environment.DB_PORT?.trim() || "3306";
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MYSQL_PORT must be a valid TCP port");
  }
  return {
    host: required(environment, "MYSQL_HOST", "DB_HOST"),
    port,
    user: required(environment, "MYSQL_USER", "DB_USER"),
    password: required(environment, "MYSQL_PASSWORD", "DB_PASSWORD"),
    database: required(environment, "MYSQL_DATABASE", "DB_NAME"),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asRecords(rows: QueryRow[]): DataRecord[] {
  return rows.map((row) => ({ ...row }));
}

function sqliteRows(database: SqlJsDatabase, table: string, columns: string[]): unknown[][] {
  return database.prepare(`SELECT ${columns.join(",")} FROM ${table} ORDER BY id`).all()
    .map((row) => columns.map((column) => row[column] ?? null));
}

async function insertRows(
  connection: PoolConnection,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  const chunkSize = 250;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    await connection.execute(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`,
      chunk.flat(),
    );
  }
}

export class MySqlRepository implements AppRepository {
  readonly backend = "mysql" as const;

  private constructor(
    private readonly pool: Pool,
    private readonly environment: NodeJS.ProcessEnv,
  ) {}

  static async create(environment: NodeJS.ProcessEnv = process.env): Promise<MySqlRepository> {
    const config = readMySqlConfig(environment);
    const pool = mysql.createPool({
      ...config,
      charset: "utf8mb4",
      connectionLimit: 5,
      enableKeepAlive: true,
      waitForConnections: true,
      timezone: "Z",
    });
    const repository = new MySqlRepository(pool, environment);
    try {
      await repository.initializeSchema();
      await repository.importSqliteIfConfigured();
      await repository.ensureConfiguredAdmin();
      await repository.health();
      return repository;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  private async initializeSchema(): Promise<void> {
    const statements = [
      `CREATE TABLE IF NOT EXISTS brands (
        id BIGINT PRIMARY KEY,
        brand_name VARCHAR(255) NOT NULL,
        sort INT NOT NULL DEFAULT 0,
        created_at VARCHAR(64) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS cars (
        id BIGINT PRIMARY KEY,
        brand_id BIGINT NOT NULL,
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        image_path VARCHAR(1000) NULL,
        synopsis TEXT NULL,
        is_show TINYINT(1) NOT NULL DEFAULT 1,
        folder_name VARCHAR(255) NOT NULL,
        manual_id BIGINT NULL,
        menu_type VARCHAR(100) NULL,
        sort INT NOT NULL DEFAULT 0,
        created_at VARCHAR(64) NULL,
        updated_at VARCHAR(64) NULL,
        CONSTRAINT cars_brand_fk FOREIGN KEY (brand_id) REFERENCES brands(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS users (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(254) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        contact_address TEXT NULL,
        auth_code VARCHAR(100) NULL,
        status TINYINT(1) NOT NULL DEFAULT 1,
        vip_status TINYINT(1) NOT NULL DEFAULT 0,
        vip_expires_at VARCHAR(64) NULL,
        role ENUM('admin','customer') NOT NULL DEFAULT 'customer',
        created_at VARCHAR(64) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS authorization_codes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(100) NOT NULL UNIQUE,
        duration_hours DOUBLE NOT NULL DEFAULT 0,
        expires_at VARCHAR(64) NULL,
        is_used TINYINT(1) NOT NULL DEFAULT 0,
        status TINYINT(1) NOT NULL DEFAULT 1,
        created_at VARCHAR(64) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS manual_menu (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        car_id BIGINT NOT NULL,
        source_menu_id BIGINT NULL,
        parent_id BIGINT NULL,
        name VARCHAR(1000) NOT NULL,
        relative_file VARCHAR(1000) NULL,
        sort INT NOT NULL DEFAULT 0,
        INDEX manual_menu_car_id_idx (car_id),
        CONSTRAINT manual_menu_car_fk FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE,
        CONSTRAINT manual_menu_parent_fk FOREIGN KEY (parent_id) REFERENCES manual_menu(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token_hash CHAR(64) PRIMARY KEY,
        user_id BIGINT NOT NULL,
        csrf_token VARCHAR(100) NOT NULL,
        expires_at VARCHAR(64) NOT NULL,
        created_at VARCHAR(64) NOT NULL,
        INDEX sessions_user_id_idx (user_id),
        CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS contact_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(254) NOT NULL,
        request_type ENUM('general','privacy','copyright') NOT NULL,
        message TEXT NOT NULL,
        status ENUM('open','resolved') NOT NULL DEFAULT 'open',
        created_at VARCHAR(64) NOT NULL,
        resolved_at VARCHAR(64) NULL,
        INDEX contact_requests_status_created_idx (status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS app_meta (
        meta_key VARCHAR(100) PRIMARY KEY,
        meta_value VARCHAR(1000) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];
    for (const statement of statements) await this.pool.execute(statement);
  }

  private async importSqliteIfConfigured(): Promise<void> {
    const sourcePath = this.environment.MYSQL_MIGRATION_PATH?.trim();
    if (!sourcePath) return;

    const [markerRows] = await this.pool.execute<QueryRow[]>("SELECT meta_key FROM app_meta WHERE meta_key=?", [migrationKey]);
    if (markerRows.length > 0) return;

    const filename = path.resolve(sourcePath);
    if (!existsSync(filename)) throw new Error(`MYSQL_MIGRATION_PATH does not exist: ${filename}`);

    const [countRows] = await this.pool.query<QueryRow[]>(`
      SELECT
        (SELECT COUNT(*) FROM brands) AS brands,
        (SELECT COUNT(*) FROM cars) AS cars,
        (SELECT COUNT(*) FROM users WHERE role='customer') AS customers,
        (SELECT COUNT(*) FROM authorization_codes) AS codes,
        (SELECT COUNT(*) FROM manual_menu) AS menu_items
    `);
    const existing = countRows[0];
    if (!existing) throw new Error("Cannot read MySQL migration target counts");
    if (["brands", "cars", "customers", "codes", "menu_items"].some((key) => Number(existing[key]) > 0)) {
      throw new Error("MySQL migration refused because the target database is not empty and has no migration marker");
    }

    const source = new SqlJsDatabase(filename);
    const tables = [
      { table: "brands", columns: ["id", "brand_name", "sort", "created_at"] },
      { table: "cars", columns: ["id", "brand_id", "code", "name", "image_path", "synopsis", "is_show", "folder_name", "manual_id", "menu_type", "sort", "created_at", "updated_at"] },
      { table: "users", columns: ["id", "email", "name", "password_hash", "contact_address", "auth_code", "status", "vip_status", "vip_expires_at", "role", "created_at"] },
      { table: "authorization_codes", columns: ["id", "code", "duration_hours", "expires_at", "is_used", "status", "created_at"] },
      { table: "manual_menu", columns: ["id", "car_id", "source_menu_id", "parent_id", "name", "relative_file", "sort"] },
    ];
    const rowsByTable = new Map<string, unknown[][]>();
    try {
      for (const item of tables) rowsByTable.set(item.table, sqliteRows(source, item.table, item.columns));
    } finally {
      source.close();
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const item of tables) {
        await insertRows(connection, item.table, item.columns, rowsByTable.get(item.table) || []);
      }
      await connection.execute("INSERT INTO app_meta (meta_key,meta_value) VALUES (?,?)", [migrationKey, new Date().toISOString()]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [validationRows] = await this.pool.query<QueryRow[]>(`
      SELECT
        (SELECT COUNT(*) FROM brands) AS brands,
        (SELECT COUNT(*) FROM cars) AS cars,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM authorization_codes) AS codes,
        (SELECT COUNT(*) FROM manual_menu) AS menu_items
    `);
    const validation = validationRows[0];
    if (!validation) throw new Error("Cannot validate MySQL migration counts");
    for (const item of tables) {
      if (Number(validation[item.table === "authorization_codes" ? "codes" : item.table === "manual_menu" ? "menu_items" : item.table]) !== (rowsByTable.get(item.table) || []).length) {
        throw new Error(`MySQL migration validation failed for ${item.table}`);
      }
    }
  }

  private async ensureConfiguredAdmin(): Promise<void> {
    const email = this.environment.ADMIN_EMAIL?.trim();
    const password = this.environment.ADMIN_PASSWORD;
    if (!email || !password) return;
    const [rows] = await this.pool.execute<QueryRow[]>("SELECT id,password_hash FROM users WHERE email=? LIMIT 1", [email]);
    const existing = rows[0];
    if (existing) {
      if (!verifyPassword(password, String(existing.password_hash))) {
        const connection = await this.pool.getConnection();
        try {
          await connection.beginTransaction();
          await connection.execute("UPDATE users SET password_hash=? WHERE id=?", [hashPassword(password), existing.id]);
          await connection.execute("DELETE FROM sessions WHERE user_id=?", [existing.id]);
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      }
      return;
    }
    try {
      await this.pool.execute(
        "INSERT INTO users (email,name,password_hash,status,vip_status,role,created_at) VALUES (?,'Administrator',?,1,1,'admin',?)",
        [email, hashPassword(password), new Date().toISOString()],
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
    }
  }

  async checkRecoveredDatabase(): Promise<void> {}

  async health(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getSessionUser(token: string | undefined) {
    if (!token) return null;
    const [rows] = await this.pool.execute<QueryRow[]>(`
      SELECT u.id,u.email,u.name,u.role,s.csrf_token AS csrfToken
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.status=1
      LIMIT 1
    `, [sha256(token), new Date().toISOString()]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      email: String(row.email),
      name: String(row.name),
      role: row.role as "admin" | "customer",
      csrfToken: String(row.csrfToken),
    };
  }

  async createSession(userId: number): Promise<{ token: string; csrfToken: string }> {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.valueOf() + 12 * 60 * 60 * 1000).toISOString();
    await this.pool.execute(
      "INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at,created_at) VALUES (?,?,?,?,?)",
      [sha256(token), userId, csrfToken, expiresAt, now.toISOString()],
    );
    return { token, csrfToken };
  }

  async deleteSession(token: string | undefined): Promise<void> {
    if (token) await this.pool.execute("DELETE FROM sessions WHERE token_hash=?", [sha256(token)]);
  }

  async registerCustomer(input: { email: string; name: string; authCode: string; passwordHash: string }): Promise<number | null> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<QueryRow[]>(
        "SELECT id,duration_hours FROM authorization_codes WHERE code=? AND status=1 AND is_used=0 FOR UPDATE",
        [input.authCode],
      );
      const code = rows[0];
      if (!code) {
        await connection.rollback();
        return null;
      }
      const durationHours = Number(code.duration_hours);
      const expiresAt = durationHours > 0
        ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
        : null;
      const [created] = await connection.execute<ResultSetHeader>(`
        INSERT INTO users (email,name,password_hash,auth_code,status,vip_status,vip_expires_at,role,created_at)
        VALUES (?,?,?,?,1,1,?,'customer',?)
      `, [input.email, input.name, input.passwordHash, input.authCode, expiresAt, new Date().toISOString()]);
      const [redeemed] = await connection.execute<ResultSetHeader>(
        "UPDATE authorization_codes SET is_used=1 WHERE id=? AND is_used=0",
        [code.id],
      );
      if (redeemed.affectedRows !== 1) throw new Error("Authorization code redemption failed");
      await connection.commit();
      return Number(created.insertId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findLoginUser(email: string): Promise<LoginUser | null> {
    const [rows] = await this.pool.execute<QueryRow[]>(
      "SELECT id,password_hash,role,status FROM users WHERE email=? LIMIT 1",
      [email],
    );
    const row = rows[0];
    return row ? {
      id: Number(row.id),
      passwordHash: String(row.password_hash),
      role: row.role as "admin" | "customer",
      status: Number(row.status) === 1,
    } : null;
  }

  async listVisibleVehicles(): Promise<DataRecord[]> {
    const [rows] = await this.pool.query<QueryRow[]>("SELECT c.*,b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id WHERE c.is_show=1 ORDER BY c.sort DESC,c.name");
    return asRecords(rows);
  }

  async getVehicleDetail(id: number): Promise<{ car: DataRecord; menu: DataRecord[] } | null> {
    const [cars] = await this.pool.execute<QueryRow[]>("SELECT c.*,b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id WHERE c.id=? LIMIT 1", [id]);
    if (!cars[0]) return null;
    const [menu] = await this.pool.execute<QueryRow[]>("SELECT * FROM manual_menu WHERE car_id=? ORDER BY sort,name", [id]);
    return { car: { ...cars[0] }, menu: asRecords(menu) };
  }

  async getDashboard(): Promise<DashboardData> {
    const [counts] = await this.pool.query<QueryRow[]>(`
      SELECT
        (SELECT COUNT(*) FROM cars) AS Vehicles,
        (SELECT COUNT(*) FROM brands) AS Brands,
        (SELECT COUNT(*) FROM users WHERE role='customer') AS Members,
        (SELECT COUNT(*) FROM authorization_codes) AS authorizationCodes
    `);
    const [cars] = await this.pool.query<QueryRow[]>("SELECT c.*,b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id ORDER BY c.sort DESC LIMIT 8");
    const [users] = await this.pool.query<QueryRow[]>("SELECT email,name,status,vip_status,vip_expires_at FROM users WHERE role='customer' ORDER BY id DESC LIMIT 8");
    const [codes] = await this.pool.query<QueryRow[]>("SELECT code,duration_hours,is_used,status FROM authorization_codes ORDER BY id DESC LIMIT 8");
    const countRow = counts[0];
    if (!countRow) throw new Error("Cannot read MySQL dashboard counts");
    return {
      counts: {
        Vehicles: Number(countRow.Vehicles),
        Brands: Number(countRow.Brands),
        Members: Number(countRow.Members),
        "Authorization codes": Number(countRow.authorizationCodes),
      },
      cars: asRecords(cars),
      users: asRecords(users),
      codes: asRecords(codes),
    };
  }

  async listBrands(): Promise<DataRecord[]> {
    const [rows] = await this.pool.query<QueryRow[]>("SELECT id,brand_name FROM brands ORDER BY sort DESC,brand_name");
    return asRecords(rows);
  }

  async listVehicles(): Promise<DataRecord[]> {
    const [rows] = await this.pool.query<QueryRow[]>("SELECT c.*,b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id ORDER BY c.sort DESC,c.name");
    return asRecords(rows);
  }

  async getVehicle(id: number): Promise<DataRecord | null> {
    const [rows] = await this.pool.execute<QueryRow[]>("SELECT * FROM cars WHERE id=? LIMIT 1", [id]);
    return rows[0] ? { ...rows[0] } : null;
  }

  async createVehicle(input: VehicleInput): Promise<void> {
    await this.pool.execute(`
      INSERT INTO cars (brand_id,code,name,image_path,synopsis,is_show,folder_name,manual_id,menu_type,sort)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [input.brandId, input.code, input.name, input.imagePath, input.synopsis, input.isShow ? 1 : 0, input.folderName, input.manualId, input.menuType, input.sort]);
  }

  async updateVehicle(id: number, input: VehicleInput): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(`
      UPDATE cars SET brand_id=?,code=?,name=?,image_path=?,synopsis=?,is_show=?,folder_name=?,manual_id=?,menu_type=?,sort=?,updated_at=? WHERE id=?
    `, [input.brandId, input.code, input.name, input.imagePath, input.synopsis, input.isShow ? 1 : 0, input.folderName, input.manualId, input.menuType, input.sort, new Date().toISOString(), id]);
    return result.affectedRows > 0;
  }

  async listMembers(): Promise<DataRecord[]> {
    const [rows] = await this.pool.query<QueryRow[]>("SELECT id,email,name,contact_address,status,vip_status,vip_expires_at FROM users WHERE role='customer' ORDER BY id DESC");
    return asRecords(rows);
  }

  async getMember(id: number): Promise<DataRecord | null> {
    const [rows] = await this.pool.execute<QueryRow[]>("SELECT id,email,name,contact_address,status,vip_status,vip_expires_at FROM users WHERE id=? AND role='customer' LIMIT 1", [id]);
    return rows[0] ? { ...rows[0] } : null;
  }

  async createMember(input: MemberInput & { passwordHash: string }): Promise<void> {
    await this.pool.execute(`
      INSERT INTO users (email,name,password_hash,contact_address,status,vip_status,vip_expires_at,role,created_at)
      VALUES (?,?,?,?,?,?,?,'customer',?)
    `, [input.email, input.name, input.passwordHash, input.contactAddress, input.status ? 1 : 0, input.vipStatus ? 1 : 0, input.vipExpiresAt, new Date().toISOString()]);
  }

  async updateMember(id: number, input: MemberInput): Promise<boolean> {
    const parameters = [input.email, input.name, input.contactAddress, input.status ? 1 : 0, input.vipStatus ? 1 : 0, input.vipExpiresAt];
    const passwordClause = input.passwordHash ? "password_hash=?," : "";
    if (input.passwordHash) parameters.splice(2, 0, input.passwordHash);
    const [result] = await this.pool.execute<ResultSetHeader>(`
      UPDATE users SET email=?,name=?,${passwordClause}contact_address=?,status=?,vip_status=?,vip_expires_at=? WHERE id=? AND role='customer'
    `, [...parameters, id]);
    return result.affectedRows > 0;
  }

  async extendMemberVip(id: number, days: number): Promise<string | null> {
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("Invalid VIP extension");
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<QueryRow[]>("SELECT vip_expires_at FROM users WHERE id=? AND role='customer' FOR UPDATE", [id]);
      const member = rows[0];
      if (!member) {
        await connection.rollback();
        return null;
      }
      const currentExpiry = member.vip_expires_at ? new Date(String(member.vip_expires_at)) : null;
      const base = currentExpiry && Number.isFinite(currentExpiry.valueOf()) && currentExpiry > new Date() ? currentExpiry : new Date();
      const expiresAt = new Date(base.valueOf() + days * 24 * 60 * 60 * 1000).toISOString();
      await connection.execute("UPDATE users SET vip_status=1,vip_expires_at=? WHERE id=? AND role='customer'", [expiresAt, id]);
      await connection.commit();
      return expiresAt;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async createContactRequest(input: ContactRequestInput): Promise<void> {
    await this.pool.execute(`
      INSERT INTO contact_requests (name,email,request_type,message,status,created_at)
      VALUES (?,?,?,?,'open',?)
    `, [input.name, input.email, input.requestType, input.message, new Date().toISOString()]);
  }

  async listContactRequests(): Promise<DataRecord[]> {
    const [rows] = await this.pool.query<QueryRow[]>(`
      SELECT id,name,email,request_type,message,status,created_at,resolved_at
      FROM contact_requests
      ORDER BY FIELD(status,'open','resolved'), created_at DESC
    `);
    return asRecords(rows);
  }

  async resolveContactRequest(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(`
      UPDATE contact_requests SET status='resolved',resolved_at=?
      WHERE id=? AND status='open'
    `, [new Date().toISOString(), id]);
    return result.affectedRows > 0;
  }

  async listCodes(): Promise<DataRecord[]> {
    const [rows] = await this.pool.query<QueryRow[]>("SELECT id,code,duration_hours,is_used,status FROM authorization_codes ORDER BY id DESC");
    return asRecords(rows);
  }

  async getCode(id: number): Promise<DataRecord | null> {
    const [rows] = await this.pool.execute<QueryRow[]>("SELECT id,code,duration_hours,is_used,status FROM authorization_codes WHERE id=? LIMIT 1", [id]);
    return rows[0] ? { ...rows[0] } : null;
  }

  async createCode(input: CodeInput): Promise<void> {
    await this.pool.execute(
      "INSERT INTO authorization_codes (code,duration_hours,is_used,status,created_at) VALUES (?,?,0,?,?)",
      [input.code, input.durationHours, input.status ? 1 : 0, new Date().toISOString()],
    );
  }

  async updateCode(id: number, input: CodeInput): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("UPDATE authorization_codes SET code=?,duration_hours=?,status=? WHERE id=?", [input.code, input.durationHours, input.status ? 1 : 0, id]);
    return result.affectedRows > 0;
  }
}
