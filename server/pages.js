/* ─────────────────────── Đưa bundle lên GitHub Pages ───────────────────────
 * Mục tiêu: app trên điện thoại nạp mini app từ một địa chỉ https CỐ ĐỊNH trên internet,
 * không phụ thuộc IP máy Mac hay WiFi. Mỗi lần bundle đổi (upload, tick LIVE, xóa...) server sinh một
 * thư mục tĩnh rồi `git push --force` lên nhánh gh-pages của repo Pages:
 *
 *   <appId>/resolve/<module>/<platform>/<env>.json     giống kết quả API resolve (manifestUrl trỏ về Pages)
 *   <appId>/bundles/<module>/<id>/<platform>/...       mọi bản Active (như web: bản không Active không được phục vụ)
 *
 * Nhánh gh-pages luôn chỉ có MỘT commit (git init lại mỗi lần) nên repo không phình theo lịch sử.
 * Cấu hình lưu ở data/pages.json: { repo, auto }. Đăng nhập git dùng sẵn của máy (keychain/ssh), không lưu token. */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readRegistry, pickServed, BUNDLE_PLATFORMS, BUNDLE_ENVS } from './bundles.js';

const execFileAsync = promisify(execFile);
const DEBOUNCE_MS = 2000;
const BRANCH = 'gh-pages';
const REPO_RE = /^(https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?|git@github\.com:[\w.-]+\/[\w.-]+?(\.git)?)$/;

/** Từ địa chỉ repo suy ra địa chỉ Pages: github.com/OWNER/NAME -> https://OWNER.github.io/NAME */
export function pagesUrlFromRepo(repo) {
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(repo || '');
  if (!m) return null;
  const [, owner, name] = m;
  const host = `${owner.toLowerCase()}.github.io`;
  return name.toLowerCase() === host ? `https://${host}` : `https://${host}/${name}`;
}

