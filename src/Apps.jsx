import { useMemo, useState } from 'react';
import Modal from './Modal';

/* Danh sách ứng dụng (App hosts) ở sidebar + hộp thoại thêm ứng dụng.
 * Mỗi ứng dụng có kho APK/IPA và bundle mini app riêng; API: server/apps.js. */

export const COLORS = ['#6366f1', '#10b981', '#3b82f6', '#14b8a6', '#8b5cf6', '#f97316', '#ec4899', '#0ea5e9'];

/** "Bách Hóa Xanh Work" -> "bach-hoa-xanh-work". Chỉ dùng khi rời ô / khi gửi (không lọc lúc đang gõ: hỏng bộ gõ Telex). */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

const initialOf = (name) => (name.trim().charAt(0) || '?').toUpperCase();

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function AppSwitcher({ apps, currentId, onSelect, onAdd, onDelete }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => (q ? apps.filter((a) => `${a.name} ${a.id}`.toLowerCase().includes(q)) : apps),
    [apps, q]
  );

  return (
    <section className="apps" aria-label="Ứng dụng">
      <div className="apps__head">
        <p className="nav__label">Ứng dụng ({apps.length})</p>
        <button type="button" className="apps__add" onClick={onAdd} title="Thêm ứng dụng" aria-label="Thêm ứng dụng">
          <IconPlus />
        </button>
      </div>

      {apps.length > 5 && (
        <input
          type="search"
          className="apps__search"
          placeholder="Tìm ứng dụng…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm ứng dụng"
        />
      )}

      <div className="apps__list">
        {visible.map((a) => (
          <div key={a.id} className={`apps__item ${a.id === currentId ? 'is-current' : ''}`}>
            <button type="button" className="apps__btn" onClick={() => onSelect(a.id)} aria-current={a.id === currentId}>
              <span className="apps__tile" style={{ background: a.color }}>
                {initialOf(a.name)}
              </span>
              <span className="apps__text">
                <strong>{a.name}</strong>
                <code>{a.id}</code>
              </span>
            </button>
            {!a.isDefault && (
              <button
                type="button"
                className="apps__del"
                title="Xóa ứng dụng"
                aria-label={`Xóa ${a.name}`}
                onClick={() => onDelete(a)}
              >
                <IconX />
              </button>
            )}
          </div>
        ))}
        {visible.length === 0 && <p className="apps__empty">Không tìm thấy ứng dụng.</p>}
      </div>
    </section>
  );
}

export function AddAppModal({ count, onClose, onDone, onError }) {
  const [name, setName] = useState('');
  const [idRaw, setIdRaw] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [color, setColor] = useState(COLORS[count % COLORS.length]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);

  const id = idEdited ? slugify(idRaw) : slugify(name);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !id) return;
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), id, color }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Thêm ứng dụng thất bại (${res.status})`);
      onDone(data.app, data.message);
    } catch (err) {
      setLocalError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Thêm ứng dụng"
      subtitle="Mỗi ứng dụng có kho APK/IPA và bundle mini app riêng"
      icon={<span className="apps__tile apps__tile--lg" style={{ background: color }}>{initialOf(name || '?')}</span>}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" form="app-add-form" className="btn btn-primary" disabled={busy || !name.trim() || !id}>
            {busy ? 'Đang thêm…' : 'Thêm ứng dụng'}
          </button>
        </>
      }
    >
      <form id="app-add-form" className="bd-form" onSubmit={submit}>
        <label className="bd-field">
          <span>Tên ứng dụng</span>
          <input
            className="bd-input"
            value={name}
            placeholder="BHX Work"
            autoFocus
            maxLength={60}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="bd-field">
          <span>Mã ứng dụng</span>
          <input
            className="bd-input"
            value={idEdited ? idRaw : id}
            placeholder="bhx-work"
            disabled={busy}
            onChange={(e) => {
              setIdEdited(true);
              setIdRaw(e.target.value);
            }}
            onBlur={() => idEdited && setIdRaw((v) => slugify(v))}
          />
          <small>Tự tạo từ tên, dùng trong đường dẫn API: /api/apps/{id || 'ma-ung-dung'}/…</small>
        </label>

        <div className="bd-field">
          <span>Màu</span>
          <div className="apps__colors" role="radiogroup" aria-label="Màu ứng dụng">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                className={`apps__swatch ${c === color ? 'is-on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                disabled={busy}
              />
            ))}
          </div>
        </div>

        {localError && <p className="bd-error">{localError}</p>}
      </form>
    </Modal>
  );
}
