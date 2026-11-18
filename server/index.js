import express from 'express';
import cors from 'cors';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createServer as createViteServer } from 'vite';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const ACTIVE_FILE = path.join(UPLOAD_DIR, '.active-package.json');
const DIST_DIR = path.join(ROOT, 'dist');
const forceProduction = process.env.MOBILE === '1' || process.env.NODE_ENV === 'production';
const isDev = !forceProduction && process.env.NODE_ENV !== 'production';
const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

function getPackageType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.apk')) return 'android';
  if (lower.endsWith('.ipa')) return 'ios';
  return null;
}

function isAppPackage(filename) {
  return getPackageType(filename) !== null;
}

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAppPackage(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file .apk hoặc .ipa'));
    }
  },
});

const app = express();
app.use(cors());
app.use(express.json());

function resolvePackageFile(id) {
  const decoded = decodeURIComponent(id);
  const filePath = path.join(UPLOAD_DIR, path.basename(decoded));
  if (!fs.existsSync(filePath) || !isAppPackage(path.basename(filePath))) return null;
  return filePath;
}

function getMimeType(filename) {
  return getPackageType(filename) === 'ios'
    ? 'application/octet-stream'
    : 'application/vnd.android.package-archive';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readActiveId() {
  try {
    const raw = fs.readFileSync(ACTIVE_FILE, 'utf8');
    const data = JSON.parse(raw);
    const id = data?.activeId;
    if (!id || typeof id !== 'string') return null;
    const filePath = path.join(UPLOAD_DIR, path.basename(id));
    if (!fs.existsSync(filePath) || !isAppPackage(path.basename(id))) {
      clearActiveId();
      return null;
    }
    return path.basename(id);
  } catch {
    return null;
  }
}

function setActiveId(id) {
  const base = path.basename(id);
  const filePath = path.join(UPLOAD_DIR, base);
  if (!fs.existsSync(filePath) || !isAppPackage(base)) {
    throw new Error('Gói không tồn tại');
  }
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ activeId: base }, null, 2));
  return base;
}

function clearActiveId() {
  try {
    if (fs.existsSync(ACTIVE_FILE)) fs.unlinkSync(ACTIVE_FILE);
  } catch {
    /* ignore */
  }
}

function isPackageActive(id) {
  const activeId = readActiveId();
  if (!activeId) return false;
  return path.basename(id) === activeId;
}

const SKIP_IFACE = /^(lo\d*|utun|tun\d|tap\d|awdl|llw|vmenet|docker|veth|gif|stf)/i;

function ipPriority(address) {
  if (address.startsWith('192.168.43.') || address.startsWith('192.168.4.')) return 0;
  if (address.startsWith('192.168.2.')) return 1;
  if (address.startsWith('172.20.10.')) return 2;
  if (address.startsWith('192.168.')) return 3;
  if (address.startsWith('172.')) return 4;
  if (address.startsWith('10.152.')) return 90;
  if (address.startsWith('10.')) return 50;
  return 10;
}

function ifaceLabel(address) {
  if (address.startsWith('192.168.43.') || address.startsWith('192.168.4.')) {
    return 'Android phát 4G — mở link này trên chính điện thoại ⭐';
  }
  if (address.startsWith('192.168.2.')) return 'Mac chia WiFi — Android kết nối WiFi Mac';
  if (address.startsWith('10.152.')) return 'WiFi công ty (thường bị chặn mobile)';
  if (address.startsWith('172.20.10.')) return 'Hotspot iPhone — Mac + Android cùng hotspot';
  return 'Mạng LAN';
}

function getLanIps() {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    if (SKIP_IFACE.test(name)) continue;
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({
          name,
          address: net.address,
          priority: ipPriority(net.address),
          label: ifaceLabel(net.address),
        });
      }
    }
  }
  ips.sort((a, b) => a.priority - b.priority);
  return ips;
}

function readPublicUrl() {
  try {
    const file = path.join(UPLOAD_DIR, '.public-url');
    const url = fs.readFileSync(file, 'utf8').trim();
    return url.startsWith('http') ? url : null;
  } catch {
    return null;
  }
}

function getNetworkInfo() {
  const ips = getLanIps();
  const urls = ips.map((n) => ({
    url: `http://${n.address}:${PORT}`,
    label: n.label,
    address: n.address,
    iface: n.name,
  }));
  const publicUrl = readPublicUrl();
  return {
    ips,
    port: PORT,
    urls: urls.map((u) => u.url),
    links: urls,
    primaryUrl: publicUrl || urls[0]?.url || null,
    publicUrl,
    mode: isDev ? 'development' : 'production',
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, features: { packageActivation: true }, ...getNetworkInfo() });
});

