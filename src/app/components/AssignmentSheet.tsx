import { useState } from 'react';
import { newId, useStore } from '../lib/store';
import type { AssignmentRow } from '../lib/types';
import { Modal } from './ui';

const DIFFICULTIES = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Hard' },
];

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180];

function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function AssignmentSheet({
  assignment,
  defaultCourseId,
  onClose,
}: {
  assignment?: AssignmentRow;
  defaultCourseId?: string;
  onClose: () => void;
}) {
  const { user, courses, upsertAssignment } = useStore();
  const activeCourses = courses.filter((c) => !c.is_archived);
  const isNew = !assignment;

  const defaultDue = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 0, 0);
    return d;
  };

  const [title, setTitle] = useState(assignment?.title ?? '');
  const [courseId, setCourseId] = useState(
    assignment?.course_id ?? defaultCourseId ?? activeCourses[0]?.id ?? ''
  );
  const [dueStr, setDueStr] = useState(
    toLocalDateTimeInput(assignment ? new Date(assignment.due_at) : defaultDue())
  );
  const [difficulty, setDifficulty] = useState(assignment?.difficulty ?? 2);
  const [estimate, setEstimate] = useState(assignment?.estimated_minutes ?? 30);

  const save = async () => {
    if (!user || !courseId) return;
    const row: AssignmentRow = {
      id: assignment?.id ?? newId(),
      user_id: user.id,
      course_id: courseId,
      title: title.trim() || 'Untitled',
      due_at: new Date(dueStr).toISOString(),
      difficulty,
      estimated_minutes: estimate,
      is_completed: assignment?.is_completed ?? false,
      entry_type: assignment?.entry_type ?? 'reminder',
    };
    await upsertAssignment(row);
    onClose();
  };

  return (
    <Modal onClose={onClose} title={isNew ? 'New assignment' : 'Edit assignment'}>
      <div className="sheet-grid">
        <input
          className="sheet-input sheet-title-input"
          placeholder="What's due?"
          value={title}
          autoFocus={isNew}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="field-row">
          <label className="mini-label" htmlFor="as-course">Course</label>
          <select
            id="as-course"
            className="sheet-input"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {activeCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <label className="mini-label" htmlFor="as-due">Due</label>
          <input
            id="as-due"
            type="datetime-local"
            className="sheet-input"
            value={dueStr}
            onChange={(e) => e.target.value && setDueStr(e.target.value)}
          />
        </div>

        <div className="field-row">
          <span className="mini-label">Difficulty</span>
          <div className="segmented" role="radiogroup" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                role="radio"
                aria-checked={difficulty === d.value}
                className={`segment${difficulty === d.value ? ' on' : ''}`}
                onClick={() => setDifficulty(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <label className="mini-label" htmlFor="as-est">Estimated time</label>
          <select
            id="as-est"
            className="sheet-input"
            value={estimate}
            onChange={(e) => setEstimate(Number(e.target.value))}
          >
            {ESTIMATES.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60}h${m % 60 ? ` ${m % 60}m` : ''}`}
              </option>
            ))}
          </select>
        </div>

        <div className="sheet-actions">
          <span className="sheet-spacer" />
          <button className="btn btn-sm" onClick={save} disabled={!courseId}>
            {isNew ? 'Add assignment' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
