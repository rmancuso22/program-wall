export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      lifecycle_items: {
        Row: {
          end_week: number
          id: string
          name: string
          position: number
          scope: string | null
          start_week: number
          track: string
          type: Database["public"]["Enums"]["lifecycle_item_type"]
        }
        Insert: {
          end_week: number
          id: string
          name: string
          position: number
          scope?: string | null
          start_week: number
          track: string
          type: Database["public"]["Enums"]["lifecycle_item_type"]
        }
        Update: {
          end_week?: number
          id?: string
          name?: string
          position?: number
          scope?: string | null
          start_week?: number
          track?: string
          type?: Database["public"]["Enums"]["lifecycle_item_type"]
        }
        Relationships: []
      }
      lifecycle_stages: {
        Row: {
          duration_label: string
          end_week: number
          name: string
          position: number
          start_week: number
        }
        Insert: {
          duration_label?: string
          end_week: number
          name: string
          position: number
          start_week: number
        }
        Update: {
          duration_label?: string
          end_week?: number
          name?: string
          position?: number
          start_week?: number
        }
        Relationships: []
      }
      people: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          profile_id: string | null
          slack_handle: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          profile_id?: string | null
          slack_handle?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          profile_id?: string | null
          slack_handle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["profile_role"]
          theme: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          role?: Database["public"]["Enums"]["profile_role"]
          theme?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["profile_role"]
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_lifecycle: {
        Row: {
          project_id: string
          scope_api: boolean
          scope_commercial: boolean
          scope_external: boolean
          scope_ux: boolean
          updated_at: string
        }
        Insert: {
          project_id: string
          scope_api?: boolean
          scope_commercial?: boolean
          scope_external?: boolean
          scope_ux?: boolean
          updated_at?: string
        }
        Update: {
          project_id?: string
          scope_api?: boolean
          scope_commercial?: boolean
          scope_external?: boolean
          scope_ux?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_lifecycle_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_lifecycle_items: {
        Row: {
          done_on: string | null
          end_date: string | null
          item_id: string
          owner_person_id: string | null
          owner_set: boolean
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["lifecycle_item_status"]
          updated_at: string
        }
        Insert: {
          done_on?: string | null
          end_date?: string | null
          item_id: string
          owner_person_id?: string | null
          owner_set?: boolean
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["lifecycle_item_status"]
          updated_at?: string
        }
        Update: {
          done_on?: string | null
          end_date?: string | null
          item_id?: string
          owner_person_id?: string | null
          owner_set?: boolean
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["lifecycle_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_lifecycle_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_lifecycle_items_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_lifecycle_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_people: {
        Row: {
          created_at: string
          id: string
          person_id: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_id: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_people_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_risks: {
        Row: {
          body: string
          created_at: string
          id: string
          position: number
          project_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          position?: number
          project_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_teams: {
        Row: {
          position: number
          project_id: string
          team_id: string
        }
        Insert: {
          position?: number
          project_id: string
          team_id: string
        }
        Update: {
          position?: number
          project_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_teams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          api_spec_merge: string | null
          commit_pitch: string | null
          created_at: string
          description: string
          dev_complete: string | null
          id: string
          key: string
          name: string
          phase: Database["public"]["Enums"]["project_phase"]
          quarter_id: string
          rag: Database["public"]["Enums"]["project_rag"]
          release: string | null
          srb_merge: string | null
          status_text: string
          status_updated_at: string
          updated_at: string
        }
        Insert: {
          api_spec_merge?: string | null
          commit_pitch?: string | null
          created_at?: string
          description?: string
          dev_complete?: string | null
          id?: string
          key: string
          name: string
          phase?: Database["public"]["Enums"]["project_phase"]
          quarter_id: string
          rag?: Database["public"]["Enums"]["project_rag"]
          release?: string | null
          srb_merge?: string | null
          status_text?: string
          status_updated_at?: string
          updated_at?: string
        }
        Update: {
          api_spec_merge?: string | null
          commit_pitch?: string | null
          created_at?: string
          description?: string
          dev_complete?: string | null
          id?: string
          key?: string
          name?: string
          phase?: Database["public"]["Enums"]["project_phase"]
          quarter_id?: string
          rag?: Database["public"]["Enums"]["project_rag"]
          release?: string | null
          srb_merge?: string | null
          status_text?: string
          status_updated_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
        ]
      }
      quarters: {
        Row: {
          id: string
          is_backlog: boolean
          label: string
          sort_order: number
          subtitle: string
        }
        Insert: {
          id: string
          is_backlog?: boolean
          label: string
          sort_order: number
          subtitle?: string
        }
        Update: {
          id?: string
          is_backlog?: boolean
          label?: string
          sort_order?: number
          subtitle?: string
        }
        Relationships: []
      }
      review_approvals: {
        Row: {
          created_at: string
          doc_id: string
          id: string
          person_id: string
          position: number
          requested_at: string | null
          responded_at: string | null
          role: string
          state: Database["public"]["Enums"]["approval_state"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_id: string
          id?: string
          person_id: string
          position?: number
          requested_at?: string | null
          responded_at?: string | null
          role: string
          state?: Database["public"]["Enums"]["approval_state"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_id?: string
          id?: string
          person_id?: string
          position?: number
          requested_at?: string | null
          responded_at?: string | null
          role?: string
          state?: Database["public"]["Enums"]["approval_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_approvals_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "review_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_approvals_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      review_docs: {
        Row: {
          body_md: string
          branch: string | null
          created_at: string
          expected_open_at: string | null
          id: string
          kind: Database["public"]["Enums"]["review_kind"]
          merged_at: string | null
          opened_at: string | null
          pr_number: number | null
          project_id: string
          repo: string | null
          state: Database["public"]["Enums"]["review_doc_state"]
          target_at: string | null
          updated_at: string
        }
        Insert: {
          body_md?: string
          branch?: string | null
          created_at?: string
          expected_open_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["review_kind"]
          merged_at?: string | null
          opened_at?: string | null
          pr_number?: number | null
          project_id: string
          repo?: string | null
          state?: Database["public"]["Enums"]["review_doc_state"]
          target_at?: string | null
          updated_at?: string
        }
        Update: {
          body_md?: string
          branch?: string | null
          created_at?: string
          expected_open_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["review_kind"]
          merged_at?: string | null
          opened_at?: string | null
          pr_number?: number | null
          project_id?: string
          repo?: string | null
          state?: Database["public"]["Enums"]["review_doc_state"]
          target_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_docs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_projects: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      save_project_details: {
        Args: {
          p_api_spec_merge: string
          p_commit_pitch: string
          p_description: string
          p_dev_complete: string
          p_people: Json
          p_project_id: string
          p_rag: Database["public"]["Enums"]["project_rag"]
          p_release: string
          p_risks: string[]
          p_srb_merge: string
          p_status_text: string
        }
        Returns: undefined
      }
    }
    Enums: {
      approval_state:
        | "pending"
        | "approved"
        | "changes_requested"
        | "not_requested"
      lifecycle_item_status: "open" | "done" | "na"
      lifecycle_item_type: "gate" | "milestone" | "task" | "weekly"
      profile_role: "admin" | "member" | "viewer"
      project_phase:
        | "requirements"
        | "design"
        | "dev"
        | "pipeline"
        | "test"
        | "released"
      project_rag: "green" | "yellow" | "red"
      project_role: "exec" | "pm" | "om" | "devmgr" | "arch" | "devlead"
      review_doc_state: "draft" | "open" | "merged"
      review_kind: "srb" | "api"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      approval_state: [
        "pending",
        "approved",
        "changes_requested",
        "not_requested",
      ],
      lifecycle_item_status: ["open", "done", "na"],
      lifecycle_item_type: ["gate", "milestone", "task", "weekly"],
      profile_role: ["admin", "member", "viewer"],
      project_phase: [
        "requirements",
        "design",
        "dev",
        "pipeline",
        "test",
        "released",
      ],
      project_rag: ["green", "yellow", "red"],
      project_role: ["exec", "pm", "om", "devmgr", "arch", "devlead"],
      review_doc_state: ["draft", "open", "merged"],
      review_kind: ["srb", "api"],
    },
  },
} as const
