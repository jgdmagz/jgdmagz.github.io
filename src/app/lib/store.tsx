import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { demoData } from './demo';
import type { AssignmentRow, CourseRow, ProfileRow, TimeBlockRow } from './types';
import { dateKey } from './time';

/* ── Toasts ─────────────────────────────────────────────────────── */

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (message: string, undo?: () => void) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts outside provider');
  return ctx;
}

/* ── Store ──────────────────────────────────────────────────────── */

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

interface StoreValue {
  authStatus: AuthStatus;
  demo: boolean;
  user: User | null;
  dataReady: boolean;
  dataError: string | null;
  profile: ProfileRow | null;
  courses: CourseRow[];
  assignments: AssignmentRow[];
  blocks: TimeBlockRow[];

  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  reload: () => Promise<void>;

  saveProfile: (patch: Partial<ProfileRow>) => Promise<boolean>;
  uploadAvatar: (file: File) => Promise<string | null>;

  upsertCourse: (course: CourseRow) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;

  upsertAssignment: (a: AssignmentRow) => Promise<void>;
  toggleAssignment: (id: string) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;

  upsertBlock: (b: TimeBlockRow) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
  toggleBlockDone: (id: string, day: Date) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function StoreProvider({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [blocks, setBlocks] = useState<TimeBlockRow[]>([]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, undo?: () => void) => {
      const id = ++toastId.current;
      setToasts((ts) => [...ts.slice(-2), { id, message, undo }]);
      window.setTimeout(() => dismiss(id), undo ? 6000 : 3200);
    },
    [dismiss]
  );

  /* In demo mode every Supabase write is skipped — state changes stay local. */
  const remote = useCallback(
    async <T extends { error: { message: string } | null }>(
      op: () => PromiseLike<T>
    ): Promise<{ error: { message: string } | null }> => (demo ? { error: null } : await op()),
    [demo]
  );

  /* ── Auth wiring ── */

  useEffect(() => {
    if (demo) {
      const d = demoData();
      setUser(d.user);
      setProfile(d.profile);
      setCourses(d.courses);
      setAssignments(d.assignments);
      setBlocks(d.blocks);
      setAuthStatus('signed-in');
      setDataReady(true);
      return;
    }
    let mounted = true;
    const apply = (session: Session | null) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setAuthStatus(session ? 'signed-in' : 'signed-out');
    };
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => mounted && setAuthStatus('signed-out'));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [demo]);

  /* ── Initial load ── */

