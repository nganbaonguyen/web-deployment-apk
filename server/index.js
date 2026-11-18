import express from 'express';
import cors from 'cors';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createServer as createViteServer } from 'vite';
import { createAppsStore } from './apps.js';
import { createPackagesRouter } from './packages.js';
import { createBundlesRouter, createBundleStatic } from './bundles.js';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DIST_DIR = path.join(ROOT, 'dist');
const forceProduction = process.env.MOBILE === '1' || process.env.NODE_ENV === 'production';
const isDev = !forceProduction && process.env.NODE_ENV !== 'production';
const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

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

app.get('/api/network', (_req, res) => {
  res.json(getNetworkInfo());
});

// Nhiều ứng dụng: /api/apps (danh sách, thêm, xóa), /api/apps/:appId/... cho từng ứng dụng.
// /api/... (không có /apps/<id>) luôn là ứng dụng mặc định, giữ link đã phát hành hoạt động.
const apps = createAppsStore({ root: ROOT });
apps.register(app);
app.use('/bundles', createBundleStatic(apps));
const packagesRouter = createPackagesRouter();
const bundlesRouter = createBundlesRouter();
app.use('/api/apps/:appId', apps.requireApp, packagesRouter, bundlesRouter);
app.use('/api', apps.useDefaultApp, packagesRouter, bundlesRouter);

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
