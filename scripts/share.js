import { spawn } from 'child_process';

const PORT = process.env.PORT || 8080;

async function checkServer() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/network`);
    return res.ok;
  } catch {
    return false;
  }
}

function runTunnel(name, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['--yes', ...args], { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    let printed = false;

    const onData = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);

      const patterns = [
        /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
        /https:\/\/[a-z0-9-]+\.loca\.lt/,
        /your url is:\s*(https:\/\/\S+)/i,
      ];

      for (const re of patterns) {
        const match = text.match(re);
        if (match && !printed) {
          printed = true;
          const url = match[1] || match[0];
          console.log('\n════════════════════════════════════════');
          console.log('📱 MỞ TRÊN ĐIỆN THOẠI (mọi mạng WiFi/4G):');
          console.log(`   ${url}`);
          console.log('════════════════════════════════════════\n');
          resolve({ proc, url });
          return;
        }
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (!printed) reject(new Error(`${name} thất bại (code ${code})`));
    });

    setTimeout(() => {
      if (!printed) reject(new Error(`${name} timeout`));
    }, 60000);
  });
}

async function main() {
  const ok = await checkServer();
  if (!ok) {
    console.error(`\n❌ Server chưa chạy trên cổng ${PORT}. Chạy: npm run dev\n`);
    process.exit(1);
  }

  console.log('\n🌐 Đang tạo link public...\n');

  try {
    await runTunnel('cloudflared', [
      'cloudflared',
      'tunnel',
      '--protocol',
      'http2',
      '--url',
      `http://127.0.0.1:${PORT}`,
    ]);
  } catch {
    console.log('\n↪️  Cloudflare bị chặn, thử localtunnel...\n');
    try {
      await runTunnel('localtunnel', ['localtunnel', '--port', String(PORT)]);
    } catch (err) {
      console.error('\n❌ Không tạo được tunnel (mạng công ty chặn).');
      console.error('   → Dùng Personal Hotspot iPhone (xem hướng dẫn bên dưới)\n');
      process.exit(1);
    }
  }
}

main();
