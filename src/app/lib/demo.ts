import type { User } from '@supabase/supabase-js';
import type { AssignmentRow, CourseRow, ProfileRow, TimeBlockRow } from './types';
import { appWeekday } from './time';

/* Fixture data for /app/preview — a believable student day built around
   "now" so the Wave Timeline always shows a live NOW card. Local-only:
   demo mode never touches Supabase. */

const UID = 'demo-user';

function at(day: Date, h: number, m = 0): Date {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

function iso(d: Date): string {
  return d.toISOString();
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export interface DemoData {
  user: User;
  profile: ProfileRow;
  courses: CourseRow[];
  assignments: AssignmentRow[];
  blocks: TimeBlockRow[];
}

export function demoData(): DemoData {
  const now = new Date();
  const today = new Date(now);
  const wd = appWeekday(now); // 1=Sun … 7=Sat
  const wdTomorrow = (wd % 7) + 1;
  const termStart = new Date(now);
  termStart.setDate(termStart.getDate() - 4 * 7);

  const user = {
    id: UID,
    email: 'alex@demo.studentflow.app',
    created_at: new Date(now.getFullYear(), now.getMonth() - 2, 4).toISOString(),
  } as User;

  const profile: ProfileRow = {
    id: UID,
    display_name: 'Alex Rivera',
    avatar_url: null,
    school: 'UC Berkeley',
    degree: 'B.S. Computer Science',
    term_label: 'Summer 2026',
    term_system: 'semester',
    term_start: isoDate(termStart),
    term_weeks: 12,
  };

  const courses: CourseRow[] = [
    {
      id: 'demo-course-ds',
      user_id: UID,
      name: 'Data Structures',
      color_hex: '#595BCD',
      is_pinned: true,
      class_meetings: [
        { days: [wd, wdTomorrow], startHour: 9, startMinute: 30, endHour: 10, endMinute: 45, location: 'Soda 306' },
      ],
      syllabus_text: 'Lists, trees, graphs and the art of not writing O(n³) by accident.',
      instructor: 'Prof. Okafor',
      instructor_email: 'okafor@demo.edu',
      term: 'Summer 2026',
      credits: 4,
      grade: 'A-',
      grade_weights: [
        { name: 'Projects', weight: 40 },
        { name: 'Midterms', weight: 35 },
        { name: 'Final', weight: 25 },
      ],
      is_archived: false,
      archived_at: null,
    },
    {
      id: 'demo-course-lin',
      user_id: UID,
      name: 'Linear Algebra',
      color_hex: '#71BF9D',
      is_pinned: false,
      class_meetings: [
        { days: [wd], startHour: 13, startMinute: 0, endHour: 14, endMinute: 15, location: 'Evans 10' },
      ],
      syllabus_text: '',
      instructor: 'Dr. Lin',
      instructor_email: '',
      term: 'Summer 2026',
      credits: 3,
      grade: 'B+',
      grade_weights: [
        { name: 'Homework', weight: 30 },
        { name: 'Quizzes', weight: 30 },
        { name: 'Final', weight: 40 },
      ],
      is_archived: false,
      archived_at: null,
    },
    {
      id: 'demo-course-phys',
      user_id: UID,
      name: 'Modern Physics',
      color_hex: '#F6BE73',
      is_pinned: false,
      class_meetings: [
        { days: [wdTomorrow], startHour: 11, startMinute: 0, endHour: 12, endMinute: 15, location: 'LeConte 1' },
      ],
      syllabus_text: '',
      instructor: 'Prof. Iqbal',
      instructor_email: '',
      term: 'Summer 2026',
      credits: 3,
      grade: '',
      grade_weights: [],
      is_archived: false,
      archived_at: null,
    },
    {
      id: 'demo-course-design',
      user_id: UID,
      name: 'Design Studio',
      color_hex: '#B79EF2',
      is_pinned: false,
      class_meetings: [],
      syllabus_text: '',
      instructor: '',
      instructor_email: '',
      term: 'Summer 2026',
      credits: 2,
      grade: 'A',
      grade_weights: [],
      is_archived: false,
      archived_at: null,
    },
  ];

  const assignments: AssignmentRow[] = [
    {
      id: 'demo-a1',
      user_id: UID,
      course_id: 'demo-course-ds',
      title: 'Problem set 6 — heaps',
      due_at: iso(at(today, 23, 59)),
      difficulty: 3,
      estimated_minutes: 90,
      is_completed: false,
      entry_type: 'reminder',
    },
    {
      id: 'demo-a2',
      user_id: UID,
      course_id: 'demo-course-lin',
      title: 'Quiz 4 prep — eigenvalues',
      due_at: iso(at(new Date(now.getTime() + 2 * 86400000), 9, 0)),
      difficulty: 2,
      estimated_minutes: 45,
      is_completed: false,
      entry_type: 'reminder',
    },
    {
      id: 'demo-a3',
      user_id: UID,
      course_id: 'demo-course-phys',
      title: 'Lab write-up — photoelectric effect',
      due_at: iso(at(new Date(now.getTime() + 5 * 86400000), 17, 0)),
      difficulty: 2,
      estimated_minutes: 60,
      is_completed: false,
      entry_type: 'reminder',
    },
    {
      id: 'demo-a4',
      user_id: UID,
      course_id: 'demo-course-design',
      title: 'Moodboard v2',
      due_at: iso(at(new Date(now.getTime() - 86400000), 12, 0)),
      difficulty: 1,
      estimated_minutes: 30,
      is_completed: true,
      entry_type: 'reminder',
    },
  ];

  const blocks: TimeBlockRow[] = [
    {
      id: 'demo-b-now',
      user_id: UID,
      title: 'Deep work · heaps PS6',
      start_at: iso(new Date(now.getTime() - 40 * 60000)),
      end_at: iso(new Date(now.getTime() + 50 * 60000)),
      color_hex: '#595BCD',
      notes: 'Finish the d-ary heap proofs first.',
      location: 'Main Stacks',
      location_lat: null,
      location_lng: null,
      travel_time: -2,
      estimated_travel_minutes: null,
      repeat_rule: 'none',
      repeat_weekdays: [],
      alert: -1,
      course_id: 'demo-course-ds',
      is_all_day: false,
      completed_occurrences: [],
    },
    {
      id: 'demo-b-evening',
      user_id: UID,
      title: 'Study group',
      start_at: iso(at(today, 19, 0)),
      end_at: iso(at(today, 20, 30)),
      color_hex: '#33B87A',
      notes: '',
      location: 'Moffitt 4th floor',
      location_lat: null,
      location_lng: null,
      travel_time: -2,
      estimated_travel_minutes: null,
      repeat_rule: 'none',
      repeat_weekdays: [],
      alert: 15,
      course_id: 'demo-course-lin',
      is_all_day: false,
      completed_occurrences: [],
    },
    {
      id: 'demo-b-gym',
      user_id: UID,
      title: 'Morning run',
      start_at: iso(at(new Date(now.getTime() - 7 * 86400000), 7, 30)),
      end_at: iso(at(new Date(now.getTime() - 7 * 86400000), 8, 15)),
      color_hex: '#2EADC7',
      notes: '',
      location: '',
      location_lat: null,
      location_lng: null,
      travel_time: -2,
      estimated_travel_minutes: null,
      repeat_rule: 'weekdays',
      repeat_weekdays: [],
      alert: -1,
      course_id: null,
      is_all_day: false,
      completed_occurrences: [],
    },
  ];

  return { user, profile, courses, assignments, blocks };
}
