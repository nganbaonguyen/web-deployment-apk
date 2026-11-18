import { useCallback, useEffect, useRef, useState } from 'react';

const CREATOR = 'Nguyễn Bảo Ngân';
const AVATAR = '/avatar.png';
const LAST_RELEASE_KEY = 'appDeploy_lastReleaseId';

function pickLastRelease(packages) {
  if (!packages?.length) return null;
  const active = packages.find((p) => p.active);
  if (active) return active;
  try {
    const savedId = sessionStorage.getItem(LAST_RELEASE_KEY);
    if (savedId) {
      const found = packages.find((p) => p.id === savedId);
      if (found) return found;
    }
  } catch {
    /* ignore */
  }
  return packages[0];
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function qrSrc(url) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
}

function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAndroid() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 00-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67a.643.643 0 00-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 001 18h22a10.78 10.78 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}

function IconApple() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

function IconRocket() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9A2.1 2.1 0 005 15z" />
      <path d="M12 15l-3-3a22 22 0 012-4 12.9 12.9 0 0111-5c0 2.7-.8 7.5-5 11a22 22 0 01-4 2z" />
      <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />
    </svg>
  );
}

export default function App() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [mobileLinks, setMobileLinks] = useState([]);
  const [publicUrl, setPublicUrl] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [lastUploaded, setLastUploaded] = useState(null);
  const [freshUpload, setFreshUpload] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [inputKey, setInputKey] = useState({ android: 0, ios: 0 });
  const [activationReady, setActivationReady] = useState(null);
  const listRef = useRef(null);

  function normalizePackagesPayload(data) {
    if (Array.isArray(data)) {
      return { list: data.map((p) => ({ ...p, active: !!p.active })), supportsActivation: false };
    }
    const list = (data.packages || []).map((p) => ({ ...p, active: !!p.active }));
    return { list, supportsActivation: true, activeId: data.activeId || null };
  }

  async function parseJsonResponse(res) {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        res.status === 404
          ? 'Server chưa có API kích hoạt — restart: npm run mobile (hoặc dừng process cũ trên port 8080)'
          : `Server trả lỗi (${res.status}) — restart: npm run mobile`
      );
    }
  }

  const androidHotspotLinks = mobileLinks.filter(
    (l) => l.url.includes('192.168.43.') || l.url.includes('192.168.4.') || l.url.includes('10.134.')
  );
  const otherLanLinks = mobileLinks.filter(
    (l) =>
      !l.url.includes('10.152.') &&
      !l.url.includes('192.168.43.') &&
      !l.url.includes('192.168.4.') &&
      !androidHotspotLinks.some((h) => h.url === l.url)
  );

  const androidCount = packages.filter((p) => p.platform === 'android').length;
  const iosCount = packages.filter((p) => p.platform === 'ios').length;

  const filtered =
    filter === 'all' ? packages : packages.filter((p) => p.platform === filter);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setActivationReady(!!data.features?.packageActivation))
      .catch(() => setActivationReady(false));

    const load = () =>
      fetch('/api/network')
        .then((r) => r.json())
        .then((data) => {
          if (data.links?.length) setMobileLinks(data.links);
          if (data.publicUrl) setPublicUrl(data.publicUrl);
        })
        .catch(() => {});

    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/packages');
      const data = await parseJsonResponse(res);
      const { list, supportsActivation } = normalizePackagesPayload(data);
      setPackages(list);
      if (supportsActivation) setActivationReady(true);
      const latest = pickLastRelease(list);
      if (latest) {
        setLastUploaded(latest);
        setFreshUpload(false);
      } else {
        setLastUploaded(null);
      }
    } catch {
      setError('Không kết nối được server. Chạy: npm run mobile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const uploadFile = async (file, platform) => {
    if (!file) return;

    const ext = platform === 'ios' ? '.ipa' : '.apk';
    if (!file.name.toLowerCase().endsWith(ext)) {
      setError(`Vui lòng chọn file ${ext}`);
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setError('File quá lớn — tối đa 500MB');
      return;
    }

    setUploading(platform);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      let data = {};
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error('Server trả về lỗi — hãy chạy lại: npm run mobile');
      }

      if (!res.ok) throw new Error(data.error || `Upload thất bại (${res.status})`);

      const newPkg = {
        id: data.file.id,
        name: data.file.name,
        platform: data.file.platform || platform,
        active: true,
        size: data.file.size,
        downloadUrl: data.file.downloadUrl,
        uploadedAt: new Date().toISOString(),
      };

      setLastUploaded(newPkg);
      setFreshUpload(true);
      try {
        sessionStorage.setItem(LAST_RELEASE_KEY, newPkg.id);
      } catch {
        /* ignore */
      }
      setPackages((prev) => [newPkg, ...prev.filter((p) => p.id !== newPkg.id)]);
      setFilter(newPkg.platform);
      setHighlightId(newPkg.id);
      setInputKey((k) => ({ ...k, [platform]: k[platform] + 1 }));
      setMessage(`Đã phát hành ${platform === 'ios' ? 'IPA' : 'APK'}: ${data.file.name}`);

      await fetchPackages();

      setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      setTimeout(() => setHighlightId(null), 6000);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Upload quá lâu — thử file nhỏ hơn hoặc kiểm tra mạng');
      } else {
        setError(err.message || 'Upload thất bại');
      }
    } finally {
      clearTimeout(timeout);
      setUploading(null);
    }
  };

  const handleDrop = (e, platform) => {
    e.preventDefault();
    setDragOver(null);
    uploadFile(e.dataTransfer.files[0], platform);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Gỡ bỏ "${name}" khỏi kho phân phối?`)) return;
    try {
      const res = await fetch(`/api/packages/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Xóa thất bại');
      setMessage('Đã gỡ bỏ gói ứng dụng');
      if (lastUploaded?.id === id) {
        try {
          sessionStorage.removeItem(LAST_RELEASE_KEY);
        } catch {
          /* ignore */
        }
      }
      await fetchPackages();
    } catch (err) {
      setError(err.message);
    }
  };

  const copyLink = (url) => {
    const full = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(full);
    setMessage('Đã sao chép link phân phối');
  };

  const handleToggleActive = async (pkg, turnOn) => {
    if (activationReady === false) {
      setError('Server chưa cập nhật — dừng server cũ (Ctrl+C) rồi chạy lại: npm run mobile');
      return;
    }

    setPackages((prev) =>
      prev.map((p) => ({
        ...p,
        active: turnOn ? p.id === pkg.id : p.id === pkg.id ? false : p.active,
      }))
    );

    try {
      const res = await fetch(`/api/packages/${encodeURIComponent(pkg.id)}/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: turnOn }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Không thể đổi trạng thái kích hoạt');

      setMessage(
        turnOn
          ? `Đã kích hoạt "${pkg.name}" — chỉ gói này được tải`
          : `Đã tắt kích hoạt "${pkg.name}" — không thể tải gói này`
      );
      await fetchPackages();
    } catch (err) {
      setError(err.message);
      await fetchPackages();
    }
  };

  const primaryLan =
    androidHotspotLinks[0] || otherLanLinks.find((l) => !l.url.includes('10.152.')) || mobileLinks[0];

  const renderDropzone = (platform, label, hint, inputId) => {
    const showRelease = lastUploaded?.platform === platform && !uploading;
    const platformLabel = platform === 'ios' ? 'iOS' : 'Android';

    return (
    <div
      className={`dropzone dropzone-${platform} ${dragOver === platform ? 'dropzone-active' : ''} ${uploading === platform ? 'dropzone-busy' : ''} ${showRelease ? 'dropzone-done' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(platform);
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => handleDrop(e, platform)}
    >
      <input
        key={`${inputId}-${inputKey[platform]}`}
        type="file"
        accept={platform === 'ios' ? '.ipa' : '.apk,application/vnd.android.package-archive'}
        id={inputId}
        hidden
        disabled={!!uploading}
        onChange={(e) => {
          uploadFile(e.target.files[0], platform);
          e.target.value = '';
        }}
      />
      <label htmlFor={inputId} className="dropzone-label">
        <span className={`dropzone-chip dropzone-chip-${platform}`}>{platformLabel}</span>
        {uploading === platform ? (
          <>
            <span className="spinner" />
            <strong>Đang tải lên...</strong>
            <span className="dropzone-sub">Vui lòng đợi, không đóng trang</span>
          </>
        ) : showRelease ? (
          <>
            <span className="dropzone-done-icon">✓</span>
            <strong>{freshUpload ? 'Phát hành thành công' : 'Bản hiện tại'}</strong>
            <span className="dropzone-filename">{lastUploaded.name}</span>
            <span className="dropzone-sub">{lastUploaded.size}</span>
          </>
        ) : (
          <>
            <span className="dropzone-icon-wrap">
              <span className="dropzone-icon">
                {platform === 'ios' ? <IconApple /> : <IconAndroid />}
              </span>
            </span>
            <strong>{label}</strong>
            <span className="dropzone-sub">{hint}</span>
            <span className="dropzone-cta">Chọn file hoặc kéo thả</span>
          </>
        )}
      </label>
    </div>
  );
  };

  const q = query.trim().toLowerCase();
  const visible = q ? filtered.filter((p) => p.name.toLowerCase().includes(q)) : filtered;
  const activeCount = packages.filter((p) => p.active).length;

  const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navItems = [
    { id: 'overview', label: 'Tổng quan', icon: <IconGrid /> },
    { id: 'release', label: 'Phát hành gói', icon: <IconUpload /> },
    { id: 'library', label: 'Kho phân phối', icon: <IconBox /> },
    { id: 'mobile', label: 'Truy cập di động', icon: <IconPhone /> },
  ];

  const stats = [
    { label: 'Tổng phát hành', value: packages.length, icon: <IconBox />, tone: 'blue' },
    { label: 'APK Android', value: androidCount, icon: <IconAndroid />, tone: 'green' },
    { label: 'IPA iOS', value: iosCount, icon: <IconApple />, tone: 'violet' },
    { label: 'Đang kích hoạt', value: activeCount, icon: <IconBolt />, tone: 'amber' },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__logo">
            <IconRocket />
          </span>
          <div>
            <p className="brand__name">App Deploy Pro</p>
            <p className="brand__tag">Enterprise Distribution</p>
          </div>
        </div>

        <nav className="nav" aria-label="Điều hướng">
          <p className="nav__label">Menu</p>
          {navItems.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="nav__item" onClick={scrollTo(n.id)}>
              <span className="nav__icon">{n.icon}</span>
              {n.label}
            </a>
          ))}
        </nav>

        <div className="sidebar__bottom">
          <div className="status-card">
            <span className="status-dot" />
            <div>
              <p className="status-card__title">Hệ thống hoạt động</p>
              <p className="status-card__sub">Kho phân phối trực tuyến</p>
            </div>
          </div>
          <div className="owner">
            <img src={AVATAR} alt={CREATOR} className="owner__avatar" />
            <div>
              <p className="owner__name">{CREATOR}</p>
              <p className="owner__role">Product Owner</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar" id="overview">
          <div>
            <h1 className="topbar__title">Tổng quan phát hành</h1>
            <p className="topbar__sub">
              Phân phối <b>APK</b> &amp; <b>IPA</b> — nội bộ, hotspot hoặc link bảo mật.
            </p>
          </div>
          <div className="topbar__right">
            <span className="pill pill-live">Live</span>
            <a href="#release" className="btn btn-primary" onClick={scrollTo('release')}>
              + Phát hành gói mới
            </a>
          </div>
        </header>

        {activationReady === false && (
          <div className="alert alert-warn" role="status">
            Server đang chạy bản cũ — kích hoạt gói chưa hoạt động. Dừng terminal cũ (Ctrl+C) rồi chạy{' '}
            <code>npm run mobile</code>.
          </div>
        )}

        {(message || error) && (
          <div
            className={`alert ${error ? 'alert-error' : 'alert-success'}`}
            onClick={() => {
              setMessage(null);
              setError(null);
            }}
            role="status"
          >
            {error || message}
          </div>
        )}

        <section className="stats">
          {stats.map((s) => (
            <div key={s.label} className="stat">
              <span className={`stat__icon stat__icon--${s.tone}`}>{s.icon}</span>
              <div>
                <p className="stat__val">{s.value}</p>
                <p className="stat__lbl">{s.label}</p>
              </div>
            </div>
          ))}
        </section>

        <div className="split">
          <section className="card" id="release">
            <div className="card__head">
              <div>
                <h2>Phát hành gói mới</h2>
                <p>Kéo thả bản build lên kho phân phối — có hiệu lực ngay.</p>
              </div>
            </div>
            <div className="upload-dual">
              {renderDropzone('android', 'Upload APK — Android', 'Định dạng .apk — tối đa 500MB', 'apk-input')}
              {renderDropzone('ios', 'Upload IPA — iOS', 'Định dạng .ipa — tối đa 500MB', 'ipa-input')}
            </div>

            {lastUploaded && (
              <div className="release-card">
                <div className="release-card__icon">
                  {lastUploaded.platform === 'ios' ? <IconApple /> : <IconAndroid />}
                </div>
                <div className="release-card__body">
                  <span className="release-card__tag">
                    {freshUpload ? 'Vừa phát hành thành công' : 'Bản phát hành gần nhất'}
                  </span>
                  <p className="release-card__name">{lastUploaded.name}</p>
                  <p className="release-card__meta">
                    {lastUploaded.size}
                    <span className={`platform-badge platform-${lastUploaded.platform}`}>
                      {lastUploaded.platform === 'ios' ? 'iOS' : 'Android'}
                    </span>
                  </p>
                </div>
                <div className="release-card__actions">
                  {lastUploaded.active ? (
                    <a className="btn btn-primary btn-sm" href={lastUploaded.downloadUrl} download={lastUploaded.name}>
                      Tải xuống
                    </a>
                  ) : (
                    <span className="btn btn-disabled btn-sm" title="Bật kích hoạt trong kho phân phối">
                      Chưa kích hoạt
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={!lastUploaded.active}
                    onClick={() => lastUploaded.active && copyLink(lastUploaded.downloadUrl)}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => listRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Xem trong kho
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="card" id="mobile">
            <div className="card__head">
              <div>
                <h2>Truy cập di động</h2>
                <p>Quét QR hoặc chia sẻ link để cài đặt.</p>
              </div>
            </div>
            <div className="mobile-body">
              {primaryLan && (
                <div className="mobile-block mobile-block-primary">
                  <div className="mobile-block__top">
                    <div className="mobile-block__info">
                      <span className="block-tag">Khuyên dùng</span>
                      <p className="block-title">Hotspot / mạng LAN</p>
                      <a className="link-primary" href={primaryLan.url}>
                        {primaryLan.url}
                      </a>
                      <span className="block-hint">{primaryLan.label}</span>
                    </div>
                    <img className="qr-inline" src={qrSrc(primaryLan.url)} alt="QR LAN" width={104} height={104} />
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => copyLink(primaryLan.url)}>
                    Sao chép link
                  </button>
                </div>
              )}

              {publicUrl && (
                <div className="mobile-block">
                  <div className="mobile-block__top">
                    <div className="mobile-block__info">
                      <span className="block-tag">Internet</span>
                      <p className="block-title">Link phân phối công khai</p>
                      <a className="link-primary" href={publicUrl}>
                        {publicUrl}
                      </a>
                    </div>
                    <img className="qr-inline" src={qrSrc(publicUrl)} alt="QR public" width={104} height={104} />
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => copyLink(publicUrl)}>
                    Sao chép link
                  </button>
                  {/loca\.lt/i.test(publicUrl) && (
                    <p className="block-hint warn">Link loca.lt: nhập IP tunnel trên màn hình đầu rồi bấm Continue.</p>
                  )}
                </div>
              )}

              {!publicUrl && (
                <p className="block-hint">
                  Chạy <code>npm run phone</code> trên Mac để tạo link https (3G/4G hoặc WiFi công ty).
                </p>
              )}
            </div>
          </aside>
        </div>

        <section className="card card--table" id="library" ref={listRef}>
          <div className="card__head card__head--row">
            <div>
              <h2>Kho phân phối</h2>
              <p>Bật kích hoạt 1 gói — chỉ gói đó mới tải được.</p>
            </div>
            <div className="toolbar">
              <input
                type="search"
                className="search"
                placeholder="Tìm theo tên file…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Tìm gói"
              />
              <div className="filter-tabs">
                {[
                  ['all', `Tất cả (${packages.length})`],
                  ['android', `Android (${androidCount})`],
                  ['ios', `iOS (${iosCount})`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`filter-tab ${filter === key ? 'active' : ''}`}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <p className="empty-state">Đang tải dữ liệu...</p>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <p>
                {q
                  ? 'Không tìm thấy gói phù hợp.'
                  : `Chưa có gói ${filter === 'ios' ? 'IPA' : filter === 'android' ? 'APK' : 'ứng dụng'} trong kho.`}
              </p>
              <p className="muted">Tải lên file ở mục Phát hành gói mới.</p>
            </div>
          ) : (
            <div className="table" role="table">
              <div className="table__row table__row--head" role="row">
                <span>Gói ứng dụng</span>
                <span>Dung lượng</span>
                <span>Ngày phát hành</span>
                <span>Kích hoạt</span>
                <span className="table__right">Thao tác</span>
              </div>
              {visible.map((pkg) => (
                <div
                  key={pkg.id}
                  role="row"
                  className={`table__row ${highlightId === pkg.id ? 'row-new' : ''} ${pkg.active ? 'row-active' : ''}`}
                >
                  <div className="cell cell--file">
                    <div className={`apk-file-icon ${pkg.platform === 'ios' ? 'apk-file-icon-ios' : ''}`}>
                      {pkg.platform === 'ios' ? <IconApple /> : <IconAndroid />}
                    </div>
                    <div className="cell__text">
                      <strong>{pkg.name}</strong>
                      <span className="cell__badges">
                        <span className={`platform-badge platform-${pkg.platform}`}>
                          {pkg.platform === 'ios' ? 'iOS' : 'Android'}
                        </span>
                        {pkg.active && <span className="active-badge">Đang phát hành</span>}
                      </span>
                    </div>
                  </div>
                  <div className="cell" data-label="Dung lượng">
                    {pkg.size}
                  </div>
                  <div className="cell" data-label="Phát hành">
                    {formatDate(pkg.uploadedAt)}
                  </div>
                  <div className="cell">
                    <label
                      className="activate-toggle"
                      title={pkg.active ? 'Tắt kích hoạt' : 'Kích hoạt gói này (chỉ 1 gói)'}
                    >
                      <input
                        type="checkbox"
                        className="activate-toggle__input"
                        checked={!!pkg.active}
                        onChange={(e) => handleToggleActive(pkg, e.target.checked)}
                      />
                      <span className="activate-toggle__track" aria-hidden="true" />
                      <span className="activate-toggle__label">{pkg.active ? 'Bật' : 'Tắt'}</span>
                    </label>
                  </div>
                  <div className="cell cell--actions">
                    {pkg.active ? (
                      <a className="btn btn-primary btn-sm" href={pkg.downloadUrl} download={pkg.name}>
                        Tải xuống
                      </a>
                    ) : (
                      <span className="btn btn-disabled btn-sm" title="Bật kích hoạt để cho phép tải">
                        Tải xuống
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={!pkg.active}
                      onClick={() => pkg.active && copyLink(pkg.downloadUrl)}
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost-danger btn-sm"
                      onClick={() => handleDelete(pkg.id, pkg.name)}
                    >
                      Gỡ bỏ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="footer">
          <span>Sản phẩm thuộc tạo bởi {CREATOR}</span>
          <span>© {new Date().getFullYear()} App Deploy Pro · Confidential distribution</span>
        </footer>
      </div>
    </div>
  );
}
