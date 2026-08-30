export interface BrandRow {
  id: number;
  brand_name: string;
  sort: number;
  created_at: string | null;
}

export interface CarRow {
  id: number;
  brand_id: number;
  code: string;
  name: string;
  image_path: string | null;
  synopsis: string | null;
  is_show: boolean;
  folder_name: string;
  manual_id: number | null;
  menu_type: string | null;
  sort: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AppUserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  contact_address: string | null;
  auth_code: string | null;
  status: boolean;
  vip_status: boolean;
  vip_expires_at: string | null;
  role: "admin" | "customer";
  created_at: string;
}

export interface AuthorizationCodeRow {
  id: number;
  code: string;
  duration_hours: number;
  expires_at: string | null;
  is_used: boolean;
  status: boolean;
  created_at: string | null;
}

export interface ManualMenuRow {
  id: number;
  car_id: number;
  source_menu_id: number | null;
  parent_id: number | null;
  name: string;
  relative_file: string | null;
  sort: number;
}

export interface AppSessionRow {
  token_hash: string;
  user_id: number;
  csrf_token: string;
  expires_at: string;
  created_at: string;
}

export interface ContactRequestRow {
  id: number;
  name: string;
  email: string;
  request_type: "general" | "privacy" | "copyright";
  message: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

export interface BlogPostRow {
  id: number;
  slug: string;
  title: string;
  meta_description: string;
  excerpt: string;
  category: string;
  brand: string;
  content_json: string;
  source_query: string;
  status: "published" | "disabled";
  published_at: string;
  created_at: string;
  updated_at: string;
}

type TableDefinition<Row, Insert = Row> = {
  Row: Row & Record<string, unknown>;
  Insert: Insert & Record<string, unknown>;
  Update: Partial<Insert> & Record<string, unknown>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      brands: TableDefinition<BrandRow, Omit<BrandRow, "id"> & { id?: number }>;
      cars: TableDefinition<CarRow, Omit<CarRow, "id"> & { id?: number }>;
      app_users: TableDefinition<AppUserRow, Omit<AppUserRow, "id" | "created_at"> & { id?: number; created_at?: string }>;
      authorization_codes: TableDefinition<AuthorizationCodeRow, Omit<AuthorizationCodeRow, "id"> & { id?: number }>;
      manual_menu: TableDefinition<ManualMenuRow, Omit<ManualMenuRow, "id"> & { id?: number }>;
      app_sessions: TableDefinition<AppSessionRow, Omit<AppSessionRow, "created_at"> & { created_at?: string }>;
      contact_requests: TableDefinition<ContactRequestRow, Omit<ContactRequestRow, "id" | "created_at" | "resolved_at" | "status"> & { id?: number; created_at?: string; resolved_at?: string | null; status?: "open" | "resolved" }>;
      blog_posts: TableDefinition<BlogPostRow, Omit<BlogPostRow, "id" | "created_at" | "updated_at"> & { id?: number; created_at?: string; updated_at?: string }>;
    };
    Views: Record<never, never>;
    Functions: {
      get_app_session: {
        Args: { p_token_hash: string };
        Returns: Array<{
          id: number;
          email: string;
          name: string;
          role: "admin" | "customer";
          csrf_token: string;
          vip_status: boolean;
          vip_expires_at: string | null;
        }>;
      };
      register_app_user: {
        Args: {
          p_email: string;
          p_name: string;
          p_password_hash: string;
          p_auth_code: string;
        };
        Returns: number | null;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type SupabaseTableName = keyof Database["public"]["Tables"];
