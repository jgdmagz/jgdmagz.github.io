import { useEffect, useMemo, useState } from 'react';
import { useStore, useToasts } from '../lib/store';
import type { AssignmentRow, CourseRow } from '../lib/types';
import { cumulativeGPA, formatGPA, gradePoints } from '../lib/gpa';
import { classMeetingsOn, dueLabel, fmtTime, meetingLabel, termInfo, type TermInfo } from '../lib/time';
import { CourseEditor } from '../components/CourseEditor';
import { AssignmentSheet } from '../components/AssignmentSheet';
import { FlowCoin, Icon, Modal, Overlay, ProgressRing } from '../components/ui';

/* Web port of CoursesView.swift: semester hero (term progress line with
   deadline ticks + breathing now marker), PENDING/DONE/GPA metric strip,
   full-width course rows with meta chips, Semester Explore overlay and a
   term setup sheet. */

function courseProgress(course: CourseRow, assignments: AssignmentRow[]): { done: number; total: number } {
  const list = assignments.filter((a) => a.course_id === course.id);
  return { done: list.filter((a) => a.is_completed).length, total: list.length };
}

function pendingCount(course: CourseRow, assignments: AssignmentRow[]): number {
  return assignments.filter((a) => a.course_id === course.id && !a.is_completed).length;
}

