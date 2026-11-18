import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8080;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitServer(max = 30) {
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

function runAdbReverse() {
  try {
    const devices = execSync('adb devices', { encoding: 'utf8' });
    const connected = devices.split('\n').filter((l) => l.trim().endsWith('device'));
    if (connected.length === 0) {
      console.log('\n⚠️  Chưa thấy Android qua USB.');
      console.log('   → Bật USB debugging, chấp nhận "Allow debugging" trên điện thoại\n');
      return false;
    }
    execSync(`adb reverse tcp:${PORT} tcp:${PORT}`, { stdio: 'inherit' });
    return true;
  } catch {
    console.log('\n⚠️  Không có adb. Cài Android Platform Tools hoặc dùng WiFi.\n');
    return false;
  }
}

async function main() {
  let serverProc = null;

  const up = await waitServer(2);
  if (!up) {
    console.log('\n🚀 Khởi động server (production)...\n');
    serverProc = spawn('node', ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production', MOBILE: '1' },
      stdio: 'inherit',
      detached: false,
    });
    const ok = await waitServer(40);
    if (!ok) {
      console.error('❌ Server không khởi động được');
      process.exit(1);
    }
  }

  const ok = runAdbReverse();

  console.log('\n══════════════════════════════════════════════════');
  if (ok) {
    console.log('✅ ANDROID SẴN SÀNG — mở Chrome trên điện thoại:');
    console.log(`\n   👉  http://localhost:${PORT}\n`);
    console.log('   (adb reverse — không cần WiFi, không bị chặn mạng công ty)');
  } else {
    console.log('📱 Dùng WiFi/Hotspot — chạy: npm run mobile');
    console.log('   Mở link in ra terminal (ưu tiên 172.20.10.x)');
  }
  console.log('══════════════════════════════════════════════════\n');

  if (serverProc) {
    process.on('SIGINT', () => {
      serverProc.kill();
      process.exit(0);
    });
  }
}

main();
