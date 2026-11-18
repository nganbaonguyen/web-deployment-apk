import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const URL_FILE = path.join(ROOT, 'uploads', '.public-url');
const PORT = Number(process.env.PORT) || 8080;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitServer(max = 40) {
  for (let i = 0; i < max; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
}

function startServer() {
  return spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', MOBILE: '1' },
    stdio: 'inherit',
    detached: false,
  });
}

function savePublicUrl(url) {
  fs.mkdirSync(path.dirname(URL_FILE), { recursive: true });
  fs.writeFileSync(URL_FILE, url.trim());
}

function clearPublicUrl() {
  try {
    fs.unlinkSync(URL_FILE);
  } catch {
    /* ignore */
  }
}

function printQr(url) {
  try {
    const qr = require('qrcode-terminal');
    console.log(`\n   Quét QR bằng camera Android:\n`);
    qr.generate(url, { small: true });
  } catch {
    /* optional */
  }
}

const URL_PATTERNS = [
  /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
  /https:\/\/[a-z0-9-]+\.loca\.lt/i,
  /https:\/\/[a-z0-9-]+\.lhr\.life/i,
  /https:\/\/[a-z0-9.-]+\.localhost\.run/i,
  /https:\/\/[a-z0-9-]+\.bore\.pub/i,
  /your url is:\s*(https:\/\/\S+)/i,
  /(https:\/\/[^\s]+)\s+has been assigned/i,
];

function runTunnel(provider, command, args, useShell = true) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: useShell });
    let done = false;

    const onData = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      if (done) return;
      for (const re of URL_PATTERNS) {
        const m = text.match(re);
        if (m) {
          done = true;
          const url = (m[1] || m[0]).trim().replace(/[)\]}>]+$/, '');
          resolve({ proc, url });
          return;
        }
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (!done) reject(new Error(`${provider} thất bại (${code})`));
    });

    setTimeout(() => {
      if (!done) reject(new Error(`${provider} timeout`));
    }, 120000);
  });
}

async function createTunnel() {
  const tries = [
    ['cloudflared', 'npx', ['--yes', 'cloudflared', 'tunnel', '--protocol', 'http2', '--url', `http://127.0.0.1:${PORT}`]],
    ['bore', 'npx', ['--yes', 'bore', 'local', String(PORT), '--to', 'bore.pub']],
    [
      'localhost.run',
      'ssh',
      ['-o', 'StrictHostKeyChecking=no', '-o', 'ServerAliveInterval=30', '-R', `80:127.0.0.1:${PORT}`, 'localhost.run'],
      false,
    ],
    ['localtunnel', 'npx', ['--yes', 'localtunnel', '--port', String(PORT)]],
  ];

  for (const [name, cmd, args, shell] of tries) {
    try {
      console.log(`\n🌐 Đang tạo link (${name})...\n`);
      return await runTunnel(name, cmd, args, shell !== false);
    } catch {
      console.log(`↪️  ${name} không được, thử cách khác...\n`);
    }
  }
  return null;
}

function printLocaltunnelBypass(url) {
  if (!/loca\.lt/i.test(url)) return;
  console.log('\n──────────────────────────────────────────────────');
  console.log('📌 LOCALTUNNEL: Lần đầu vào có màn nhập IP (bình thường)');
  console.log('   1. Đọc dòng « This tunnel is hosted by: xxx.xxx.xxx.xxx »');
  console.log('   2. Nhập IP đó vào ô « IP Address » trên điện thoại');
  console.log('   3. Bấm nút xanh → sau đó mới vào được trang APK');
  console.log('   (Nếu khó chịu: Ctrl+C rồi chạy lại — thử cloudflared/bore trước)');
  console.log('──────────────────────────────────────────────────\n');
}

async function main() {
  clearPublicUrl();

  console.log('\n📱 Link cho Android — WiFi công ty chặn máy ↔ máy\n');
  console.log('   (Cùng WiFi vẫn không mở IP — cần link https bên dưới)\n');

  let serverProc = null;
  const running = await waitServer(2);

  if (!running) {
    console.log('🚀 Khởi động server...\n');
    serverProc = startServer();
    const ok = await waitServer(40);
    if (!ok) {
      console.error('❌ Server không chạy được');
      process.exit(1);
    }
  }

  const tunnel = await createTunnel();

  if (!tunnel) {
    console.log('\n══════════════════════════════════════════════════');
    console.log('❌ Mạng công ty chặn mọi tunnel.');
    console.log('\n✅ Giải pháp: Mac tạo WiFi riêng (không cần USB debugging)');
    console.log('   1. Mac: Cài đặt → Chung → Chia sẻ → Chia sẻ Internet');
    console.log('   2. Chia từ WiFi → cho thiết bị: WiFi');
    console.log('   3. Android NGẮT WiFi công ty, kết nối WiFi Mac phát');
    console.log('   4. Mở: http://192.168.2.1:8080');
    console.log('\n   Hoặc: Hotspot điện thoại cá nhân → Mac + Android cùng kết nối');
    console.log('══════════════════════════════════════════════════\n');
    process.exit(1);
  }

  savePublicUrl(tunnel.url);

  console.log('\n══════════════════════════════════════════════════');
  console.log('✅ LINK CHO ANDROID (cùng WiFi công ty vẫn dùng được):');
  console.log(`\n   👉  ${tunnel.url}\n`);
  console.log('   Gửi link qua Zalo/Telegram hoặc quét QR');
  console.log('══════════════════════════════════════════════════');
  printQr(tunnel.url);
  printLocaltunnelBypass(tunnel.url);
  console.log('\n   Giữ terminal này mở. Ctrl+C để dừng.\n');

  const cleanup = () => {
    clearPublicUrl();
    try {
      tunnel.proc.kill();
    } catch {
      /* ignore */
    }
    if (serverProc) serverProc.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main();
