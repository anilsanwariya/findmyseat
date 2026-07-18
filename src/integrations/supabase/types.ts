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
      allocations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          library_id: string
          monthly_fee: number
          next_due_date: string | null
          org_id: string
          reservation_type: Database["public"]["Enums"]["reservation_type"]
          seat_id: string | null
          shift_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["allocation_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          library_id: string
          monthly_fee: number
          next_due_date?: string | null
          org_id: string
          reservation_type?: Database["public"]["Enums"]["reservation_type"]
          seat_id?: string | null
          shift_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["allocation_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          library_id?: string
          monthly_fee?: number
          next_due_date?: string | null
          org_id?: string
          reservation_type?: Database["public"]["Enums"]["reservation_type"]
          seat_id?: string | null
          shift_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["allocation_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_promotions: {
        Row: {
          created_at: string
          daily_bid_amount: number
          ends_on: string | null
          id: string
          is_active: boolean
          library_id: string
          org_id: string
          starts_on: string
          target_zone: string
        }
        Insert: {
          created_at?: string
          daily_bid_amount: number
          ends_on?: string | null
          id?: string
          is_active?: boolean
          library_id: string
          org_id: string
          starts_on?: string
          target_zone: string
        }
        Update: {
          created_at?: string
          daily_bid_amount?: number
          ends_on?: string | null
          id?: string
          is_active?: boolean
          library_id?: string
          org_id?: string
          starts_on?: string
          target_zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "bidding_promotions_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidding_promotions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_coupons: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          discount_pct: number
          discount_type: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value: number | null
          id: string
          is_active: boolean
          max_uses: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          discount_pct: number
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value?: number | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          discount_pct?: number
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value?: number | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      email_verification_otps: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_code: string
          student_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          otp_code: string
          student_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_code?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_verification_otps_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      expenditures: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          library_id: string | null
          org_id: string
          spent_on: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          library_id?: string | null
          org_id: string
          spent_on?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          library_id?: string | null
          org_id?: string
          spent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenditures_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenditures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_objects: {
        Row: {
          column_position: number
          created_at: string
          id: string
          object_type: string
          org_id: string
          row_position: number
          section_id: string
        }
        Insert: {
          column_position: number
          created_at?: string
          id?: string
          object_type: string
          org_id: string
          row_position: number
          section_id: string
        }
        Update: {
          column_position?: number
          created_at?: string
          id?: string
          object_type?: string
          org_id?: string
          row_position?: number
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "layout_objects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_objects_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      libraries: {
        Row: {
          address: string | null
          amenities: Json
          approval_status: Database["public"]["Enums"]["library_approval_status"]
          city: string | null
          closed_on: string | null
          contact_phone: string | null
          cover_photo_url: string | null
          created_at: string
          description: string | null
          google_maps_url: string | null
          id: string
          is_active: boolean
          latitude: number | null
          location_place_id: string | null
          longitude: number | null
          name: string
          opening_hours: string | null
          org_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shifts: string | null
          show_public_availability: boolean
          targeted_exam_ids: string[]
          updated_at: string
          zone_area: string | null
        }
        Insert: {
          address?: string | null
          amenities?: Json
          approval_status?: Database["public"]["Enums"]["library_approval_status"]
          city?: string | null
          closed_on?: string | null
          contact_phone?: string | null
          cover_photo_url?: string | null
          created_at?: string
          description?: string | null
          google_maps_url?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          location_place_id?: string | null
          longitude?: number | null
          name: string
          opening_hours?: string | null
          org_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shifts?: string | null
          show_public_availability?: boolean
          targeted_exam_ids?: string[]
          updated_at?: string
          zone_area?: string | null
        }
        Update: {
          address?: string | null
          amenities?: Json
          approval_status?: Database["public"]["Enums"]["library_approval_status"]
          city?: string | null
          closed_on?: string | null
          contact_phone?: string | null
          cover_photo_url?: string | null
          created_at?: string
          description?: string | null
          google_maps_url?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          location_place_id?: string | null
          longitude?: number | null
          name?: string
          opening_hours?: string | null
          org_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shifts?: string | null
          show_public_availability?: boolean
          targeted_exam_ids?: string[]
          updated_at?: string
          zone_area?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "libraries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      library_change_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          field: string | null
          id: string
          library_id: string
          new_value: string | null
          note: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          field?: string | null
          id?: string
          library_id: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          field?: string | null
          id?: string
          library_id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_change_log_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
        ]
      }
      library_photos: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          library_id: string
          section_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          library_id: string
          section_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          library_id?: string
          section_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_photos_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
        ]
      }
      library_ratings: {
        Row: {
          created_at: string
          id: string
          is_anonymous: boolean
          library_id: string
          overall_rating: number
          param_amenities: number
          param_comfort: number
          param_hygiene: number
          param_internet: number
          param_peace: number
          review_text: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_anonymous?: boolean
          library_id: string
          overall_rating: number
          param_amenities: number
          param_comfort: number
          param_hygiene: number
          param_internet: number
          param_peace: number
          review_text?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_anonymous?: boolean
          library_id?: string
          overall_rating?: number
          param_amenities?: number
          param_comfort?: number
          param_hygiene?: number
          param_internet?: number
          param_peace?: number
          review_text?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_ratings_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_ratings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      master_exams: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          content: string
          created_at: string
          ends_on: string | null
          id: string
          library_id: string | null
          org_id: string
          starts_on: string | null
          title: string
          type: Database["public"]["Enums"]["notice_type"]
        }
        Insert: {
          content: string
          created_at?: string
          ends_on?: string | null
          id?: string
          library_id?: string | null
          org_id: string
          starts_on?: string | null
          title: string
          type?: Database["public"]["Enums"]["notice_type"]
        }
        Update: {
          content?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          library_id?: string | null
          org_id?: string
          starts_on?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notice_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notices_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          company_name: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          next_billing_date: string | null
          owner_name: string
          owner_user_id: string | null
          subscription_plan: Database["public"]["Enums"]["subscription_plan"]
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          next_billing_date?: string | null
          owner_name: string
          owner_user_id?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          next_billing_date?: string | null
          owner_name?: string
          owner_user_id?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      owner_subscriptions: {
        Row: {
          billing_cycle: string
          cancel_at_period_end: boolean
          coupon_id: string | null
          created_at: string
          current_period_end: string | null
          id: string
          org_id: string
          plan_id: string
          razorpay_customer_id: string | null
          razorpay_subscription_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          cancel_at_period_end?: boolean
          coupon_id?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          org_id: string
          plan_id: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          cancel_at_period_end?: boolean
          coupon_id?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          org_id?: string
          plan_id?: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_subscriptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "discount_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          allocation_id: string | null
          amount_paid: number
          collected_by_staff_id: string | null
          covers_until: string | null
          created_at: string
          created_by: string | null
          id: string
          library_id: string | null
          logged_at: string
          method: Database["public"]["Enums"]["payment_method"]
          org_id: string
          payment_date: string
          receipt_url: string | null
          reference_note: string | null
          student_id: string
          transaction_reference: string | null
        }
        Insert: {
          allocation_id?: string | null
          amount_paid: number
          collected_by_staff_id?: string | null
          covers_until?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          library_id?: string | null
          logged_at?: string
          method?: Database["public"]["Enums"]["payment_method"]
          org_id: string
          payment_date?: string
          receipt_url?: string | null
          reference_note?: string | null
          student_id: string
          transaction_reference?: string | null
        }
        Update: {
          allocation_id?: string | null
          amount_paid?: number
          collected_by_staff_id?: string | null
          covers_until?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          library_id?: string | null
          logged_at?: string
          method?: Database["public"]["Enums"]["payment_method"]
          org_id?: string
          payment_date?: string
          receipt_url?: string | null
          reference_note?: string | null
          student_id?: string
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_collected_by_staff_id_fkey"
            columns: ["collected_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_reset_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          student_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          student_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_reset_otps_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          library_id: string
          message: string | null
          mobile_number: string
          org_id: string
          status: Database["public"]["Enums"]["lead_status"]
          student_name: string
          target_exam_id: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          library_id: string
          message?: string | null
          mobile_number: string
          org_id: string
          status?: Database["public"]["Enums"]["lead_status"]
          student_name: string
          target_exam_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          library_id?: string
          message?: string | null
          mobile_number?: string
          org_id?: string
          status?: Database["public"]["Enums"]["lead_status"]
          student_name?: string
          target_exam_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_requests_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_requests_target_exam_id_fkey"
            columns: ["target_exam_id"]
            isOneToOne: false
            referencedRelation: "master_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          column_position: number
          created_at: string
          facing_direction: Database["public"]["Enums"]["facing_direction"]
          id: string
          is_active: boolean
          is_corner: boolean
          library_id: string
          org_id: string
          row_position: number
          seat_number: string
          section_id: string
        }
        Insert: {
          column_position: number
          created_at?: string
          facing_direction?: Database["public"]["Enums"]["facing_direction"]
          id?: string
          is_active?: boolean
          is_corner?: boolean
          library_id: string
          org_id: string
          row_position: number
          seat_number: string
          section_id: string
        }
        Update: {
          column_position?: number
          created_at?: string
          facing_direction?: Database["public"]["Enums"]["facing_direction"]
          id?: string
          is_active?: boolean
          is_corner?: boolean
          library_id?: string
          org_id?: string
          row_position?: number
          seat_number?: string
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seats_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          grid_cols: number
          grid_rows: number
          has_shifts: boolean
          id: string
          is_premium_section: boolean
          is_reserved_only: boolean
          library_id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grid_cols?: number
          grid_rows?: number
          has_shifts?: boolean
          id?: string
          is_premium_section?: boolean
          is_reserved_only?: boolean
          library_id: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grid_cols?: number
          grid_rows?: number
          has_shifts?: boolean
          id?: string
          is_premium_section?: boolean
          is_reserved_only?: boolean
          library_id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          base_fee: number | null
          created_at: string
          end_time: string | null
          id: string
          library_id: string
          name: string
          org_id: string
          section_id: string | null
          start_time: string | null
        }
        Insert: {
          base_fee?: number | null
          created_at?: string
          end_time?: string | null
          id?: string
          library_id: string
          name: string
          org_id: string
          section_id?: string | null
          start_time?: string | null
        }
        Update: {
          base_fee?: number | null
          created_at?: string
          end_time?: string | null
          id?: string
          library_id?: string
          name?: string
          org_id?: string
          section_id?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_branch_assignments: {
        Row: {
          created_at: string
          id: string
          library_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          library_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          library_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_assignments_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_branch_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string
          email: string
          employee_id: string
          full_name: string
          id: string
          is_active: boolean
          org_id: string
          permissions: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          employee_id: string
          full_name: string
          id?: string
          is_active?: boolean
          org_id: string
          permissions?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          employee_id?: string
          full_name?: string
          id?: string
          is_active?: boolean
          org_id?: string
          permissions?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          created_at: string
          dob: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          library_id: string | null
          mobile_number: string
          notes: string | null
          org_id: string
          photo_url: string | null
          requires_pin_change: boolean
          target_exam_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          dob: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          library_id?: string | null
          mobile_number: string
          notes?: string | null
          org_id: string
          photo_url?: string | null
          requires_pin_change?: boolean
          target_exam_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          dob?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          library_id?: string | null
          mobile_number?: string
          notes?: string | null
          org_id?: string
          photo_url?: string | null
          requires_pin_change?: boolean
          target_exam_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_target_exam_id_fkey"
            columns: ["target_exam_id"]
            isOneToOne: false
            referencedRelation: "master_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          org_id: string
          paid_at: string | null
          razorpay_invoice_id: string | null
          razorpay_payment_id: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          org_id: string
          paid_at?: string | null
          razorpay_invoice_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          org_id?: string
          paid_at?: string | null
          razorpay_invoice_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "owner_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          annual_price: number
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_branches: number | null
          monthly_price: number
          name: string
          plan_code: string | null
          price: number
          updated_at: string
        }
        Insert: {
          annual_price?: number
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_branches?: number | null
          monthly_price?: number
          name: string
          plan_code?: string | null
          price?: number
          updated_at?: string
        }
        Update: {
          annual_price?: number
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_branches?: number | null
          monthly_price?: number
          name?: string
          plan_code?: string | null
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          admin_response: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          description: string
          id: string
          library_id: string | null
          org_id: string
          status: Database["public"]["Enums"]["ticket_status"]
          student_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          admin_response?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description: string
          id?: string
          library_id?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["ticket_status"]
          student_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          admin_response?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description?: string
          id?: string
          library_id?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          student_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "libraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_owner_organization: {
        Args: {
          _company_name: string
          _contact_email: string
          _contact_phone: string
          _owner_name: string
        }
        Returns: string
      }
      current_user_org: { Args: never; Returns: string }
      get_current_staff: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          library_ids: string[]
          org_id: string
          permissions: Json
        }[]
      }
      get_library_rating_summary: {
        Args: { _library_id: string }
        Returns: {
          avg_amenities: number
          avg_comfort: number
          avg_hygiene: number
          avg_internet: number
          avg_overall: number
          avg_peace: number
          total_reviews: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_library_publicly_visible: {
        Args: { _library_id: string }
        Returns: boolean
      }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      org_subscription_state: { Args: { _org_id: string }; Returns: string }
    }
    Enums: {
      allocation_status: "paid" | "overdue" | "pending"
      app_role: "super_admin" | "org_admin" | "student"
      coupon_discount_type: "percentage" | "flat"
      facing_direction: "north" | "south" | "east" | "west"
      lead_status: "pending" | "contacted" | "converted" | "lost"
      library_approval_status: "pending" | "approved" | "rejected"
      notice_type: "announcement" | "holiday"
      payment_method: "upi" | "cash" | "card" | "bank_transfer"
      reservation_type: "reserved" | "unreserved"
      subscription_plan: "single_branch" | "multi_branch"
      subscription_status: "active" | "suspended" | "trial"
      ticket_category: "complaint" | "lost_and_found" | "suggestion"
      ticket_status: "open" | "in_progress" | "resolved"
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
    Enums: {
      allocation_status: ["paid", "overdue", "pending"],
      app_role: ["super_admin", "org_admin", "student"],
      coupon_discount_type: ["percentage", "flat"],
      facing_direction: ["north", "south", "east", "west"],
      lead_status: ["pending", "contacted", "converted", "lost"],
      library_approval_status: ["pending", "approved", "rejected"],
      notice_type: ["announcement", "holiday"],
      payment_method: ["upi", "cash", "card", "bank_transfer"],
      reservation_type: ["reserved", "unreserved"],
      subscription_plan: ["single_branch", "multi_branch"],
      subscription_status: ["active", "suspended", "trial"],
      ticket_category: ["complaint", "lost_and_found", "suggestion"],
      ticket_status: ["open", "in_progress", "resolved"],
    },
  },
} as const
