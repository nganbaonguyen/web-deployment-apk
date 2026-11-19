/* Đăng nhập (HTTP Basic) cho web quản trị khi đưa server lên internet.
 *
 * Bật bằng biến môi trường ADMIN_PASSWORD (và ADMIN_USER, mặc định "admin"). Không đặt thì tắt đăng nhập
 * (dùng khi chạy trên máy cá nhân như trước).
 *
 * Luôn công khai (chỉ GET/HEAD) để người dùng và app tải được mà không cần mật khẩu:
 *   /healthz                          kiểm tra server sống
 *   /bundles/...                      file bundle mini app (đã chặn bản không Active ở bundles.js)
 *   /api/[apps/<id>/]download/<file>  tải APK/IPA (chỉ gói đang kích hoạt)
 *   /api/[apps/<id>/]bundles/<module>/resolve   app hỏi nên nạp bản bundle nào
 * Mọi thứ khác (giao diện, danh sách, upload, xóa, bật/tắt...) cần đăng nhập.
 */

import crypto from 'crypto';

const PUBLIC_GET = [
  /^\/healthz$/,
  /^\/bundles\//,
  /^\/api\/(apps\/[^/]+\/)?download\//,
  /^\/api\/(apps\/[^/]+\/)?bundles\/[^/]+\/resolve$/,
];

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest();

export function createAdminAuth({ user = 'admin', password = '' } = {}) {
  if (!password) return (_req, _res, next) => next();

  const expectedUser = sha256(user);
  const expectedPass = sha256(password);

  return (req, res, next) => {
    const readOnly = req.method === 'GET' || req.method === 'HEAD';
    if (req.method === 'OPTIONS' || (readOnly && PUBLIC_GET.some((re) => re.test(req.path)))) {
      return next();
    }

    const header = req.get('authorization') || '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      if (i >= 0) {
        const okUser = crypto.timingSafeEqual(sha256(decoded.slice(0, i)), expectedUser);
        const okPass = crypto.timingSafeEqual(sha256(decoded.slice(i + 1)), expectedPass);
        if (okUser && okPass) return next();
      }
    }

    res.set('WWW-Authenticate', 'Basic realm="App Deploy Pro", charset="UTF-8"');
    res.status(401).json({ error: 'Cần đăng nhập' });
  };
}