export function createPagesPublisher({ root, apps }) {
  const settingsFile = path.join(root, 'data', 'pages.json');
  const workDir = path.join(root, 'data', 'pages-work');

  const status = { state: 'idle', message: '', at: null, url: null };
  let timer = null;
  let running = false;
  let again = false;

  function readSettings() {
    let saved = {};
    try {
      saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      /* chưa cấu hình */
    }
    const repo = process.env.PAGES_REPO || saved.repo || '';
    return { repo, auto: saved.auto !== false, url: process.env.PAGES_URL || pagesUrlFromRepo(repo) };
  }

  function writeSettings(next) {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify({ repo: next.repo, auto: next.auto }, null, 2));
  }

  /** Sinh thư mục tĩnh vào dir. Trả về số file bundle đã chép. */
  function generate(dir, baseUrl) {
    let copied = 0;
    fs.writeFileSync(path.join(dir, '.nojekyll'), '');
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Bundles</title>OK\n');

    const appsFile = path.join(root, 'data', 'apps.json');
    const appIds = (JSON.parse(fs.readFileSync(appsFile, 'utf8')).apps || []).map((a) => a.id);

    for (const appId of appIds) {
      const ctx = apps.ctxFor(appId);
      if (!ctx) continue;
      const registry = readRegistry(ctx);
      const wanted = new Set(); // "<module>/<id>/<platform>"

      for (const mod of Object.values(registry.modules)) {
        for (const platform of BUNDLE_PLATFORMS) {
          for (const env of BUNDLE_ENVS) {
            const chosen = pickServed(mod, env, platform);
            if (!chosen) continue;
            wanted.add(`${mod.key}/${chosen.id}/${platform}`);
            const file = path.join(dir, appId, 'resolve', mod.key, platform, `${env}.json`);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(
              file,
              JSON.stringify({
                app: appId,
                module: mod.key,
                version: chosen.version,
                build: chosen.build,
                env,
                platform,
                manifestUrl: `${baseUrl}/${appId}/bundles/${mod.key}/${chosen.id}/${platform}/mf-manifest.json`,
              }),
            );
          }
        }
      }

      // Giữ cả các bản Active khác (không chỉ bản đang LIVE): app đã đọc địa chỉ bản cũ lúc Pages đang chuyển bản
      // vẫn tải tiếp được chunk của bản đó thay vì gặp 404. Muốn gỡ bản cũ khỏi Pages thì tắt Active hoặc xóa bản đó.
      for (const mod of Object.values(registry.modules)) {
        for (const v of mod.versions) {
          if (!v.active) continue;
          for (const platform of v.platforms) wanted.add(`${mod.key}/${v.id}/${platform}`);
        }
      }

      for (const rel of wanted) {
        const from = path.join(ctx.bundleDir, rel);
        if (!fs.existsSync(from)) continue;
        const to = path.join(dir, appId, 'bundles', rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.cpSync(from, to, { recursive: true });
        copied += 1;
      }
    }
    return copied;
  }

  async function git(args, opts = {}) {
    return execFileAsync('git', args, {
      cwd: workDir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120000,
      ...opts,
    });
  }

  async function publishNow() {
    const { repo, url } = readSettings();
    if (!repo || !url) {
      status.state = 'idle';
      status.message = 'Chưa cấu hình repo GitHub Pages';
      return status;
    }
    status.state = 'publishing';
    status.message = 'Đang đưa bundle lên GitHub Pages...';
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      fs.mkdirSync(workDir, { recursive: true });
      const copied = generate(workDir, url);
      await git(['init', '-q', '-b', BRANCH]);
      await git(['config', 'user.name', 'App Deploy Pro']);
      await git(['config', 'user.email', 'deploy@localhost']);
      await git(['add', '-A']);
      await git(['commit', '-q', '-m', `Publish bundles ${new Date().toISOString()}`]);
      await git(['remote', 'add', 'origin', repo]);
      await git(['push', '-q', '--force', 'origin', `HEAD:${BRANCH}`]);
      status.state = 'ok';
      status.message = `Đã đưa lên Pages (${copied} bundle). GitHub cần khoảng 1 đến 2 phút để cập nhật.`;
      status.url = url;
    } catch (err) {
      const detail = String(err.stderr || err.message || err).trim().split('\n').slice(-3).join(' ');
      status.state = 'error';
      status.message = `Đẩy lên Pages thất bại: ${detail}`;
    } finally {
      status.at = new Date().toISOString();
      fs.rmSync(path.join(workDir, '.git'), { recursive: true, force: true });
    }
    return status;
  }

  /** Chạy tuần tự: yêu cầu đến khi đang đẩy thì chạy lại một lần sau khi xong. */
  async function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await publishNow();
      } while (again);
    } finally {
      running = false;
    }
  }

  /** Gọi sau mỗi thay đổi bundle: gom các thay đổi liên tiếp rồi đẩy một lần (nếu bật tự động). */
  function schedule() {
    const { auto, repo } = readSettings();
    if (!auto || !repo) return;
    status.state = 'queued';
    status.message = 'Chờ đưa lên Pages...';
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  }

  function register(app) {
    const router = express.Router();
    const view = () => ({ ...readSettings(), status });

    router.get('/', (_req, res) => res.json(view()));

    router.put('/', (req, res) => {
      const repo = String(req.body?.repo ?? '').trim();
      if (repo && !REPO_RE.test(repo)) {
        return res.status(400).json({
          error: 'Repo phải có dạng https://github.com/<tên>/<repo>.git hoặc git@github.com:<tên>/<repo>.git',
        });
      }
      writeSettings({ repo, auto: req.body?.auto !== false });
      res.json({ message: 'Đã lưu cấu hình Pages', ...view() });
    });

    router.post('/publish', async (_req, res) => {
      if (!readSettings().repo) return res.status(400).json({ error: 'Chưa cấu hình repo GitHub Pages' });
      clearTimeout(timer);
      await run();
      res.status(status.state === 'error' ? 502 : 200).json({ message: status.message, ...view() });
    });

    app.use('/api/pages', router);
  }

  return { schedule, register, publishNow: run, readSettings };
}
