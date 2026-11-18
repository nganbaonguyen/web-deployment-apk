import { useEffect } from 'react';

/* Hộp thoại dùng chung (tab Bundle, thêm ứng dụng). Đóng bằng Esc hoặc bấm nền tối. */

const icon = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function IconClose() {
  return (
    <svg {...icon}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconDefault() {
  return (
    <svg {...icon} width="22" height="22">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M17.5 14v7M14 17.5h7" />
    </svg>
  );
}

export default function Modal({ title, subtitle, hint, icon: headIcon, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="bd-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bd-modal ${wide ? 'bd-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="bd-modal__head">
          <span className="bd-modal__icon">{headIcon || <IconDefault />}</span>
          <div className="bd-modal__title">
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {hint && <p className="bd-modal__hint">{hint}</p>}
          <button type="button" className="bd-icon-btn" onClick={onClose} aria-label="Đóng">
            <IconClose />
          </button>
        </header>
        <div className="bd-modal__body">{children}</div>
        {footer && <footer className="bd-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}
