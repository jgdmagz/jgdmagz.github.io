import { useEffect, useMemo, useState } from 'react';
import { useStore, useToasts } from '../lib/store';
import type { AssignmentRow, CourseRow } from '../lib/types';
import { cumulativeGPA, formatGPA, gradePoints } from '../lib/gpa';
import { dueLabel, meetingLabel } from '../lib/time';
import { CourseEditor } from '../components/CourseEditor';
import { AssignmentSheet } from '../components/AssignmentSheet';
import { EmptyState, Icon, Modal, ProgressRing } from '../components/ui';

function courseProgress(course: CourseRow, assignments: AssignmentRow[]): { done: number; total: number } {
  const list = assignments.filter((a) => a.course_id === course.id);
  return { done: list.filter((a) => a.is_completed).length, total: list.length };
}

function nextDue(course: CourseRow, assignments: AssignmentRow[]): AssignmentRow | null {
  const upcoming = assignments
    .filter((a) => a.course_id === course.id && !a.is_completed)
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  return upcoming[0] ?? null;
}

export function CoursesView() {
  const { courses, assignments, profile, deleteCourse } = useStore();
  const { push } = useToasts();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ course?: CourseRow } | null>(null);
  const [taskSheet, setTaskSheet] = useState<{ assignment?: AssignmentRow; courseId?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CourseRow | null>(null);

  // Deep links: ?course=<id> on load, or a handoff from another view.
  useEffect(() => {
    const handoff = sessionStorage.getItem('sf.openCourse');
    if (handoff) {
      sessionStorage.removeItem('sf.openCourse');
      setSelectedId(handoff);
      return;
    }
    const fromUrl = new URLSearchParams(location.search).get('course');
    if (fromUrl) setSelectedId(fromUrl);
  }, []);

  useEffect(() => {
    const url = new URL(location.href);
    if (selectedId) url.searchParams.set('course', selectedId);
    else url.searchParams.delete('course');
    history.replaceState(history.state, '', url);
  }, [selectedId]);

  const active = useMemo(() => courses.filter((c) => !c.is_archived), [courses]);
  const sorted = useMemo(
    () =>
      [...active].sort(
        (a, b) => Number(b.is_pinned) - Number(a.is_pinned) || a.name.localeCompare(b.name)
      ),
    [active]
  );

  const gpa = useMemo(() => cumulativeGPA(courses), [courses]);
  const totalCredits = active.reduce((s, c) => s + c.credits, 0);
  const dueSoon = assignments.filter((a) => {
    if (a.is_completed) return false;
    const due = new Date(a.due_at).getTime();
    return due > Date.now() - 86400000 && due < Date.now() + 7 * 86400000;
  }).length;

  const selected = courses.find((c) => c.id === selectedId) ?? null;

  if (selected) {
    return (
      <CourseDetail
        course={selected}
        onBack={() => setSelectedId(null)}
        onEdit={() => setEditor({ course: selected })}
        onDelete={() => setConfirmDelete(selected)}
        onAddAssignment={() => setTaskSheet({ courseId: selected.id })}
        onEditAssignment={(assignment) => setTaskSheet({ assignment })}
        editor={editor}
        taskSheet={taskSheet}
        confirmDelete={confirmDelete}
        closeEditor={() => setEditor(null)}
        closeTaskSheet={() => setTaskSheet(null)}
        closeConfirm={() => setConfirmDelete(null)}
        reallyDelete={async (course) => {
          setConfirmDelete(null);
          setSelectedId(null);
          await deleteCourse(course.id);
          push(`Deleted ${course.name}`);
        }}
      />
    );
  }

  return (
    <div className="view courses-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">{profile?.term_label || 'Academic dashboard'}</div>
          <h1 className="view-title">Courses</h1>
        </div>
        <button className="btn btn-sm head-add" onClick={() => setEditor({})}>
          <Icon name="plus" size={15} /> Add course
        </button>
      </header>

      <div className="stats-strip">
        <div className="stat-card glass">
          <ProgressRing size={52} stroke={5} progress={gpa !== null ? gpa / 4 : 0}>
            <span className="stat-ring-label">GPA</span>
          </ProgressRing>
          <div>
            <div className="stat-value">{formatGPA(gpa)}</div>
            <div className="stat-label">Cumulative GPA</div>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-ico"><Icon name="book" size={20} /></div>
          <div>
            <div className="stat-value">{active.length}</div>
            <div className="stat-label">Active courses</div>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-ico"><Icon name="gradcap" size={20} /></div>
          <div>
            <div className="stat-value">{totalCredits % 1 === 0 ? totalCredits : totalCredits.toFixed(1)}</div>
            <div className="stat-label">Credits this term</div>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-ico"><Icon name="clock" size={20} /></div>
          <div>
            <div className="stat-value">{dueSoon}</div>
            <div className="stat-label">Due in 7 days</div>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon="book"
          title="No courses yet"
          sub="Add your classes to track assignments, meetings and your GPA — they'll flow into Today and Calendar automatically."
          action={
            <button className="btn btn-sm" onClick={() => setEditor({})}>
              <Icon name="plus" size={15} /> Add your first course
            </button>
          }
        />
      ) : (
        <div className="course-grid">
          {sorted.map((course) => {
            const progress = courseProgress(course, assignments);
            const next = nextDue(course, assignments);
            return (
              <button key={course.id} className="course-card glass" onClick={() => setSelectedId(course.id)}>
                <span className="course-top" style={{ background: course.color_hex }} />
                <span className="course-head">
                  <span className="course-name">
                    {course.is_pinned && <Icon name="star" size={13} className="course-pin" />}
                    {course.name}
                  </span>
                  {course.grade && gradePoints(course.grade) !== null && (
                    <span className="grade-badge" style={{ background: `${course.color_hex}22`, color: course.color_hex }}>
                      {course.grade}
                    </span>
                  )}
                </span>
                {course.class_meetings.length > 0 && (
                  <span className="course-meet">{meetingLabel(course.class_meetings[0])}</span>
                )}
                <span className="course-foot">
                  <ProgressRing
                    size={34}
                    stroke={4}
                    progress={progress.total > 0 ? progress.done / progress.total : 0}
                    color={course.color_hex}
                    track={`${course.color_hex}22`}
                  >
                    <span className="course-ring-num">{progress.total - progress.done}</span>
                  </ProgressRing>
                  <span className="course-foot-text">
                    {next ? (
                      <>
                        <span className="course-next">{next.title}</span>
                        <span className="course-due">{dueLabel(new Date(next.due_at))}</span>
                      </>
                    ) : (
                      <span className="course-due all-clear">
                        {progress.total > 0 ? 'All caught up' : 'No assignments yet'}
                      </span>
                    )}
                  </span>
                  <span className="course-credits">{course.credits > 0 ? `${course.credits} cr` : ''}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {editor && <CourseEditor course={editor.course} onClose={() => setEditor(null)} />}
      {taskSheet && (
        <AssignmentSheet
          assignment={taskSheet.assignment}
          defaultCourseId={taskSheet.courseId}
          onClose={() => setTaskSheet(null)}
        />
      )}
    </div>
  );
}

/* ── Course detail ──────────────────────────────────────────────── */

function CourseDetail({
  course,
  onBack,
  onEdit,
  onDelete,
  onAddAssignment,
  onEditAssignment,
  editor,
  taskSheet,
  confirmDelete,
  closeEditor,
  closeTaskSheet,
  closeConfirm,
  reallyDelete,
}: {
  course: CourseRow;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddAssignment: () => void;
  onEditAssignment: (a: AssignmentRow) => void;
  editor: { course?: CourseRow } | null;
  taskSheet: { assignment?: AssignmentRow; courseId?: string } | null;
  confirmDelete: CourseRow | null;
  closeEditor: () => void;
  closeTaskSheet: () => void;
  closeConfirm: () => void;
  reallyDelete: (course: CourseRow) => void;
}) {
  const { assignments, toggleAssignment, deleteAssignment, upsertAssignment, upsertCourse } = useStore();
  const { push } = useToasts();
  const [filter, setFilter] = useState<'pending' | 'done' | 'all'>('pending');

  const list = useMemo(() => {
    const all = assignments
      .filter((a) => a.course_id === course.id)
      .sort((a, b) => a.due_at.localeCompare(b.due_at));
    if (filter === 'pending') return all.filter((a) => !a.is_completed);
    if (filter === 'done') return all.filter((a) => a.is_completed);
    return all;
  }, [assignments, course.id, filter]);

  const progress = courseProgress(course, assignments);
  const points = gradePoints(course.grade);

  const removeAssignment = async (a: AssignmentRow) => {
    await deleteAssignment(a.id);
    push('Assignment removed', () => upsertAssignment(a));
  };

  return (
    <div className="view course-detail">
      <div className="detail-bar">
        <button className="icon-btn" onClick={onBack} aria-label="Back to courses">
          <Icon name="chevronLeft" size={18} />
        </button>
        <span className="detail-bar-spacer" />
        <button
          className="icon-btn"
          onClick={() => upsertCourse({ ...course, is_pinned: !course.is_pinned })}
          aria-label={course.is_pinned ? 'Unpin course' : 'Pin course'}
          title={course.is_pinned ? 'Unpin' : 'Pin'}
        >
          <Icon name="star" size={17} className={course.is_pinned ? 'pin-on' : undefined} />
        </button>
        <button className="icon-btn" onClick={onEdit} aria-label="Edit course">
          <Icon name="pencil" size={16} />
        </button>
        <button className="icon-btn danger" onClick={onDelete} aria-label="Delete course">
          <Icon name="trash" size={16} />
        </button>
      </div>

      <section className="detail-hero glass">
        <div className="detail-hero-main">
          <div className="eyebrow" style={{ color: course.color_hex }}>
            <span className="sheet-dot" style={{ background: course.color_hex }} />
            {course.term || 'This term'}
            {course.instructor ? ` · ${course.instructor}` : ''}
          </div>
          <h1 className="detail-title">{course.name}</h1>
          <div className="detail-meets">
            {course.class_meetings.map((m, i) => (
              <span className="meet-chip" key={i}>
                <Icon name="clock" size={12} />
                {meetingLabel(m)}
                {m.location ? ` · ${m.location}` : ''}
              </span>
            ))}
          </div>
          <div className="detail-stats">
            <span><strong>{progress.total - progress.done}</strong> pending</span>
            <span><strong>{progress.done}</strong> done</span>
            <span>
              <strong>{course.credits || '—'}</strong> credits
            </span>
            {points !== null && (
              <span>
                <strong>{course.grade}</strong> · {points.toFixed(1)} pts
              </span>
            )}
          </div>
        </div>
        <ProgressRing
          size={92}
          stroke={8}
          progress={progress.total > 0 ? progress.done / progress.total : 0}
          color={course.color_hex}
          track={`${course.color_hex}22`}
        >
          <span className="detail-ring">
            <strong>{progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%</strong>
          </span>
        </ProgressRing>
      </section>

      <section className="detail-section">
        <div className="detail-section-head">
          <h2 className="section-h">Assignments</h2>
          <div className="segmented small">
            {(['pending', 'done', 'all'] as const).map((f) => (
              <button key={f} className={`segment${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'pending' ? 'Pending' : f === 'done' ? 'Done' : 'All'}
              </button>
            ))}
          </div>
          <button className="btn-quiet btn-xs" onClick={onAddAssignment}>
            <Icon name="plus" size={13} /> Add
          </button>
        </div>

        {list.length === 0 ? (
          <div className="editor-hint pad">
            {filter === 'pending' ? 'Nothing pending — nice.' : 'Nothing here yet.'}
          </div>
        ) : (
          <div className="assign-list">
            {list.map((a) => (
              <div key={a.id} className={`assign-row glass${a.is_completed ? ' done' : ''}`}>
                <button
                  className="assign-check"
                  style={{ borderColor: course.color_hex, background: a.is_completed ? course.color_hex : 'transparent' }}
                  onClick={() => toggleAssignment(a.id)}
                  aria-label={a.is_completed ? 'Mark not done' : 'Mark done'}
                >
                  {a.is_completed && <Icon name="check" size={12} />}
                </button>
                <button className="assign-main" onClick={() => onEditAssignment(a)}>
                  <span className="assign-title">{a.title}</span>
                  <span className="assign-sub">
                    {dueLabel(new Date(a.due_at))} · ~{a.estimated_minutes}m
                  </span>
                </button>
                <span className="assign-diff" title={`Difficulty ${a.difficulty}/3`}>
                  {[1, 2, 3].map((d) => (
                    <i
                      key={d}
                      style={{ background: d <= a.difficulty ? course.color_hex : `${course.color_hex}30` }}
                    />
                  ))}
                </span>
                <button className="icon-btn ghost" onClick={() => removeAssignment(a)} aria-label="Delete assignment">
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {course.grade_weights.length > 0 && (
        <section className="detail-section">
          <div className="detail-section-head">
            <h2 className="section-h">Grade breakdown</h2>
            <button className="btn-quiet btn-xs" onClick={onEdit}>
              <Icon name="pencil" size={13} /> Edit
            </button>
          </div>
          <div className="weights glass">
            {course.grade_weights.map((w, i) => (
              <div className="weight-line" key={i}>
                <span className="weight-name">{w.name}</span>
                <span className="weight-bar">
                  <span style={{ width: `${Math.min(100, w.weight)}%`, background: course.color_hex }} />
                </span>
                <span className="weight-val">{w.weight}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(course.syllabus_text || course.instructor_email) && (
        <section className="detail-section">
          <h2 className="section-h">About</h2>
          <div className="about glass">
            {course.instructor_email && (
              <a className="about-mail" href={`mailto:${course.instructor_email}`}>
                <Icon name="external" size={14} /> {course.instructor_email}
              </a>
            )}
            {course.syllabus_text && <p className="about-text">{course.syllabus_text}</p>}
          </div>
        </section>
      )}

      {editor && <CourseEditor course={editor.course} onClose={closeEditor} />}
      {taskSheet && (
        <AssignmentSheet
          assignment={taskSheet.assignment}
          defaultCourseId={taskSheet.courseId}
          onClose={closeTaskSheet}
        />
      )}
      {confirmDelete && (
        <Modal title="Delete course?" onClose={closeConfirm}>
          <p className="confirm-text">
            <strong>{confirmDelete.name}</strong> and all of its assignments will be permanently
            deleted.
          </p>
          <div className="sheet-actions">
            <button className="btn-quiet" onClick={closeConfirm}>Cancel</button>
            <span className="sheet-spacer" />
            <button className="btn btn-sm btn-danger" onClick={() => reallyDelete(confirmDelete)}>
              Delete course
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
