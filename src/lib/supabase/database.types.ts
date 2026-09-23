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
      jira_key_sequences: {
        Row: {
          last_num: number
          prefix: string
        }
        Insert: {
          last_num: number
          prefix: string
        }
        Update: {
          last_num?: number
          prefix?: string
        }
        Relationships: []
      }
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
      meeting_actions: {
        Row: {
          assignee_guest_name: string | null
          assignee_person_id: string | null
          body: string
          created_at: string
          done: boolean
          done_on: string | null
          due_on: string | null
          id: string
          occurrence_id: string
          position: number
          project_id: string
          updated_at: string
        }
        Insert: {
          assignee_guest_name?: string | null
          assignee_person_id?: string | null
          body?: string
          created_at?: string
          done?: boolean
          done_on?: string | null
          due_on?: string | null
          id?: string
          occurrence_id: string
          position?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          assignee_guest_name?: string | null
          assignee_person_id?: string | null
          body?: string
          created_at?: string
          done?: boolean
          done_on?: string | null
          due_on?: string | null
          id?: string
          occurrence_id?: string
          position?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_actions_assignee_person_id_fkey"
            columns: ["assignee_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_actions_occurrence_id_project_id_fkey"
            columns: ["occurrence_id", "project_id"]
            isOneToOne: false
            referencedRelation: "meeting_occurrences"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      meeting_agenda_items: {
        Row: {
          body: string
          created_at: string
          done: boolean
          id: string
          occurrence_id: string
          position: number
          project_id: string
        }
        Insert: {
          body: string
          created_at?: string
          done?: boolean
          id?: string
          occurrence_id: string
          position?: number
          project_id: string
        }
        Update: {
          body?: string
          created_at?: string
          done?: boolean
          id?: string
          occurrence_id?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_agenda_items_occurrence_id_project_id_fkey"
            columns: ["occurrence_id", "project_id"]
            isOneToOne: false
            referencedRelation: "meeting_occurrences"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      meeting_attendance: {
        Row: {
          created_at: string
          guest_name: string | null
          id: string
          occurrence_id: string
          person_id: string | null
          project_id: string
        }
        Insert: {
          created_at?: string
          guest_name?: string | null
          id?: string
          occurrence_id: string
          person_id?: string | null
          project_id: string
        }
        Update: {
          created_at?: string
          guest_name?: string | null
          id?: string
          occurrence_id?: string
          person_id?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendance_occurrence_id_project_id_fkey"
            columns: ["occurrence_id", "project_id"]
            isOneToOne: false
            referencedRelation: "meeting_occurrences"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "meeting_attendance_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_occurrences: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          invited_person_ids: string[]
          join_url: string | null
          notes: string
          occurs_on: string
          outlook_event_id: string | null
          posted_at: string | null
          posted_by: string | null
          project_id: string
          series_id: string | null
          source: Database["public"]["Enums"]["meeting_source"]
          starts_at: string
          timezone: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          invited_person_ids?: string[]
          join_url?: string | null
          notes?: string
          occurs_on: string
          outlook_event_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          project_id: string
          series_id?: string | null
          source?: Database["public"]["Enums"]["meeting_source"]
          starts_at: string
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          invited_person_ids?: string[]
          join_url?: string | null
          notes?: string
          occurs_on?: string
          outlook_event_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          project_id?: string
          series_id?: string | null
          source?: Database["public"]["Enums"]["meeting_source"]
          starts_at?: string
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_occurrences_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_occurrences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_occurrences_series_id_project_id_fkey"
            columns: ["series_id", "project_id"]
            isOneToOne: false
            referencedRelation: "meeting_series"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      meeting_series: {
        Row: {
          agenda_template: string[]
          color_track: string
          created_at: string
          duration_minutes: number
          ends_on: string | null
          id: string
          invited_roles: string[]
          join_url: string | null
          outlook_series_id: string | null
          project_id: string
          recurrence: string
          slug: string
          source: Database["public"]["Enums"]["meeting_source"]
          start_time: string
          starts_on: string
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          agenda_template?: string[]
          color_track?: string
          created_at?: string
          duration_minutes: number
          ends_on?: string | null
          id?: string
          invited_roles?: string[]
          join_url?: string | null
          outlook_series_id?: string | null
          project_id: string
          recurrence: string
          slug: string
          source?: Database["public"]["Enums"]["meeting_source"]
          start_time: string
          starts_on: string
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          agenda_template?: string[]
          color_track?: string
          created_at?: string
          duration_minutes?: number
          ends_on?: string | null
          id?: string
          invited_roles?: string[]
          join_url?: string | null
          outlook_series_id?: string | null
          project_id?: string
          recurrence?: string
          slug?: string
          source?: Database["public"]["Enums"]["meeting_source"]
          start_time?: string
          starts_on?: string
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_series_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      project_sprints: {
        Row: {
          current_sprint: number
          current_start: string
          project_id: string
          updated_at: string
        }
        Insert: {
          current_sprint: number
          current_start: string
          project_id: string
          updated_at?: string
        }
        Update: {
          current_sprint?: number
          current_start?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_teams: {
        Row: {
          lead_person_id: string | null
          position: number
          project_id: string
          team_id: string
        }
        Insert: {
          lead_person_id?: string | null
          position?: number
          project_id: string
          team_id: string
        }
        Update: {
          lead_person_id?: string | null
          position?: number
          project_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_teams_lead_person_id_fkey"
            columns: ["lead_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
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
      stickies: {
        Row: {
          assignee_person_id: string | null
          board_rank: number
          bucket: Database["public"]["Enums"]["board_bucket"] | null
          color: Database["public"]["Enums"]["sticky_color"]
          column_id: string
          created_at: string
          description: string
          done_sprint: number | null
          id: string
          jira_key: string | null
          jira_project: string
          lane_id: string
          project_id: string
          status: Database["public"]["Enums"]["sticky_status"]
          title: string
          updated_at: string
          wall_rank: number
        }
        Insert: {
          assignee_person_id?: string | null
          board_rank?: number
          bucket?: Database["public"]["Enums"]["board_bucket"] | null
          color?: Database["public"]["Enums"]["sticky_color"]
          column_id: string
          created_at?: string
          description?: string
          done_sprint?: number | null
          id?: string
          jira_key?: string | null
          jira_project?: string
          lane_id: string
          project_id: string
          status?: Database["public"]["Enums"]["sticky_status"]
          title?: string
          updated_at?: string
          wall_rank?: number
        }
        Update: {
          assignee_person_id?: string | null
          board_rank?: number
          bucket?: Database["public"]["Enums"]["board_bucket"] | null
          color?: Database["public"]["Enums"]["sticky_color"]
          column_id?: string
          created_at?: string
          description?: string
          done_sprint?: number | null
          id?: string
          jira_key?: string | null
          jira_project?: string
          lane_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["sticky_status"]
          title?: string
          updated_at?: string
          wall_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "stickies_assignee_person_id_fkey"
            columns: ["assignee_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stickies_column_id_project_id_fkey"
            columns: ["column_id", "project_id"]
            isOneToOne: false
            referencedRelation: "sticky_columns"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "stickies_lane_id_project_id_fkey"
            columns: ["lane_id", "project_id"]
            isOneToOne: false
            referencedRelation: "sticky_lanes"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "stickies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sticky_columns: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position: number
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticky_columns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sticky_lanes: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position: number
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticky_lanes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sticky_links: {
        Row: {
          created_at: string
          from_sticky_id: string
          id: string
          project_id: string
          to_sticky_id: string
        }
        Insert: {
          created_at?: string
          from_sticky_id: string
          id?: string
          project_id: string
          to_sticky_id: string
        }
        Update: {
          created_at?: string
          from_sticky_id?: string
          id?: string
          project_id?: string
          to_sticky_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticky_links_from_sticky_id_project_id_fkey"
            columns: ["from_sticky_id", "project_id"]
            isOneToOne: false
            referencedRelation: "stickies"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "sticky_links_to_sticky_id_project_id_fkey"
            columns: ["to_sticky_id", "project_id"]
            isOneToOne: false
            referencedRelation: "stickies"
            referencedColumns: ["id", "project_id"]
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
      complete_sprint: {
        Args: { p_project_id: string }
        Returns: {
          carried: number
          pulled: number
          sprint: number
          starts_on: string
        }[]
      }
      convert_stickies: {
        Args: { p_lane_id?: string; p_sticky_id?: string }
        Returns: {
          assignee_person_id: string | null
          board_rank: number
          bucket: Database["public"]["Enums"]["board_bucket"] | null
          color: Database["public"]["Enums"]["sticky_color"]
          column_id: string
          created_at: string
          description: string
          done_sprint: number | null
          id: string
          jira_key: string | null
          jira_project: string
          lane_id: string
          project_id: string
          status: Database["public"]["Enums"]["sticky_status"]
          title: string
          updated_at: string
          wall_rank: number
        }[]
        SetofOptions: {
          from: "*"
          to: "stickies"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ensure_meeting_occurrence: {
        Args: { p_occurs_on: string; p_series_id: string }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          invited_person_ids: string[]
          join_url: string | null
          notes: string
          occurs_on: string
          outlook_event_id: string | null
          posted_at: string | null
          posted_by: string | null
          project_id: string
          series_id: string | null
          source: Database["public"]["Enums"]["meeting_source"]
          starts_at: string
          timezone: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_occurrences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      meeting_rule_hits: {
        Args: {
          p_date: string
          p_ends_on: string
          p_rule: string
          p_starts_on: string
        }
        Returns: boolean
      }
      move_sticky: {
        Args: {
          p_before_id?: string
          p_column_id: string
          p_lane_id: string
          p_sticky_id: string
        }
        Returns: undefined
      }
      move_ticket: {
        Args: {
          p_before_id?: string
          p_bucket: Database["public"]["Enums"]["board_bucket"]
          p_lane_id: string
          p_sticky_id: string
        }
        Returns: undefined
      }
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
      seed_project_meetings: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      seed_project_stickies: {
        Args: { p_project_id: string; p_today: string }
        Returns: undefined
      }
    }
    Enums: {
      approval_state:
        | "pending"
        | "approved"
        | "changes_requested"
        | "not_requested"
      board_bucket: "backlog" | "current" | "next" | "done"
      lifecycle_item_status: "open" | "done" | "na"
      lifecycle_item_type: "gate" | "milestone" | "task" | "weekly"
      meeting_source: "liftoff" | "outlook"
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
      sticky_color: "yellow" | "blue" | "green" | "pink" | "purple" | "orange"
      sticky_status: "open" | "progress" | "closed"
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
      board_bucket: ["backlog", "current", "next", "done"],
      lifecycle_item_status: ["open", "done", "na"],
      lifecycle_item_type: ["gate", "milestone", "task", "weekly"],
      meeting_source: ["liftoff", "outlook"],
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
      sticky_color: ["yellow", "blue", "green", "pink", "purple", "orange"],
      sticky_status: ["open", "progress", "closed"],
    },
  },
} as const
