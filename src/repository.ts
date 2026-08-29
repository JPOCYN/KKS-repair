import type { SessionUser } from "./db.js";
import { SqliteRepository } from "./sqlite-repository.js";

export type DataRecord = Record<string, unknown>;

export interface VehicleInput {
  brandId: number;
  code: string;
  name: string;
  imagePath: string | null;
  synopsis: string | null;
  isShow: boolean;
  folderName: string;
  manualId: number | null;
  menuType: string | null;
  sort: number;
}

export interface MemberInput {
  email: string;
  name: string;
  contactAddress: string | null;
  passwordHash?: string;
  status: boolean;
  vipStatus: boolean;
  vipExpiresAt: string | null;
}

export interface CodeInput {
  code: string;
  durationHours: number;
  status: boolean;
}

export interface LoginUser {
  id: number;
  passwordHash: string;
  role: "admin" | "customer";
  status: boolean;
}

export interface DashboardData {
  counts: Record<string, number>;
  cars: DataRecord[];
  users: DataRecord[];
  codes: DataRecord[];
}

export interface AppRepository {
  readonly backend: "sqlite" | "supabase";
  checkRecoveredDatabase(): Promise<void>;
  health(): Promise<void>;
  close(): Promise<void>;
  getSessionUser(token: string | undefined): Promise<SessionUser | null>;
  createSession(userId: number): Promise<{ token: string; csrfToken: string }>;
  deleteSession(token: string | undefined): Promise<void>;
  registerCustomer(input: { email: string; name: string; authCode: string; passwordHash: string }): Promise<number | null>;
  findLoginUser(email: string): Promise<LoginUser | null>;
  listVisibleVehicles(): Promise<DataRecord[]>;
  getVehicleDetail(id: number): Promise<{ car: DataRecord; menu: DataRecord[] } | null>;
  getDashboard(): Promise<DashboardData>;
  listBrands(): Promise<DataRecord[]>;
  listVehicles(): Promise<DataRecord[]>;
  getVehicle(id: number): Promise<DataRecord | null>;
  createVehicle(input: VehicleInput): Promise<void>;
  updateVehicle(id: number, input: VehicleInput): Promise<boolean>;
  listMembers(): Promise<DataRecord[]>;
  getMember(id: number): Promise<DataRecord | null>;
  createMember(input: MemberInput & { passwordHash: string }): Promise<void>;
  updateMember(id: number, input: MemberInput): Promise<boolean>;
  listCodes(): Promise<DataRecord[]>;
  getCode(id: number): Promise<DataRecord | null>;
  createCode(input: CodeInput): Promise<void>;
  updateCode(id: number, input: CodeInput): Promise<boolean>;
}

export async function createAppRepository(environment: NodeJS.ProcessEnv = process.env): Promise<AppRepository> {
  const backend = (environment.DATA_BACKEND || "sqlite").trim().toLowerCase();
  if (backend === "sqlite") return new SqliteRepository(environment);
  if (backend === "supabase") {
    const { SupabaseRepository } = await import("./supabase-repository.js");
    return SupabaseRepository.create(environment);
  }
  throw new Error("DATA_BACKEND must be sqlite or supabase");
}
