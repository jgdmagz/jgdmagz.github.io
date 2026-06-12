// Row types for the StudentFlow Supabase schema (supabase/002_app_data.sql in
// the app repo). Shapes mirror the iOS app's Models.swift 1:1 so a future
// app-side sync maps cleanly.

export interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  school: string | null;
  degree: string | null;
  term_label: string | null;
  term_system: string | null; // "semester" | "quarter" | "trimester"
  term_start: string | null; // "yyyy-MM-dd"
  term_weeks: number | null;
}

/** Recurring weekly class session. `days` uses the app's Weekday raw values: 1=Sun … 7=Sat. */
export interface ClassMeeting {
  days: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  location?: string;
}

export interface GradeWeight {
  name: string;
  weight: number; // 0…100
}

export interface CourseRow {
  id: string;
  user_id: string;
  name: string;
  color_hex: string;
  is_pinned: boolean;
  class_meetings: ClassMeeting[];
  syllabus_text: string;
  instructor: string;
  instructor_email: string;
  term: string;
  credits: number;
  grade: string; // LetterGrade rawValue ("A", "B+", …) or ""
  grade_weights: GradeWeight[];
  is_archived: boolean;
  archived_at: string | null;
}

export interface AssignmentRow {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  due_at: string;
  difficulty: number; // 1 easy · 2 medium · 3 hard
  estimated_minutes: number;
  is_completed: boolean;
  entry_type: string; // "reminder" | "event"
}

export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom' | 'monthly';

export interface TimeBlockRow {
  id: string;
  user_id: string;
  title: string;
  start_at: string;
  end_at: string;
  color_hex: string;
  notes: string;
  location: string;
  location_lat: number | null;
  location_lng: number | null;
  travel_time: number;
  estimated_travel_minutes: number | null;
  repeat_rule: RepeatRule;
  repeat_weekdays: number[];
  alert: number;
  course_id: string | null;
  is_all_day: boolean;
  completed_occurrences: string[];
}

/* ── Palettes (ported from the app) ─────────────────────────────── */

/** Course identity colors — AddCourseView's colorOptions. */
export const COURSE_COLORS = [
  '#595BCD', // flow indigo
  '#71BF9D', // mint
  '#EF8E8E', // coral
  '#F6BE73', // amber
  '#B79EF2', // lavender
  '#F24D99', // pink
  '#1AB3D9', // cyan
  '#4DBFA6', // teal
];

/** Event colors — EventDetailSheet's colorSwatches. */
export const EVENT_COLORS = [
  '#595BCD', // indigo
  '#2EADC7', // cyan
  '#945CEB', // purple
  '#F666B3', // magenta
  '#33B87A', // green
  '#FA8F33', // orange
  '#EF8E8E', // coral
  '#39388F', // deep blue
];

export const DEFAULT_DAY_START_HOUR = 8;
export const DEFAULT_DAY_END_HOUR = 22;
