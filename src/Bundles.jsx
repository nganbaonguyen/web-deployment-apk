import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';

/* Đường dẫn API của ứng dụng đang chọn: /api (mặc định) hoặc /api/apps/<id>. */
const ApiContext = createContext('/api');

/* Tab "Bundle mini app": upload file .tar của mini app, quản lý phiên bản và chọn bản LIVE.
 * API: xem server/bundles.js. */

const MAX_SIZE = 500 * 1024 * 1024;

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** electro-go-work-0.1.0.tar -> { key: 'work', version: '0.1.0' } (do script build đặt tên) */
function parseTarName(filename) {
  const m = filename.match(/^(.*?)-v?(\d+(?:\.\d+){1,3}[0-9A-Za-z.-]*)\.tar$/i);
  if (!m) return { key: '', version: '' };
  const key = m[1]
    .toLowerCase()
    .replace(/^electro-go-/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 40);
  return { key, version: m[2] };
}

/** Lọc về dạng hợp lệ. Chỉ dùng khi rời ô hoặc khi gửi: lọc lúc đang gõ sẽ làm hỏng bộ gõ Telex/VNI. */
const toSlug = (v) => v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
const toVersion = (v) => v.trim().replace(/[^0-9A-Za-z._-]/g, '');

async function readJson(res) {
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server trả lỗi (${res.status}) — hãy restart server: npm run mobile`);
  }
  if (!res.ok) throw new Error(data.error || `Yêu cầu thất bại (${res.status})`);
  return data;
}

/* ─── Icon ─── */
const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function IconModule() {
  return (
    <svg {...svgProps} width="22" height="22">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M17.5 14v7M14 17.5h7" />
    </svg>
  );
}

function IconUp() {
  return (
    <svg {...svgProps}>
      <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg {...svgProps} width="16" height="16">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg {...svgProps} width="16" height="16">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg {...svgProps} width="16" height="16">
      <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />
    </svg>
  );
}

/* ─── Upload .tar ─── */
function UploadModal({ modules, presetKey, onClose, onDone, onError }) {
  const api = useContext(ApiContext);
  const [file, setFile] = useState(null);
  const [key, setKey] = useState(presetKey || '');
  const [version, setVersion] = useState('');
  const [goLive, setGoLive] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);

  const selected = modules.find((m) => m.key === key) || null;

  /** Tìm module đã khai báo khớp với tên file: theo tiền tố tar, hoặc theo mã module. */
  const matchModule = (filename) => {
    const lower = filename.toLowerCase();
    const byPrefix = modules.find((m) => m.tarPrefix && lower.startsWith(`${m.tarPrefix.toLowerCase()}-`));
    return byPrefix || modules.find((m) => m.key === parseTarName(filename).key) || null;
  };

  const pickFile = (f) => {
    if (!f) return;
    setLocalError(null);
    if (!f.name.toLowerCase().endsWith('.tar')) {
      setLocalError('Vui lòng chọn file .tar');
      return;
    }
    if (f.size > MAX_SIZE) {
      setLocalError('File quá lớn — tối đa 500MB');
      return;
    }
    setFile(f);
    const guess = parseTarName(f.name);
    if (!presetKey) setKey(matchModule(f.name)?.key || '');
    if (guess.version) setVersion(guess.version);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file || !key || !version) return;
    setBusy(true);
    setLocalError(null);
    const form = new FormData();
    form.append('version', toVersion(version));
    if (goLive) form.append('live', '1');
    form.append('file', file);
    try {
      const data = await readJson(
        await fetch(`${api}/bundles/${encodeURIComponent(key)}/upload`, { method: 'POST', body: form })
      );
      onDone(`Đã upload ${selected?.label || key} v${data.version} (${data.platforms.join(', ')})${goLive ? ' — đang LIVE' : ''}`);
    } catch (err) {
      setLocalError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Upload bundle mini app"
      subtitle="File .tar tạo bởi pnpm build trong thư mục mini app"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" form="bd-upload-form" className="btn btn-primary" disabled={busy || !file || !key || !toVersion(version)}>
            {busy ? 'Đang upload…' : 'Upload'}
          </button>
        </>
      }
    >
      <form id="bd-upload-form" className="bd-form" onSubmit={submit}>
        <label
          className={`bd-drop ${dragOver ? 'bd-drop--over' : ''} ${file ? 'bd-drop--has' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files[0]);
          }}
        >
          <input type="file" accept=".tar" hidden disabled={busy} onChange={(e) => pickFile(e.target.files[0])} />
          <span className="bd-drop__icon">
            <IconUp />
          </span>
          {file ? (
            <>
              <strong>{file.name}</strong>
              <span className="bd-drop__sub">{formatSize(file.size)} — bấm để chọn file khác</span>
            </>
          ) : (
            <>
              <strong>Chọn file .tar hoặc kéo thả vào đây</strong>
              <span className="bd-drop__sub">Gồm thư mục ios/ và/hoặc android/ — tối đa 500MB</span>
            </>
          )}
        </label>

        <div className="bd-form__row">
          <label className="bd-field">
            <span>Mini app (module)</span>
            <select
              className="bd-input"
              value={key}
              disabled={busy || !!presetKey}
              onChange={(e) => setKey(e.target.value)}
            >
              <option value="">— Chọn mini app —</option>
              {modules.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.key})
                </option>
              ))}
            </select>
            <small>
              {file && !key
                ? 'Không nhận ra từ tên file — hãy chọn tay, hoặc khai báo module mới'
                : 'Tự chọn theo tên file; module khai báo ở nút “Khai báo module”'}
            </small>
          </label>
          <label className="bd-field">
            <span>Phiên bản</span>
            <input
              className="bd-input"
              value={version}
              placeholder="0.1.0"
              disabled={busy}
              onChange={(e) => setVersion(e.target.value)}
              onBlur={() => setVersion((v) => toVersion(v))}
            />
            <small>Tự điền từ tên file (tên-1.3.0.tar), có thể sửa</small>
          </label>
        </div>

        <label className="bd-check">
          <input type="checkbox" checked={goLive} disabled={busy} onChange={(e) => setGoLive(e.target.checked)} />
          <span>
            Đặt <b>LIVE</b> ngay sau khi upload
            <small>Không tick: bản mới chỉ ở STAGING, app người dùng vẫn chạy bản LIVE hiện tại.</small>
          </span>
        </label>

        {localError && <p className="bd-error">{localError}</p>}
      </form>
    </Modal>
  );
}

