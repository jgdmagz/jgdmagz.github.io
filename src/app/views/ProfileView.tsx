import { useMemo, useRef, useState } from 'react';
import { useStore, useToasts } from '../lib/store';
import { cumulativeGPA, formatGPA } from '../lib/gpa';
import { fmtDayShort, termInfo } from '../lib/time';
import { Icon, Modal, ProgressRing } from '../components/ui';

export function ProfileView() {
  const { user, profile, courses, assignments, saveProfile, uploadAvatar, signOut, deleteAccount } =
    useStore();
  const { push } = useToasts();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [school, setSchool] = useState(profile?.school ?? '');
  const [degree, setDegree] = useState(profile?.degree ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWord, setDeleteWord] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    name !== (profile?.display_name ?? '') ||
    school !== (profile?.school ?? '') ||
    degree !== (profile?.degree ?? '');

  const gpa = useMemo(() => cumulativeGPA(courses), [courses]);
  const active = courses.filter((c) => !c.is_archived);
  const credits = active.reduce((s, c) => s + c.credits, 0);
  const doneCount = assignments.filter((a) => a.is_completed).length;
  const term = termInfo(
    profile?.term_label ?? null,
    profile?.term_start ?? null,
    profile?.term_weeks ?? null
  );

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const save = async () => {
    setSaving(true);
    const ok = await saveProfile({
      display_name: name.trim() || null,
      school: school.trim() || null,
      degree: degree.trim() || null,
    });
    setSaving(false);
    if (ok) push('Profile saved ✓');
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const url = await uploadAvatar(file);
    if (url) {
      await saveProfile({ avatar_url: url });
      push('Photo updated ✓');
    }
    setUploading(false);
  };

  return (
    <div className="view profile-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">Your account</div>
          <h1 className="view-title">Profile</h1>
        </div>
      </header>

      <section className="profile-hero glass">
        <div className="profile-id">
          <button
            className="profile-avatar"
            onClick={() => fileRef.current?.click()}
            title="Change photo"
            aria-label="Change photo"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              <Icon name="user" size={38} strokeWidth={1.5} />
            )}
            <span className="profile-avatar-edit">
              <Icon name={uploading ? 'clock' : 'pencil'} size={12} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickAvatar(e.target.files?.[0])}
          />

          <div className="profile-fields">
            <div className="field-row">
              <label className="mini-label" htmlFor="pf-name">Name</label>
              <input
                id="pf-name"
                className="sheet-input"
                placeholder="Your name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field-pair">
              <div className="field-row">
                <label className="mini-label" htmlFor="pf-school">School</label>
                <input
                  id="pf-school"
                  className="sheet-input"
                  placeholder="e.g. UC Berkeley"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                />
              </div>
              <div className="field-row">
                <label className="mini-label" htmlFor="pf-degree">Degree / program</label>
                <input
                  id="pf-degree"
                  className="sheet-input"
                  placeholder="e.g. B.S. Computer Science"
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                />
              </div>
            </div>
            <div className="profile-meta">
              <span>{user?.email}</span>
              {memberSince && <span>· member since {memberSince}</span>}
            </div>
            <div className="profile-save-row">
              <button className="btn btn-sm" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <span className="profile-sync-hint">
                <Icon name="sparkles" size={13} />
                Syncs with the StudentFlow app
              </span>
            </div>
          </div>
        </div>

        <div className="profile-gpa">
          <ProgressRing size={132} stroke={11} progress={gpa !== null ? gpa / 4 : 0}>
            <span className="profile-gpa-center">
              <strong>{formatGPA(gpa)}</strong>
              <span>GPA</span>
            </span>
          </ProgressRing>
          <span className="profile-gpa-cap">Cumulative · 4.0 scale</span>
        </div>
      </section>

      <section className="profile-grid">
        <div className="panel glass">
          <div className="panel-head">
            <h2 className="section-h">
              <Icon name="flag" size={16} /> {term ? term.label : 'Current term'}
            </h2>
            {term && <span className="panel-tag">Week {term.week} of {term.weeks}</span>}
          </div>
          {term ? (
            <>
              <div className="term-track">
                <div className="term-fill" style={{ width: `${Math.round(term.progress * 100)}%` }} />
              </div>
              <div className="term-dates">
                <span>{fmtDayShort(term.start)}</span>
                <span>{Math.round(term.progress * 100)}% through</span>
                <span>{fmtDayShort(term.end)}</span>
              </div>
            </>
          ) : (
            <p className="panel-hint">
              Your term is set in the StudentFlow app's planner — it syncs here automatically.
            </p>
          )}
        </div>

        <div className="panel glass">
          <div className="panel-head">
            <h2 className="section-h">
              <Icon name="gradcap" size={16} /> This term
            </h2>
          </div>
          <div className="panel-stats">
            <span><strong>{active.length}</strong> courses</span>
            <span><strong>{credits % 1 === 0 ? credits : credits.toFixed(1)}</strong> credits</span>
            <span><strong>{doneCount}</strong>/<span className="dim">{assignments.length}</span> assignments done</span>
          </div>
        </div>
      </section>

      <section className="panel glass profile-account">
        <div className="panel-head">
          <h2 className="section-h"><Icon name="user" size={16} /> Account</h2>
        </div>
        <p className="panel-hint">
          You're signed in with Apple. The same account works in the iOS app — your name, photo,
          school, degree and all study data stay in sync.
        </p>
        <div className="account-actions">
          <a className="btn-quiet" href="/" >
            <Icon name="external" size={15} /> About StudentFlow
          </a>
          <button className="btn-quiet" onClick={signOut}>
            <Icon name="logout" size={15} /> Sign out
          </button>
          <span className="sheet-spacer" />
          <button className="btn-quiet danger-text" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={15} /> Delete account
          </button>
        </div>
      </section>

      {confirmDelete && (
        <Modal title="Delete your account?" onClose={() => setConfirmDelete(false)}>
          <p className="confirm-text">
            This permanently deletes your StudentFlow account, profile, courses, assignments and
            events — on the web <em>and</em> in the app. This cannot be undone.
          </p>
          <div className="field-row">
            <label className="mini-label" htmlFor="pf-delete">Type <strong>delete</strong> to confirm</label>
            <input
              id="pf-delete"
              className="sheet-input"
              value={deleteWord}
              onChange={(e) => setDeleteWord(e.target.value)}
              placeholder="delete"
            />
          </div>
          <div className="sheet-actions">
            <button className="btn-quiet" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <span className="sheet-spacer" />
            <button
              className="btn btn-sm btn-danger"
              disabled={deleteWord.trim().toLowerCase() !== 'delete'}
              onClick={deleteAccount}
            >
              Delete forever
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
