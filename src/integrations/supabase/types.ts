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
      diaries: {
        Row: {
          body_target: string | null
          body_translation: string | null
          created_at: string
          entry_date: string
          generated_by_ai: boolean
          id: string
          mood: string | null
          one_liner: string | null
          place_label: string | null
          status: string
          sticker_ids: string[]
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          body_target?: string | null
          body_translation?: string | null
          created_at?: string
          entry_date: string
          generated_by_ai?: boolean
          id?: string
          mood?: string | null
          one_liner?: string | null
          place_label?: string | null
          status?: string
          sticker_ids?: string[]
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          body_target?: string | null
          body_translation?: string | null
          created_at?: string
          entry_date?: string
          generated_by_ai?: boolean
          id?: string
          mood?: string | null
          one_liner?: string | null
          place_label?: string | null
          status?: string
          sticker_ids?: string[]
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      quests: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          criteria: Json
          description: string | null
          id: string
          progress: number
          quest_date: string
          reward: string | null
          target_count: number
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          criteria?: Json
          description?: string | null
          id?: string
          progress?: number
          quest_date: string
          reward?: string | null
          target_count?: number
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          criteria?: Json
          description?: string | null
          id?: string
          progress?: number
          quest_date?: string
          reward?: string | null
          target_count?: number
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_runs: {
        Row: {
          accepted: number
          created_at: string
          id: string
          iterations: number
          loop: string
          meta: Json | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          accepted?: number
          created_at?: string
          id?: string
          iterations?: number
          loop: string
          meta?: Json | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          accepted?: number
          created_at?: string
          id?: string
          iterations?: number
          loop?: string
          meta?: Json | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          icon_emoji: string
          key: string
          label_ja: string
          sort_order: number
        }
        Insert: {
          icon_emoji?: string
          key: string
          label_ja: string
          sort_order?: number
        }
        Update: {
          icon_emoji?: string
          key?: string
          label_ja?: string
          sort_order?: number
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          post_id: string | null
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          comment_count: number
          created_at: string
          id: string
          like_count: number
          sticker_id: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          caption?: string | null
          comment_count?: number
          created_at?: string
          id?: string
          like_count?: number
          sticker_id?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          caption?: string | null
          comment_count?: number
          created_at?: string
          id?: string
          like_count?: number
          sticker_id?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_premium: boolean
          level_goal: string
          native_language: string
          onboarded: boolean
          pronunciation_strictness: string
          target_language: string
          ui_language: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_premium?: boolean
          level_goal?: string
          native_language?: string
          onboarded?: boolean
          pronunciation_strictness?: string
          target_language?: string
          ui_language?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_premium?: boolean
          level_goal?: string
          native_language?: string
          onboarded?: boolean
          pronunciation_strictness?: string
          target_language?: string
          ui_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          blur_seen: boolean
          created_at: string
          due_at: string
          ease: number
          id: string
          interval_days: number
          last_reviewed_at: string | null
          last_score: number | null
          repetitions: number
          sticker_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blur_seen?: boolean
          created_at?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          last_score?: number | null
          repetitions?: number
          sticker_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blur_seen?: boolean
          created_at?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          last_score?: number | null
          repetitions?: number
          sticker_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      stickers: {
        Row: {
          caption: string | null
          created_at: string
          cutout_image_url: string | null
          id: string
          language: string
          lat: number | null
          lng: number | null
          location_name: string | null
          object_image_url: string | null
          selfie_image_url: string | null
          taken_at: string
          user_id: string
          visibility: string
          word_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          cutout_image_url?: string | null
          id?: string
          language?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          object_image_url?: string | null
          selfie_image_url?: string | null
          taken_at?: string
          user_id: string
          visibility?: string
          word_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          cutout_image_url?: string | null
          id?: string
          language?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          object_image_url?: string | null
          selfie_image_url?: string | null
          taken_at?: string
          user_id?: string
          visibility?: string
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stickers_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      words: {
        Row: {
          category_key: string | null
          created_at: string
          example_sentence: string | null
          example_translation: string | null
          headword: string
          id: string
          language: string
          level: string | null
          meaning_ja: string
          part_of_speech: string | null
          pinyin: string | null
          reading_zhuyin: string | null
          silhouette_emoji: string | null
          source: string
        }
        Insert: {
          category_key?: string | null
          created_at?: string
          example_sentence?: string | null
          example_translation?: string | null
          headword: string
          id?: string
          language?: string
          level?: string | null
          meaning_ja: string
          part_of_speech?: string | null
          pinyin?: string | null
          reading_zhuyin?: string | null
          silhouette_emoji?: string | null
          source?: string
        }
        Update: {
          category_key?: string | null
          created_at?: string
          example_sentence?: string | null
          example_translation?: string | null
          headword?: string
          id?: string
          language?: string
          level?: string | null
          meaning_ja?: string
          part_of_speech?: string | null
          pinyin?: string | null
          reading_zhuyin?: string | null
          silhouette_emoji?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "words_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["key"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      are_mutual_followers: {
        Args: { _a: string; _b: string }
        Returns: boolean
      }
      can_see_post: {
        Args: { _post_id: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