/* ─── Khai báo module ─── */
function DeclareModal({ onClose, onDone, onError }) {
  const api = useContext(ApiContext);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [tarPrefix, setTarPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      const data = await readJson(
        await fetch(`${api}/bundles/modules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: toSlug(key), label, tarPrefix: toSlug(tarPrefix) }),
        })
      );
      onDone(data.message);
    } catch (err) {
      setLocalError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Khai báo module"
      subtitle="Khai báo một lần, các lần upload sau chỉ cần chọn file"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" form="bd-declare-form" className="btn btn-primary" disabled={busy || !toSlug(key)}>
            {busy ? 'Đang lưu…' : 'Khai báo'}
          </button>
        </>
      }
    >
      <form id="bd-declare-form" className="bd-form" onSubmit={submit}>
        <div className="bd-form__row">
          <label className="bd-field">
            <span>Mã module</span>
            <input
              className="bd-input"
              value={key}
              placeholder="work"
              autoFocus
              disabled={busy}
              onChange={(e) => setKey(e.target.value)}
              onBlur={() => setKey((v) => toSlug(v))}
            />
            <small>Trùng tên remote trong host (vd: work, sale). Chỉ a-z, 0-9, - và _</small>
          </label>
          <label className="bd-field">
            <span>Tên hiển thị</span>
            <input
              className="bd-input"
              value={label}
              placeholder="Chấm công"
              maxLength={60}
              disabled={busy}
              onChange={(e) => setLabel(e.target.value)}
            />
            <small>Để trống thì dùng mã module</small>
          </label>
        </div>
        <label className="bd-field">
          <span>Tiền tố tên file tar</span>
          <input
            className="bd-input"
            value={tarPrefix}
            placeholder={toSlug(key) ? `electro-go-${toSlug(key)}` : 'electro-go-work'}
            disabled={busy}
            onChange={(e) => setTarPrefix(e.target.value)}
            onBlur={() => setTarPrefix((v) => toSlug(v))}
          />
          <small>Dùng để tự nhận module khi chọn file: electro-go-work-0.1.0.tar thuộc module work</small>
        </label>
        {localError && <p className="bd-error">{localError}</p>}
      </form>
    </Modal>
  );
}

/* ─── Lịch sử phiên bản + chọn LIVE ─── */
function HistoryModal({ mod, onClose, onSaved, onError, onChanged }) {
  const api = useContext(ApiContext);
  const initial = useMemo(
    () => Object.fromEntries(mod.versions.map((v) => [v.version, { staging: v.staging, prod: v.prod, active: v.active }])),
    [mod]
  );
  const [draft, setDraft] = useState(initial);
  const [live, setLive] = useState(mod.live);
  const [saving, setSaving] = useState(false);

  const dirty = live !== mod.live || mod.versions.some((v) => {
    const d = draft[v.version];
    return d.staging !== v.staging || d.prod !== v.prod || d.active !== v.active;
  });

  const setFlag = (version, flag, value) =>
    setDraft((prev) => ({ ...prev, [version]: { ...prev[version], [flag]: value } }));

  const toggleLive = (version, on) => {
    if (on) {
      setLive(version);
      setFlag(version, 'active', true); // bản LIVE phải Active
    } else if (live === version) {
      setLive(null);
    }
  };

  const toggleActive = (version, on) => {
    setFlag(version, 'active', on);
    if (!on && live === version) setLive(null); // tắt Active thì không còn LIVE
  };

  const save = async () => {
    const changes = mod.versions
      .filter((v) => {
        const d = draft[v.version];
        return d.staging !== v.staging || d.prod !== v.prod || d.active !== v.active;
      })
      .map((v) => ({ version: v.version, ...draft[v.version] }));
    setSaving(true);
    try {
      await readJson(
        await fetch(`${api}/bundles/${encodeURIComponent(mod.key)}/versions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes, live }),
        })
      );
      onSaved(live ? `${mod.label}: đã đặt LIVE v${live}` : `${mod.label}: đã lưu — hiện không có bản LIVE`);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v) => {
    if (!window.confirm(`Xóa phiên bản ${v.version} của "${mod.label}"? File bundle sẽ bị xóa khỏi server.`)) return;
    try {
      await readJson(
        await fetch(`${api}/bundles/${encodeURIComponent(mod.key)}/versions/${encodeURIComponent(v.version)}`, {
          method: 'DELETE',
        })
      );
      onChanged(`Đã xóa ${mod.key} v${v.version}`);
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <Modal
      wide
      title={mod.key}
      subtitle={`${mod.label} · lịch sử phiên bản`}
      hint={
        <>
          Tick <b>LIVE</b> để chọn bản phục vụ người dùng
        </>
      }
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <span className="bd-foot-note">{mod.versions.length} phiên bản</span>
          <span className="bd-spacer" />
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      {mod.versions.length === 0 && (
        <p className="empty-state">Chưa có phiên bản nào. Đóng hộp thoại và bấm nút upload trên thẻ module.</p>
      )}
      <div className="bd-scroll">
        <table className="bd-table">
          <thead>
            <tr>
              <th>Phiên bản</th>
              <th>File</th>
              <th>Nền tảng</th>
              <th>Dung lượng</th>
              <th>Thời gian upload</th>
              <th>Môi trường</th>
              <th>Trạng thái</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {mod.versions.map((v) => {
              const d = draft[v.version];
              const isLive = live === v.version;
              return (
                <tr key={v.version} className={isLive ? 'bd-row--live' : ''}>
                  <td>
                    <strong className="bd-ver">v{v.version}</strong>
                    {isLive && <span className="bd-live-tag">LIVE</span>}
                  </td>
                  <td className="bd-file" title={v.file}>
                    {v.file}
                  </td>
                  <td>
                    {v.platforms.map((p) => (
                      <span key={p} className={`platform-badge platform-${p} bd-plat`}>
                        {p === 'ios' ? 'iOS' : 'Android'}
                      </span>
                    ))}
                  </td>
                  <td className="bd-num">{formatSize(v.sizeBytes)}</td>
                  <td className="bd-time">{formatDateTime(v.uploadedAt)}</td>
                  <td>
                    <div className="bd-envs">
                      <label className="bd-env">
                        <input type="checkbox" checked={d.staging} onChange={(e) => setFlag(v.version, 'staging', e.target.checked)} />
                        <span>STAGING</span>
                      </label>
                      <label className="bd-env">
                        <input type="checkbox" checked={d.prod} onChange={(e) => setFlag(v.version, 'prod', e.target.checked)} />
                        <span>PROD</span>
                      </label>
                      <label className="bd-env bd-env--live">
                        <input type="checkbox" checked={isLive} onChange={(e) => toggleLive(v.version, e.target.checked)} />
                        <span>LIVE</span>
                      </label>
                    </div>
                  </td>
                  <td>
                    <label className="activate-toggle" title={d.active ? 'Tắt Active: app không tải được bản này' : 'Bật Active'}>
                      <input
                        type="checkbox"
                        className="activate-toggle__input"
                        checked={d.active}
                        onChange={(e) => toggleActive(v.version, e.target.checked)}
                      />
                      <span className="activate-toggle__track" aria-hidden="true" />
                      <span className="activate-toggle__label">{d.active ? 'Active' : 'Tắt'}</span>
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="bd-icon-btn bd-icon-btn--danger"
                      title="Xóa phiên bản"
                      onClick={() => remove(v)}
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ─── Màn chính của tab ─── */
export default function BundlesPanel({ apiBase = '/api', appName, onMessage, onError }) {
  const api = apiBase;
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [upload, setUpload] = useState(null); // null | { key?: string }
  const [declareOpen, setDeclareOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await readJson(await fetch(`${api}/bundles`));
      setModules(data.modules || []);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const visible = q ? modules.filter((m) => `${m.key} ${m.label}`.toLowerCase().includes(q)) : modules;
  const versionCount = modules.reduce((n, m) => n + m.versions.length, 0);
  const liveCount = modules.filter((m) => m.live).length;
  const historyModule = modules.find((m) => m.key === historyKey) || null;

  const removeModule = async (m) => {
    if (!window.confirm(`Xóa module "${m.label}" cùng ${m.versions.length} phiên bản? Không thể hoàn tác.`)) return;
    try {
      await readJson(await fetch(`${api}/bundles/${encodeURIComponent(m.key)}`, { method: 'DELETE' }));
      onMessage(`Đã xóa module ${m.key}`);
      await load();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <ApiContext.Provider value={api}>
      <header className="topbar">
        <div>
          <h1 className="topbar__title">
            Bundle mini app {appName && <span className="app-chip">{appName}</span>}
          </h1>
          <p className="topbar__sub">
            Upload file <b>.tar</b>, chọn phiên bản <b>LIVE</b> — app ElectroGo chỉ nạp bản đang LIVE.
          </p>
        </div>
        <div className="topbar__right">
          <button type="button" className="btn btn-outline" onClick={load}>
            <span className="bd-btn-icon">
              <IconRefresh />
            </span>
            Làm mới
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setDeclareOpen(true)}>
            + Khai báo module
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setUpload({})}
            disabled={modules.length === 0}
            title={modules.length === 0 ? 'Khai báo module trước' : undefined}
          >
            + Upload bundle (.tar)
          </button>
        </div>
      </header>

      <section className="card card--table">
        <div className="card__head card__head--row">
          <div>
            <h2>
              Modules &amp; phiên bản <span className="bd-count">{modules.length}</span>
            </h2>
            <p>
              {versionCount} phiên bản · {liveCount} module đang LIVE
            </p>
          </div>
          <div className="toolbar">
            <input
              type="search"
              className="search"
              placeholder="Tìm module…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Tìm module"
            />
          </div>
        </div>

        {loading ? (
          <p className="empty-state">Đang tải dữ liệu...</p>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <p>{q ? 'Không tìm thấy module phù hợp.' : 'Chưa khai báo module nào.'}</p>
            <p className="muted">Bấm “Khai báo module” để thêm mini app đầu tiên.</p>
          </div>
        ) : (
          <div className="bd-grid">
            {visible.map((m) => {
              const liveV = m.versions.find((v) => v.version === m.live);
              const shown = liveV || m.versions[0];
              const platforms = [...new Set((liveV ? [liveV] : m.versions).flatMap((v) => v.platforms))];
              return (
                <article key={m.key} className={`bd-card ${m.live ? 'bd-card--live' : ''}`}>
                  <div className="bd-card__top">
                    <span className="bd-card__icon">
                      <IconModule />
                    </span>
                    <div className="bd-card__name">
                      <h3>{m.label}</h3>
                      <code>{m.key}</code>
                    </div>
                    <span className={`bd-badge ${m.live ? 'bd-badge--live' : ''}`}>
                      <i /> {m.live ? `LIVE v${m.live}` : 'Chưa LIVE'}
                    </span>
                  </div>

                  <div className="bd-card__tags">
                    {platforms.map((p) => (
                      <span key={p} className={`platform-badge platform-${p}`}>
                        {p === 'ios' ? 'iOS' : 'Android'}
                      </span>
                    ))}
                    <span className="bd-tag">{m.versions.length} phiên bản</span>
                    {m.versions.some((v) => v.prod) && <span className="bd-tag">có PROD</span>}
                  </div>

                  <div className="bd-card__foot">
                    {shown ? (
                      <span className="bd-chip">
                        v{shown.version}
                        <i className={m.live ? 'bd-dot bd-dot--on' : 'bd-dot'} />
                      </span>
                    ) : (
                      <span className="bd-chip">—</span>
                    )}
                    <span className="bd-spacer" />
                    <button
                      type="button"
                      className="bd-icon-btn bd-icon-btn--accent"
                      title="Upload phiên bản mới"
                      onClick={() => setUpload({ key: m.key })}
                    >
                      <IconUp />
                    </button>
                    <button type="button" className="bd-link-btn" onClick={() => setHistoryKey(m.key)}>
                      <IconHistory /> versions
                    </button>
                    <button
                      type="button"
                      className="bd-icon-btn bd-icon-btn--danger"
                      title="Xóa module"
                      onClick={() => removeModule(m)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {declareOpen && (
        <DeclareModal
          onClose={() => setDeclareOpen(false)}
          onError={onError}
          onDone={async (msg) => {
            setDeclareOpen(false);
            onMessage(msg);
            await load();
          }}
        />
      )}

      {upload && (
        <UploadModal
          modules={modules}
          presetKey={upload.key}
          onClose={() => setUpload(null)}
          onError={onError}
          onDone={async (msg) => {
            setUpload(null);
            onMessage(msg);
            await load();
          }}
        />
      )}

      {historyModule && (
        <HistoryModal
          key={`${historyModule.key}-${historyModule.versions.length}-${historyModule.live}`}
          mod={historyModule}
          onClose={() => setHistoryKey(null)}
          onError={onError}
          onChanged={async (msg) => {
            onMessage(msg);
            await load();
          }}
          onSaved={async (msg) => {
            setHistoryKey(null);
            onMessage(msg);
            await load();
          }}
        />
      )}
    </ApiContext.Provider>
  );
}
