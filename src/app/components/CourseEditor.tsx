import { useState } from 'react';
import { newId, useStore } from '../lib/store';
import { COURSE_COLORS, type ClassMeeting, type CourseRow, type GradeWeight } from '../lib/types';
import { LETTER_GRADES } from '../lib/gpa';
import { Icon, Modal } from './ui';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // index 0=Sun → weekday raw = i+1

function newMeeting(): ClassMeeting {
  return { days: [2, 4], startHour: 9, startMinute: 0, endHour: 10, endMinute: 15, location: '' };
}

function toTimeStr(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function CourseEditor({
  course,
  onClose,
}: {
  course?: CourseRow;
  onClose: () => void;
}) {
  const { user, profile, upsertCourse } = useStore();
  const isNew = !course;

  const [name, setName] = useState(course?.name ?? '');
  const [color, setColor] = useState(course?.color_hex ?? COURSE_COLORS[0]);
  const [term, setTerm] = useState(course?.term ?? profile?.term_label ?? '');
  const [credits, setCredits] = useState(course?.credits ?? 3);
  const [grade, setGrade] = useState(course?.grade ?? '');
  const [instructor, setInstructor] = useState(course?.instructor ?? '');
  const [email, setEmail] = useState(course?.instructor_email ?? '');
  const [meetings, setMeetings] = useState<ClassMeeting[]>(course?.class_meetings ?? []);
  const [weights, setWeights] = useState<GradeWeight[]>(course?.grade_weights ?? []);
  const [syllabus, setSyllabus] = useState(course?.syllabus_text ?? '');

  const weightTotal = weights.reduce((s, w) => s + (Number(w.weight) || 0), 0);

  const patchMeeting = (i: number, patch: Partial<ClassMeeting>) =>
    setMeetings((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const patchWeight = (i: number, patch: Partial<GradeWeight>) =>
    setWeights((prev) => prev.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  const save = async () => {
    if (!user) return;
    const row: CourseRow = {
      id: course?.id ?? newId(),
      user_id: user.id,
      name: name.trim() || 'Untitled course',
      color_hex: color,
      is_pinned: course?.is_pinned ?? false,
      class_meetings: meetings.filter((m) => m.days.length > 0),
      syllabus_text: syllabus,
      instructor: instructor.trim(),
      instructor_email: email.trim(),
      term: term.trim(),
      credits: Number(credits) || 0,
      grade,
      grade_weights: weights.filter((w) => w.name.trim() !== ''),
      is_archived: course?.is_archived ?? false,
      archived_at: course?.archived_at ?? null,
    };
    await upsertCourse(row);
    onClose();
  };

  return (
    <Modal onClose={onClose} title={isNew ? 'New course' : 'Edit course'} wide>
      <div className="sheet-grid">
        <input
          className="sheet-input sheet-title-input"
          placeholder="Course name — e.g. Calculus III"
          value={name}
          autoFocus={isNew}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="swatches" role="radiogroup" aria-label="Course color">
          {COURSE_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              className={`swatch${color === c ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <div className="field-pair">
          <div className="field-row">
            <label className="mini-label" htmlFor="cr-term">Term</label>
            <input
              id="cr-term"
              className="sheet-input"
              placeholder="e.g. Fall 2026"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="field-row">
            <label className="mini-label" htmlFor="cr-credits">Credits</label>
            <input
              id="cr-credits"
              className="sheet-input"
              type="number"
              min="0"
              max="12"
              step="0.5"
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
            />
          </div>
          <div className="field-row">
            <label className="mini-label" htmlFor="cr-grade">Grade</label>
            <select
              id="cr-grade"
              className="sheet-input"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">In progress</option>
              {LETTER_GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-pair">
          <div className="field-row">
            <label className="mini-label" htmlFor="cr-inst">Instructor</label>
            <input
              id="cr-inst"
              className="sheet-input"
              placeholder="Professor name"
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
            />
          </div>
          <div className="field-row">
            <label className="mini-label" htmlFor="cr-mail">Instructor email</label>
            <input
              id="cr-mail"
              className="sheet-input"
              type="email"
              placeholder="name@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        {/* Class meetings */}
        <div className="editor-section">
          <div className="editor-section-head">
            <span className="mini-label">Class meetings</span>
            <button className="btn-quiet btn-xs" onClick={() => setMeetings((m) => [...m, newMeeting()])}>
              <Icon name="plus" size={13} /> Add meeting
            </button>
          </div>
          {meetings.length === 0 && <div className="editor-hint">No scheduled meetings yet.</div>}
          {meetings.map((m, i) => (
            <div className="meeting-row" key={i}>
              <div className="day-chips">
                {DAY_LETTERS.map((letter, d) => {
                  const raw = d + 1;
                  const on = m.days.includes(raw);
                  return (
                    <button
                      key={d}
                      className={`day-chip${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() =>
                        patchMeeting(i, {
                          days: on ? m.days.filter((x) => x !== raw) : [...m.days, raw],
                        })
                      }
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              <div className="meeting-times">
                <input
                  type="time"
                  className="sheet-input"
                  value={toTimeStr(m.startHour, m.startMinute)}
                  onChange={(e) => {
                    const [h, min] = e.target.value.split(':').map(Number);
                    if (Number.isFinite(h)) patchMeeting(i, { startHour: h, startMinute: min || 0 });
                  }}
                />
                –
                <input
                  type="time"
                  className="sheet-input"
                  value={toTimeStr(m.endHour, m.endMinute)}
                  onChange={(e) => {
                    const [h, min] = e.target.value.split(':').map(Number);
                    if (Number.isFinite(h)) patchMeeting(i, { endHour: h, endMinute: min || 0 });
                  }}
                />
                <input
                  className="sheet-input meeting-loc"
                  placeholder="Room"
                  value={m.location ?? ''}
                  onChange={(e) => patchMeeting(i, { location: e.target.value })}
                />
                <button
                  className="icon-btn danger"
                  onClick={() => setMeetings((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Remove meeting"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Grade breakdown */}
        <div className="editor-section">
          <div className="editor-section-head">
            <span className="mini-label">Grade breakdown</span>
            <span className={`weight-total${weightTotal === 100 ? ' ok' : ''}`}>{weightTotal}%</span>
            <button
              className="btn-quiet btn-xs"
              onClick={() => setWeights((w) => [...w, { name: '', weight: 0 }])}
            >
              <Icon name="plus" size={13} /> Add category
            </button>
          </div>
          {weights.length === 0 && (
            <div className="editor-hint">e.g. Exams 40% · Homework 30% · Final 30%</div>
          )}
          {weights.map((w, i) => (
            <div className="weight-row" key={i}>
              <input
                className="sheet-input"
                placeholder="Category"
                value={w.name}
                onChange={(e) => patchWeight(i, { name: e.target.value })}
              />
              <input
                className="sheet-input weight-pct"
                type="number"
                min="0"
                max="100"
                value={w.weight}
                onChange={(e) => patchWeight(i, { weight: Number(e.target.value) })}
              />
              <span className="weight-sign">%</span>
              <button
                className="icon-btn danger"
                onClick={() => setWeights((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Remove category"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="field-row">
          <label className="mini-label" htmlFor="cr-syl">About / syllabus notes</label>
          <textarea
            id="cr-syl"
            className="sheet-input sheet-notes"
            placeholder="Anything worth remembering about this course…"
            value={syllabus}
            onChange={(e) => setSyllabus(e.target.value)}
          />
        </div>

        <div className="sheet-actions">
          <span className="sheet-spacer" />
          <button className="btn btn-sm" onClick={save}>
            {isNew ? 'Add course' : 'Save course'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