app.get('/api/download/:id', (req, res) => {
  const filePath = resolvePackageFile(req.params.id);
  if (!filePath) {
    return res.status(404).json({ error: 'File không tồn tại' });
  }
  if (!isPackageActive(req.params.id)) {
    return res.status(403).json({
      error: 'Gói chưa được kích hoạt. Bật kích hoạt trong kho phân phối để cho phép tải.',
    });
  }
  const filename = path.basename(filePath).replace(/^\d+-/, '');
  res.setHeader('Content-Type', getMimeType(filename));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

function listPackages() {
  const activeId = readActiveId();
  const files = fs.readdirSync(UPLOAD_DIR).filter((f) => isAppPackage(f));
  return files.map((filename) => {
    const filePath = path.join(UPLOAD_DIR, filename);
    const stat = fs.statSync(filePath);
    const displayName = filename.replace(/^\d+-/, '');
    const platform = getPackageType(displayName);
    return {
      id: filename,
      name: displayName,
      platform,
      active: filename === activeId,
      size: formatSize(stat.size),
      sizeBytes: stat.size,
      uploadedAt: stat.mtime.toISOString(),
      downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
    };
  });
}

app.get('/api/network', (_req, res) => {
  res.json(getNetworkInfo());
});

app.get('/api/packages', (_req, res) => {
  const list = listPackages();
  list.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const activeId = readActiveId();
  res.json({ packages: list, activeId });
});

app.get('/api/apks', (_req, res) => {
  const list = listPackages().filter((p) => p.platform === 'android');
  res.json(list);
});

app.post('/api/upload', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'apk', maxCount: 1 },
  { name: 'ipa', maxCount: 1 },
]), (req, res) => {
  const uploaded =
    req.files?.file?.[0] || req.files?.apk?.[0] || req.files?.ipa?.[0] || req.file;

  if (!uploaded) {
    return res.status(400).json({ error: 'Không có file được gửi lên (.apk hoặc .ipa)' });
  }

  const platform = getPackageType(uploaded.originalname);
  if (!platform) {
    return res.status(400).json({ error: 'Chỉ chấp nhận file .apk hoặc .ipa' });
  }

  setActiveId(uploaded.filename);

  res.json({
    message: 'Upload thành công',
    file: {
      id: uploaded.filename,
      name: uploaded.originalname,
      platform,
      active: true,
      size: formatSize(uploaded.size),
      downloadUrl: `/api/download/${encodeURIComponent(uploaded.filename)}`,
    },
  });
});

function handlePackageActive(req, res) {
  const id = path.basename(decodeURIComponent(req.params.id));
  const filePath = path.join(UPLOAD_DIR, id);
  if (!fs.existsSync(filePath) || !isAppPackage(id)) {
    return res.status(404).json({ error: 'Gói không tồn tại' });
  }

  const wantActive = req.body?.active !== false;

  try {
    if (wantActive) {
      setActiveId(id);
    } else if (isPackageActive(id)) {
      clearActiveId();
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Không lưu được trạng thái kích hoạt' });
  }

  res.json({
    message: wantActive ? 'Đã kích hoạt gói phân phối' : 'Đã tắt kích hoạt — không thể tải gói này',
    activeId: readActiveId(),
  });
}

app.post('/api/packages/:id/active', handlePackageActive);
app.patch('/api/packages/:id/active', handlePackageActive);

app.delete('/api/packages/:id', (req, res) => {
  const base = path.basename(decodeURIComponent(req.params.id));
  const filePath = path.join(UPLOAD_DIR, base);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File không tồn tại' });
  }
  if (isPackageActive(base)) clearActiveId();
  fs.unlinkSync(filePath);
  res.json({ message: 'Đã xóa file' });
});

app.delete('/api/apks/:id', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, path.basename(decodeURIComponent(req.params.id)));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File không tồn tại' });
  }
  fs.unlinkSync(filePath);
  res.json({ message: 'Đã xóa file' });
});

app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File quá lớn (tối đa 500MB)' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Trường upload không hợp lệ — hãy restart server: npm run mobile' });
  }
  res.status(400).json({ error: err.message || 'Lỗi upload' });
});

async function setupFrontend() {
  if (isDev) {
    const vite = await createViteServer({
      root: ROOT,
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        allowedHosts: true,
        strictPort: true,
        hmr: { port: PORT, clientPort: PORT },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    return;
  }

  if (!fs.existsSync(DIST_DIR)) {
    console.error('\n❌ Chưa build frontend. Chạy: npm run build\n');
    process.exit(1);
  }

  app.use(express.static(DIST_DIR, { maxAge: 0 }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

function printQr(url) {
  try {
    const qr = require('qrcode-terminal');
    console.log(`\n   QR — ${url}\n`);
    qr.generate(url, { small: true });
  } catch {
    /* optional */
  }
}

function printStartup() {
  const info = getNetworkInfo();
  console.log('\n══════════════════════════════════════════════════');
  console.log('✅ App Deploy Pro (APK + IPA)', isDev ? '(dev)' : '(production — tốt cho mobile)');
  console.log('══════════════════════════════════════════════════');
  console.log(`\n   💻 Mac:     http://localhost:${PORT}`);

  if (info.links.length) {
    console.log('\n   📱 Android — WiFi / Hotspot (quét QR trên web):');
    info.links.forEach((l) => {
      const mark = l.label.includes('Hotspot') ? ' ⭐' : '';
      console.log(`      ${l.url}${mark}`);
      console.log(`         (${l.label})`);
    });
  }

  console.log('\n   📲 Android KHÔNG cần USB debugging:');
  console.log('      Chạy: npm run phone');
  console.log('      → Quét QR / mở link https trên điện thoại');
  console.log('══════════════════════════════════════════════════\n');

  if (info.publicUrl) {
    printQr(info.publicUrl);
  } else {
    const best =
      info.links.find((l) => l.label.includes('Mac chia')) ||
      info.links.find((l) => l.label.includes('Hotspot')) ||
      info.links[0];
    if (best) printQr(best.url);
  }
}

async function start() {
  await setupFrontend();

  app.listen(PORT, HOST, () => {
    printStartup();
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