  const load = useCallback(async (uid: string) => {
    setDataError(null);
    const [profileRes, coursesRes, assignmentsRes, blocksRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('courses').select('*').order('created_at', { ascending: true }),
      supabase.from('assignments').select('*').order('due_at', { ascending: true }),
      supabase.from('time_blocks').select('*').order('start_at', { ascending: true }),
    ]);
    // Profiles existed before the study tables — if those are missing the SQL
    // migration hasn't been run yet; surface that clearly instead of a blank app.
    const tableError = coursesRes.error ?? assignmentsRes.error ?? blocksRes.error;
    if (tableError) {
      setDataError(tableError.message);
    }
    setProfile((profileRes.data as ProfileRow | null) ?? null);
    setCourses((coursesRes.data as CourseRow[] | null) ?? []);
    setAssignments((assignmentsRes.data as AssignmentRow[] | null) ?? []);
    setBlocks((blocksRes.data as TimeBlockRow[] | null) ?? []);
    setDataReady(true);
  }, []);

  useEffect(() => {
    if (demo) return;
    if (authStatus === 'signed-in' && user) {
      setDataReady(false);
      load(user.id);
    } else if (authStatus === 'signed-out') {
      setProfile(null);
      setCourses([]);
      setAssignments([]);
      setBlocks([]);
      setDataReady(false);
    }
  }, [authStatus, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    if (!demo && user) await load(user.id);
  }, [demo, user, load]);

  /* ── Auth actions ── */

  const signInWithApple = useCallback(async () => {
    if (demo) {
      window.location.href = '/app';
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) push(error.message);
  }, [demo, push]);

  const signOut = useCallback(async () => {
    if (!demo) await supabase.auth.signOut();
    try {
      localStorage.removeItem('sf-nav-profile');
    } catch {
      /* ignore */
    }
    window.location.href = '/';
  }, [demo]);

  const deleteAccount = useCallback(async () => {
    if (demo) {
      window.location.href = '/';
      return;
    }
    // Mirror the app: remove the avatar object first (storage doesn't cascade),
    // then the SECURITY DEFINER RPC deletes auth.users → everything cascades.
    if (user) {
      await supabase.storage.from('avatars').remove([`${user.id}/avatar.jpg`]);
    }
    const { error } = await supabase.rpc('delete_user_account');
    if (error) {
      push(error.message);
      return;
    }
    await supabase.auth.signOut();
    try {
      localStorage.removeItem('sf-nav-profile');
    } catch {
      /* ignore */
    }
    window.location.href = '/';
  }, [demo, user, push]);

  /* ── Profile ── */

  const saveProfile = useCallback(
    async (patch: Partial<ProfileRow>): Promise<boolean> => {
      if (!user) return false;
      const next = { ...(profile ?? { id: user.id }), ...patch, id: user.id } as ProfileRow;
      setProfile(next);
      const { error } = await remote(() => supabase.from('profiles').upsert({ ...patch, id: user.id }));
      if (error) {
        push(`Couldn't save profile — ${error.message}`);
        return false;
      }
      // Keep the marketing nav's cached chip in sync.
      try {
        const first = (next.display_name || user.email || 'Account').split('@')[0].split(' ')[0];
        localStorage.setItem(
          'sf-nav-profile',
          JSON.stringify({ first, avatar: next.avatar_url || null })
        );
      } catch {
        /* ignore */
      }
      return true;
    },
    [user, profile, push, remote]
  );

  const uploadAvatar = useCallback(
    async (file: File): Promise<string | null> => {
      if (!user) return null;
      if (demo) return URL.createObjectURL(file);
      const path = `${user.id}/avatar.jpg`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
      if (error) {
        push(`Upload failed — ${error.message}`);
        return null;
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      return `${data.publicUrl}?v=${Date.now()}`;
    },
    [demo, user, push]
  );

  /* ── Courses ── */

  const upsertCourse = useCallback(
    async (course: CourseRow) => {
      const prev = courses;
      const exists = prev.some((c) => c.id === course.id);
      setCourses(exists ? prev.map((c) => (c.id === course.id ? course : c)) : [...prev, course]);
      const { error } = await remote(() => supabase.from('courses').upsert(course));
      if (error) {
        setCourses(prev);
        push(`Couldn't save course — ${error.message}`);
      }
    },
    [courses, push, remote]
  );

  const deleteCourse = useCallback(
    async (id: string) => {
      const prevCourses = courses;
      const prevAssignments = assignments;
      setCourses(prevCourses.filter((c) => c.id !== id));
      setAssignments(prevAssignments.filter((a) => a.course_id !== id));
      const { error } = await remote(() => supabase.from('courses').delete().eq('id', id));
      if (error) {
        setCourses(prevCourses);
        setAssignments(prevAssignments);
        push(`Couldn't delete course — ${error.message}`);
      }
    },
    [courses, assignments, push, remote]
  );

  /* ── Assignments ── */

  const upsertAssignment = useCallback(
    async (a: AssignmentRow) => {
      const prev = assignments;
      const exists = prev.some((x) => x.id === a.id);
      const next = exists ? prev.map((x) => (x.id === a.id ? a : x)) : [...prev, a];
      next.sort((x, y) => x.due_at.localeCompare(y.due_at));
      setAssignments(next);
      const { error } = await remote(() => supabase.from('assignments').upsert(a));
      if (error) {
        setAssignments(prev);
        push(`Couldn't save assignment — ${error.message}`);
      }
    },
    [assignments, push, remote]
  );

  const toggleAssignment = useCallback(
    async (id: string) => {
      const target = assignments.find((a) => a.id === id);
      if (!target) return;
      const updated = { ...target, is_completed: !target.is_completed };
      setAssignments((prev) => prev.map((a) => (a.id === id ? updated : a)));
      const { error } = await remote(() =>
        supabase.from('assignments').update({ is_completed: updated.is_completed }).eq('id', id)
      );
      if (error) {
        setAssignments((prev) => prev.map((a) => (a.id === id ? target : a)));
        push(`Couldn't update — ${error.message}`);
      }
    },
    [assignments, push, remote]
  );

  const deleteAssignment = useCallback(
    async (id: string) => {
      const prev = assignments;
      setAssignments(prev.filter((a) => a.id !== id));
      const { error } = await remote(() => supabase.from('assignments').delete().eq('id', id));
      if (error) {
        setAssignments(prev);
        push(`Couldn't delete — ${error.message}`);
      }
    },
    [assignments, push, remote]
  );

  /* ── Time blocks ── */

  const upsertBlock = useCallback(
    async (b: TimeBlockRow) => {
      const prev = blocks;
      const exists = prev.some((x) => x.id === b.id);
      const next = exists ? prev.map((x) => (x.id === b.id ? b : x)) : [...prev, b];
      next.sort((x, y) => x.start_at.localeCompare(y.start_at));
      setBlocks(next);
      const { error } = await remote(() => supabase.from('time_blocks').upsert(b));
      if (error) {
        setBlocks(prev);
        push(`Couldn't save event — ${error.message}`);
      }
    },
    [blocks, push, remote]
  );

  const deleteBlock = useCallback(
    async (id: string) => {
      const prev = blocks;
      setBlocks(prev.filter((b) => b.id !== id));
      const { error } = await remote(() => supabase.from('time_blocks').delete().eq('id', id));
      if (error) {
        setBlocks(prev);
        push(`Couldn't delete event — ${error.message}`);
      }
    },
    [blocks, push, remote]
  );

  const toggleBlockDone = useCallback(
    async (id: string, day: Date) => {
      const target = blocks.find((b) => b.id === id);
      if (!target) return;
      const key = dateKey(day);
      const has = target.completed_occurrences.includes(key);
      const completed_occurrences = has
        ? target.completed_occurrences.filter((k) => k !== key)
        : [...target.completed_occurrences, key];
      const updated = { ...target, completed_occurrences };
      setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
      const { error } = await remote(() =>
        supabase.from('time_blocks').update({ completed_occurrences }).eq('id', id)
      );
      if (error) {
        setBlocks((prev) => prev.map((b) => (b.id === id ? target : b)));
        push(`Couldn't update — ${error.message}`);
      }
    },
    [blocks, push, remote]
  );

  const value = useMemo<StoreValue>(
    () => ({
      authStatus,
      demo,
      user,
      dataReady,
      dataError,
      profile,
      courses,
      assignments,
      blocks,
      signInWithApple,
      signOut,
      deleteAccount,
      reload,
      saveProfile,
      uploadAvatar,
      upsertCourse,
      deleteCourse,
      upsertAssignment,
      toggleAssignment,
      deleteAssignment,
      upsertBlock,
      deleteBlock,
      toggleBlockDone,
    }),
    [
      authStatus, demo, user, dataReady, dataError, profile, courses, assignments, blocks,
      signInWithApple, signOut, deleteAccount, reload, saveProfile, uploadAvatar,
      upsertCourse, deleteCourse, upsertAssignment, toggleAssignment, deleteAssignment,
      upsertBlock, deleteBlock, toggleBlockDone,
    ]
  );

  const toastValue = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={toastValue}>
      <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
    </ToastContext.Provider>
  );
}
