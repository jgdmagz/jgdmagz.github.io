import { newId, useStore, useToasts } from './store';
import type { WTItem } from './planner';
import type { TimeBlockRow } from './types';
import { fmtMinutes } from './time';

export type DaySheet =
  | { kind: 'event'; block?: TimeBlockRow; start?: Date; end?: Date }
  | { kind: 'task'; assignmentId?: string }
  | null;

/** Shared wave-timeline actions (quick-plan, edit, toggle, remove + undo toasts). */
export function useDayActions(day: Date, setSheet: (s: DaySheet) => void) {
  const store = useStore();
  const { push } = useToasts();

  const quickPlan = async (start: Date, end: Date) => {
    if (!store.user) return;
    const row: TimeBlockRow = {
      id: newId(),
      user_id: store.user.id,
      title: 'Study block',
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      color_hex: '#595BCD',
      notes: '',
      location: '',
      location_lat: null,
      location_lng: null,
      travel_time: -2,
      estimated_travel_minutes: null,
      repeat_rule: 'none',
      repeat_weekdays: [],
      alert: -1,
      course_id: null,
      is_all_day: false,
      completed_occurrences: [],
    };
    await store.upsertBlock(row);
    push(`Planned ${fmtMinutes((end.getTime() - start.getTime()) / 60000)} of focus`, () =>
      store.deleteBlock(row.id)
    );
  };

  const removeItem = async (item: WTItem) => {
    if (item.kind === 'event' && item.block) {
      const snapshot = item.block;
      await store.deleteBlock(snapshot.id);
      push('Event removed', () => store.upsertBlock(snapshot));
    } else if (item.kind === 'task' && item.assignmentId) {
      const snapshot = store.assignments.find((a) => a.id === item.assignmentId);
      await store.deleteAssignment(item.assignmentId);
      if (snapshot) push('Assignment removed', () => store.upsertAssignment(snapshot));
    }
  };

  const toggleDone = (item: WTItem) => {
    if (item.kind === 'event' && item.block) store.toggleBlockDone(item.block.id, day);
    else if (item.kind === 'task' && item.assignmentId) store.toggleAssignment(item.assignmentId);
  };

  const editItem = (item: WTItem) => {
    if (item.kind === 'event' && item.block) setSheet({ kind: 'event', block: item.block });
    else if (item.kind === 'task' && item.assignmentId)
      setSheet({ kind: 'task', assignmentId: item.assignmentId });
  };

  return { quickPlan, removeItem, toggleDone, editItem };
}