/** Next class meeting within 7 days → "Today" / "Tomorrow" / "Mon". */
function nextMeetingLabel(course: CourseRow, now: Date): string | null {
  if (!course.class_meetings.length) return null;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const wd = d.getDay() + 1;
    const hit = course.class_meetings.some((m) => m.days?.includes(wd));
    if (!hit) continue;
    if (i === 0) {
      // Only "Today" if a meeting is still ahead of now.
      const stillAhead = course.class_meetings.some(
        (m) =>
          m.days?.includes(wd) &&
          (m.endHour > now.getHours() || (m.endHour === now.getHours() && m.endMinute > now.getMinutes()))
      );
      if (!stillAhead) continue;
      return 'Today';
    }
    if (i === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return null;
}

function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Term progress line (TermProgressLine) ───────────────────────── */

function TermProgressLine({
  term,
  ticks,
  height = 30,
}: {
  term: TermInfo;
  ticks: { fraction: number; color: string }[];
  height?: number;
}) {
  const p = term.progress;
  return (
    <div className="term-line" style={{ height }}>
      <span className="term-line-track" />
      <span className="term-line-fill" style={{ width: `max(6px, ${p * 100}%)` }} />
      {ticks.map((t, i) => (
        <span
          key={i}
          className="term-tick"
          style={{ left: `clamp(2px, ${t.fraction * 100}%, calc(100% - 2px))`, background: t.color }}
        />
      ))}
      <span className="term-now" style={{ left: `clamp(7px, ${p * 100}%, calc(100% - 7px))` }}>
        <i className="term-now-halo" />
        <i className="term-now-core" />
      </span>
    </div>
  );
}

/* ── Term setup sheet (TermSetupView, condensed) ─────────────────── */

function TermSetupSheet({ onClose }: { onClose: () => void }) {
  const { profile, saveProfile } = useStore();
  const { push } = useToasts();
  const [label, setLabel] = useState(profile?.term_label ?? '');
  const [start, setStart] = useState(profile?.term_start ?? '');
  const [weeks, setWeeks] = useState(profile?.term_weeks ?? 15);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await saveProfile({
      term_label: label || null,
      term_start: start || null,
      term_weeks: weeks,
    });
    setSaving(false);
    if (ok) {
      push('Term updated');
      onClose();
    }
  };

  return (
    <Modal title="Set up your term" onClose={onClose}>
      <div className="term-setup">
        <label className="mini-label">Term</label>
        <input
          className="sheet-input"
          placeholder="e.g. Fall 2026"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className="mini-label">Start date</label>
        <input
          className="sheet-input"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <label className="mini-label">Length</label>
        <div className="term-weeks">
          <button
            className="icon-btn"
            onClick={() => setWeeks(Math.max(4, weeks - 1))}
            aria-label="Fewer weeks"
          >
            <Icon name="minus" size={14} />
          </button>
          <strong>{weeks} weeks</strong>
          <button
            className="icon-btn"
            onClick={() => setWeeks(Math.min(30, weeks + 1))}
            aria-label="More weeks"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
        <p className="editor-hint">Defaults: a semester runs ~15 weeks, a quarter ~10.</p>
        <button className="cta-capsule" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Start exploring'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Semester Explore overlay (SemesterExploreView) ──────────────── */

function SemesterExplore({
  term,
  courses,
  assignments,
  onClose,
  onOpenCourse,
}: {
  term: TermInfo | null;
  courses: CourseRow[];
  assignments: AssignmentRow[];
  onClose: () => void;
  onOpenCourse: (id: string) => void;
}) {
  const now = new Date();
  const gpa = cumulativeGPA(courses);
  const active = courses.filter((c) => !c.is_archived);
  const credits = active.reduce((s, c) => s + c.credits, 0);
  const pending = assignments.filter((a) => !a.is_completed);
  const ahead = pending
    .filter((a) => new Date(a.due_at) >= now)
    .sort((a, b) => a.due_at.localeCompare(b.due_at));

  const ticks = useMemo(() => {
    if (!term) return [];
    const span = term.end.getTime() - term.start.getTime();
    const byId = new Map(courses.map((c) => [c.id, c]));
    return pending
      .map((a) => {
        const due = new Date(a.due_at).getTime();
        return { fraction: (due - term.start.getTime()) / span, color: byId.get(a.course_id)?.color_hex ?? '#595BCD' };
      })
      .filter((t) => t.fraction >= 0 && t.fraction <= 1);
  }, [term, courses, pending]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <Overlay>
    <div className="explore-overlay">
      <div className="explore-inner">
        <header className="explore-head">
          <div>
            <div className="eyebrow eyebrow-muted">
              {term ? `${term.label} · Week ${term.week} of ${term.weeks}` : 'This term'}
            </div>
            <h1 className="explore-title">My Semester</h1>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={17} />
          </button>
        </header>

        {term && (
          <section className="panel glass explore-arc">
            <div className="term-endpoints">
              <span>{fmtMonthDay(term.start)}</span>
              <span>Finals · {fmtMonthDay(term.end)}</span>
            </div>
            <TermProgressLine term={term} ticks={ticks} height={46} />
            <div className="term-caption">
              {Math.round(term.progress * 100)}% through the term ·{' '}
              {ahead.length > 0 ? `${ahead.length} deadline${ahead.length === 1 ? '' : 's'} ahead.` : 'no deadlines ahead.'}
            </div>
          </section>
        )}

        <section className="metric-strip glass">
          {[
            { v: String(active.length), l: 'Courses' },
            { v: credits % 1 === 0 ? String(credits) : credits.toFixed(1), l: 'Credits' },
            { v: formatGPA(gpa), l: 'GPA' },
            { v: String(pending.length), l: 'To do' },
          ].map((m, i) => (
            <div className="metric-cell" key={i}>
              <strong>{m.v}</strong>
              <span>{m.l}</span>
            </div>
          ))}
        </section>

        <section className="explore-section">
          <div className="explore-section-head">
            <span className="eyebrow eyebrow-muted">This term</span>
            <span className="lists-count">{active.length}</span>
          </div>
          {active.map((c) => {
            const prog = courseProgress(c, assignments);
            const pct = prog.total > 0 ? prog.done / prog.total : 0;
            const next = assignments
              .filter((a) => a.course_id === c.id && !a.is_completed)
              .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
            const nextDate = next ? new Date(next.due_at) : null;
            const overdue = nextDate ? nextDate < now : false;
            return (
              <button className="explore-course glass" key={c.id} onClick={() => onOpenCourse(c.id)}>
                <span className="explore-course-bar" style={{ background: c.color_hex }} />
                <span className="explore-course-main">
                  <span className="explore-course-name">
                    {c.name}
                    {c.grade && gradePoints(c.grade) !== null && (
                      <em
                        className="grade-chip"
                        style={{ background: `${c.color_hex}29`, color: c.color_hex }}
                      >
                        {c.grade}
                      </em>
                    )}
                  </span>
                  <span className={`explore-course-sub${overdue ? ' overdue' : ''}`}>
                    {nextDate
                      ? `${overdue ? 'Overdue' : 'Next'} · ${fmtMonthDay(nextDate)}`
                      : 'All caught up'}
                  </span>
                </span>
                <ProgressRing size={42} stroke={5} progress={pct} color={c.color_hex} track="rgba(158,164,179,0.18)">
                  <span className="ring-pct">{Math.round(pct * 100)}</span>
                </ProgressRing>
              </button>
            );
          })}
        </section>

        {ahead.length > 0 && (
          <section className="explore-section">
            <div className="explore-section-head">
              <span className="eyebrow eyebrow-muted">What's ahead</span>
              <span className="lists-count">{Math.min(6, ahead.length)}</span>
            </div>
            {ahead.slice(0, 6).map((a) => {
              const c = courses.find((x) => x.id === a.course_id);
              const due = new Date(a.due_at);
              return (
                <div className="ahead-row" key={a.id}>
                  <span className="ahead-date">
                    <strong>{due.getDate()}</strong>
                    <span>{due.toLocaleDateString('en-US', { month: 'short' })}</span>
                  </span>
                  <span className="ahead-div" style={{ background: c?.color_hex ?? 'var(--accent)' }} />
                  <span className="ahead-main">
                    <span className="ahead-title">{a.title}</span>
                    <span className="ahead-sub">{c?.name ?? ''}</span>
                  </span>
                  <span className="ahead-dot" style={{ background: c?.color_hex ?? 'var(--accent)' }} />
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
    </Overlay>
  );
}

/* ── Courses root ────────────────────────────────────────────────── */

export function CoursesView() {
  const { courses, assignments, profile, deleteCourse } = useStore();
  const { push } = useToasts();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ course?: CourseRow } | null>(null);
  const [taskSheet, setTaskSheet] = useState<{ assignment?: AssignmentRow; courseId?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CourseRow | null>(null);
  const [explore, setExplore] = useState(false);
  const [termSetup, setTermSetup] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

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

  const term = termInfo(profile?.term_label ?? null, profile?.term_start ?? null, profile?.term_weeks ?? null, now);
  const gpa = useMemo(() => cumulativeGPA(courses), [courses]);
  const totalPending = assignments.filter((a) => !a.is_completed).length;
  const overallProgress =
    assignments.length > 0 ? assignments.filter((a) => a.is_completed).length / assignments.length : 0;

  /* Today's class meetings, chronological. */
  const todayClasses = useMemo(() => classMeetingsOn(active, now), [active, now]);
  const weekMeetingCount = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      n += classMeetingsOn(active, d).length;
    }
    return n;
  }, [active, now]);

  const heroTicks = useMemo(() => {
    if (!term) return [];
    const span = term.end.getTime() - term.start.getTime();
    const byId = new Map(courses.map((c) => [c.id, c]));
    return assignments
      .filter((a) => !a.is_completed)
      .map((a) => ({
        fraction: (new Date(a.due_at).getTime() - term.start.getTime()) / span,
        color: byId.get(a.course_id)?.color_hex ?? '#595BCD',
      }))
      .filter((t) => t.fraction >= 0 && t.fraction <= 1);
  }, [term, courses, assignments]);

  const headline =
    todayClasses.length === 0
      ? 'A clear day — no classes scheduled.'
      : todayClasses.length === 1
        ? 'One class today.'
        : `${todayClasses.length} classes today.`;

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

  const visibleClasses = todayClasses.slice(0, 4);
  const classOverflow = todayClasses.length - visibleClasses.length;

  return (
    <div className="view courses-view">
      <header className="home-top">
        <div>
          <div className="eyebrow eyebrow-muted">{active.length} active</div>
          <h1 className="home-greeting">Courses</h1>
        </div>
        <button className="glass-ico" onClick={() => setEditor({})} aria-label="Add course">
          <Icon name="plus" size={14} strokeWidth={2.4} />
        </button>
      </header>

      {sorted.length === 0 ? (
        <div className="courses-empty glass">
          <FlowCoin size={96} animated />
          <div className="courses-empty-title">No courses yet</div>
          <div className="courses-empty-sub">Tap + to add your first course or sync with Canvas</div>
        </div>
      ) : (
        <>
          {/* Semester hero */}
          <section className="hero-card glass">
            <div className="hero-wash" aria-hidden="true" />
            <div className="hero-head">
              <span className="eyebrow eyebrow-muted">
                {term?.label || profile?.term_label || 'My Semester'}
              </span>
              <button className="week-chip" onClick={() => setTermSetup(true)}>
                <Icon name="calendar" size={10} strokeWidth={2.4} className="week-chip-cal" />
                {term ? `Week ${term.week} of ${term.weeks}` : `${weekMeetingCount} this week`}
                <Icon name="dots" size={9} className="week-chip-sliders" />
              </button>
            </div>
            <h2 className="hero-headline">{headline}</h2>

            {term ? (
              <button className="term-zone" onClick={() => setExplore(true)}>
                <div className="term-endpoints">
                  <span>{fmtMonthDay(term.start)}</span>
                  <span>Finals · {fmtMonthDay(term.end)}</span>
                </div>
                <TermProgressLine term={term} ticks={heroTicks} />
                <div className="term-caption">
                  <span>
                    {Math.round(term.progress * 100)}% · Week {term.week} of {term.weeks}
                  </span>
                  <em className="term-thisweek">This week ↘</em>
                </div>
              </button>
            ) : (
              <button className="term-zone" onClick={() => setTermSetup(true)}>
                <div className="term-caption">
                  <span>Set your term dates to track progress.</span>
                </div>
              </button>
            )}

            {todayClasses.length === 0 ? (
              <div className="hero-hint">
                <Icon name="calendar" size={13} strokeWidth={2} />
                No classes today. Tap the line to see your week.
              </div>
            ) : (
              <div className="hero-classes">
                {visibleClasses.map((cls, i) => {
                  const isLive = cls.start <= now && now < cls.end;
                  const isPast = cls.end < now;
                  const mins = Math.round((cls.end.getTime() - cls.start.getTime()) / 60000);
                  return (
                    <button
                      key={i}
                      className={`hero-class${isPast ? ' past' : ''}`}
                      onClick={() => setSelectedId(cls.course.id)}
                    >
                      <span className={`hero-time${isPast ? ' dim' : ''}`}>
                        <strong>{fmtTime(cls.start)}</strong>
                      </span>
                      <span className="hero-node">
                        <span
                          className={isLive ? 'hero-node-live' : 'hero-node-ring'}
                          style={{ borderColor: cls.course.color_hex, background: isLive ? cls.course.color_hex : undefined }}
                        />
                      </span>
                      <span className="hero-class-name">
                        {cls.course.name}
                        {isLive && (
                          <em className="live-mini" style={{ color: cls.course.color_hex, background: `${cls.course.color_hex}2e` }}>
                            Live
                          </em>
                        )}
                      </span>
                      <span
                        className="hero-class-dur"
                        style={{ color: cls.course.color_hex, background: `${cls.course.color_hex}26` }}
                      >
                        {mins}m
                      </span>
                    </button>
                  );
                })}
                {classOverflow > 0 && (
                  <button className="hero-overflow" onClick={() => setExplore(true)}>
                    <span className="hero-overflow-dot" />+ {classOverflow} more
                  </button>
                )}
              </div>
            )}

            <button className="cta-capsule" onClick={() => setExplore(true)}>
              <Icon name="sparkles" size={14} strokeWidth={2} />
              Explore your semester
            </button>
          </section>

          {/* Metric strip */}
          <section className="metric-strip glass">
            <div className="metric-cell">
              <strong>{totalPending}</strong>
              <span>Pending</span>
            </div>
            <div className="metric-cell">
              <strong>{Math.round(overallProgress * 100)}%</strong>
              <span>Done</span>
            </div>
            <div className="metric-cell">
              <strong>{formatGPA(gpa)}</strong>
              <span>GPA</span>
            </div>
          </section>

          {/* All courses */}
          <div className="explore-section-head courses-list-head">
            <span className="eyebrow eyebrow-muted">All courses</span>
            <span className="lists-count">{sorted.length}</span>
          </div>
          <div className="course-rows">
            {sorted.map((course) => {
              const prog = courseProgress(course, assignments);
              const pct = prog.total > 0 ? prog.done / prog.total : 0;
              const pending = pendingCount(course, assignments);
              const live = todayClasses.some(
                (c) => c.course.id === course.id && c.start <= now && now < c.end
              );
              const nextDay = nextMeetingLabel(course, now);
              return (
                <button
                  key={course.id}
                  className={`course-row glass${live ? ' live' : ''}`}
                  style={{
                    borderColor: `color-mix(in srgb, ${course.color_hex} ${live ? 42 : 14}%, transparent)`,
                  }}
                  onClick={() => setSelectedId(course.id)}
                >
                  <span
                    className="course-row-bar"
                    style={{
                      background: course.color_hex,
                      boxShadow: live ? `0 0 6px ${course.color_hex}8c` : undefined,
                    }}
                  />
                  <span className="course-row-main">
                    <span className="course-row-name">
                      {course.is_pinned && (
                        <Icon name="pin" size={11} strokeWidth={2.4} className="course-row-pin" />
                      )}
                      <strong>{course.name}</strong>
                      {live && <em className="live-mini live-mini-accent">Live</em>}
                      {course.grade && gradePoints(course.grade) !== null && (
                        <em
                          className="grade-chip"
                          style={{ background: `${course.color_hex}29`, color: course.color_hex }}
                        >
                          {course.grade}
                        </em>
                      )}
                    </span>
                    <span className="course-row-chips">
                      {nextDay ? (
                        <span
                          className="meta-chip"
                          style={{
                            color: course.color_hex,
                            background: `color-mix(in srgb, ${course.color_hex} 12%, transparent)`,
                          }}
                        >
                          <Icon name="clock" size={9} strokeWidth={2.4} />
                          {nextDay}
                        </span>
                      ) : course.instructor ? (
                        <span className="meta-chip subtle">
                          <Icon name="user" size={9} strokeWidth={2.4} />
                          {course.instructor}
                        </span>
                      ) : (
                        <span className="meta-chip subtle">
                          <Icon name="calendar" size={9} strokeWidth={2.4} />
                          No schedule
                        </span>
                      )}
                      {pending > 0 && (
                        <span className={`meta-chip${pending > 3 ? ' coral' : ' subtle'}`}>
                          <Icon name="checklist" size={9} strokeWidth={2.4} />
                          {pending}
                        </span>
                      )}
                    </span>
                  </span>
                  <ProgressRing
                    size={44}
                    stroke={5}
                    progress={pct}
                    color={course.color_hex}
                    track="rgba(158,164,179,0.18)"
                  >
                    <span className="ring-pct">{Math.round(pct * 100)}</span>
                  </ProgressRing>
                </button>
              );
            })}
          </div>
        </>
      )}

      {explore && (
        <SemesterExplore
          term={term}
          courses={courses}
          assignments={assignments}
          onClose={() => setExplore(false)}
          onOpenCourse={(id) => {
            setExplore(false);
            setSelectedId(id);
          }}
        />
      )}
      {termSetup && <TermSetupSheet onClose={() => setTermSetup(false)} />}
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
          <Icon name="pin" size={16} className={course.is_pinned ? 'pin-on' : undefined} />
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
            Delete <strong>{confirmDelete.name}</strong>? All assignments will be removed.
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
