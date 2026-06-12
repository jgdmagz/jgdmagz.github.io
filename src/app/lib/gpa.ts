import type { CourseRow } from './types';

// US 4.0 unweighted scale with +/- modifiers — mirrors LetterGrade in the
// app's Models.swift (A+ capped at 4.0).
export const LETTER_GRADES = [
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F',
] as const;

const POINTS: Record<string, number> = {
  'A+': 4.0, A: 4.0, 'A-': 3.7,
  'B+': 3.3, B: 3.0, 'B-': 2.7,
  'C+': 2.3, C: 2.0, 'C-': 1.7,
  'D+': 1.3, D: 1.0, 'D-': 0.7,
  F: 0.0,
};

export function gradePoints(grade: string): number | null {
  return Object.prototype.hasOwnProperty.call(POINTS, grade) ? POINTS[grade] : null;
}

export function countsTowardGPA(course: CourseRow): boolean {
  return gradePoints(course.grade) !== null && course.credits > 0;
}

/**
 * Credit-weighted cumulative GPA — mirrors StudyStore.cumulativeGPA:
 * skips any course whose name contains "work" plus ungraded / zero-credit
 * courses. Returns null until at least one course is graded.
 */
export function cumulativeGPA(courses: CourseRow[]): number | null {
  const graded = courses.filter(
    (c) => !c.name.toLowerCase().includes('work') && countsTowardGPA(c)
  );
  const totalCredits = graded.reduce((sum, c) => sum + c.credits, 0);
  if (totalCredits <= 0) return null;
  const totalPoints = graded.reduce(
    (sum, c) => sum + (gradePoints(c.grade) ?? 0) * c.credits,
    0
  );
  return totalPoints / totalCredits;
}

export function formatGPA(gpa: number | null): string {
  return gpa === null ? '—' : gpa.toFixed(2);
}
