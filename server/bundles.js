/* ───────────────────────── Bundle mini app (.tar) ─────────────────────────
 * Mỗi mini app (module) của một ứng dụng có nhiều phiên bản. Mỗi phiên bản là một bundle
 * production (thư mục ios/ và android/ chứa mf-manifest.json, container, chunk) giải nén vào
 * <bundleDir>/<module>/<version>/. Trạng thái nằm trong <bundleDir>/registry.json.
 * LIVE là bản phục vụ người dùng (mỗi module tối đa 1 bản); STAGING/PROD là cờ môi trường.
 * App ElectroGo hỏi GET .../bundles/:module/resolve để biết nạp bản nào.
 * <bundleDir> lấy từ req.appCtx (xem server/apps.js). */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
export const BUNDLE_PLATFORMS = ['ios', 'android'];
export const BUNDLE_ENVS = ['live', 'prod', 'staging'];
const MODULE_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/;

/** Module khai báo sẵn cho ứng dụng mặc định lần chạy đầu. Ứng dụng khác bắt đầu trống. */
const DEFAULT_MODULES = [
  { key: 'work', label: 'Chấm công', tarPrefix: 'electro-go-work' },
  { key: 'sale', label: 'Bán hàng', tarPrefix: 'electro-go-sale' },
];

const registryFile = (ctx) => path.join(ctx.bundleDir, 'registry.json');

/** Đảm bảo thư mục và registry tồn tại (kể cả khi ai đó xóa thư mục lúc server đang chạy). */
function ensureStore(ctx) {
  fs.mkdirSync(ctx.bundleDir, { recursive: true });
  if (!fs.existsSync(registryFile(ctx))) {
    const seeded = { modules: {} };
    if (ctx.isDefault) {
      for (const m of DEFAULT_MODULES) {
        seeded.modules[m.key] = { ...m, createdAt: new Date().toISOString(), live: null, versions: [] };
      }
    }
    fs.writeFileSync(registryFile(ctx), JSON.stringify(seeded, null, 2));
  }
}

/** Mỗi lần upload là một "bản build" có id riêng (id = version cho bản đầu, "<version>-b2", "-b3"… cho các lần sau),
 * nên cùng một version có thể upload nhiều file tar. Dữ liệu cũ (chưa có id/live) được chuyển đổi khi đọc. */
function normalizeModule(mod) {
  mod.versions = Array.isArray(mod.versions) ? mod.versions : [];
  for (const v of mod.versions) {
    if (!v.id) v.id = v.version;
    if (!v.build) v.build = 1;
    if (typeof v.live !== 'boolean') v.live = !!mod.live && mod.live === v.id;
  }
  delete mod.live;
  return mod;
}

export function readRegistry(ctx) {
  ensureStore(ctx);
  try {
    const data = JSON.parse(fs.readFileSync(registryFile(ctx), 'utf8'));
    if (!data || typeof data.modules !== 'object') return { modules: {} };
    for (const mod of Object.values(data.modules)) normalizeModule(mod);
    return data;
  } catch {
    return { modules: {} };
  }
}

function writeRegistry(ctx, registry) {
  fs.mkdirSync(ctx.bundleDir, { recursive: true });
  const tmp = `${registryFile(ctx)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2));
  fs.renameSync(tmp, registryFile(ctx));
}

const byNewest = (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt);

/** Bản được phục vụ cho một môi trường: trong các bản đang tick (và Active, có nền tảng yêu cầu),
 * lấy bản trên cùng của danh sách = mới upload nhất. Bỏ tick bản đó thì app quay về bản tick kế tiếp bên dưới. */
export function pickServed(mod, env, platform) {
  return [...mod.versions]
    .filter((v) => v.active && v[env] && (!platform || v.platforms.includes(platform)))
    .sort(byNewest)[0];
}

function publicModule(mod) {
  const versions = [...mod.versions].sort(byNewest);
  return { ...mod, versions, live: pickServed(mod, 'live')?.id || null };
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Kiểm tra tar trước khi giải nén: chặn đường dẫn tuyệt đối, "..", symlink và hardlink. */
async function assertSafeTar(tarFile) {
  const opts = { maxBuffer: 64 * 1024 * 1024 };
  const names = (await execFileAsync('tar', ['-tf', tarFile], opts)).stdout.split('\n').filter(Boolean);
  for (const name of names) {
    if (name.startsWith('/') || name.split('/').includes('..')) {
      throw new Error(`Tar có đường dẫn không an toàn: ${name}`);
    }
  }
  const detail = (await execFileAsync('tar', ['-tvf', tarFile], opts)).stdout.split('\n').filter(Boolean);
  if (detail.some((line) => line[0] === 'l' || line[0] === 'h')) {
    throw new Error('Tar chứa symlink hoặc hardlink — không được phép');
  }
}

/** Tìm thư mục chứa ios/ hoặc android/ (tar thường có một thư mục gốc bao ngoài). */
function findBundleRoot(dir) {
  const hasPlatform = (d) => BUNDLE_PLATFORMS.some((p) => fs.existsSync(path.join(d, p, 'mf-manifest.json')));
  if (hasPlatform(dir)) return dir;
  const subs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'));
  for (const s of subs) {
    const candidate = path.join(dir, s.name);
    if (hasPlatform(candidate)) return candidate;
  }
  return null;
}

/** API bundle của một ứng dụng: gắn vào /api (mặc định) hoặc /api/apps/:appId. */
export function createBundlesRouter() {
  const router = express.Router();

  const tarUpload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        ensureStore(req.appCtx);
        cb(null, req.appCtx.bundleDir);
      },
      filename: (_req, _file, cb) =>
        cb(null, `.upload-${Date.now()}-${Math.random().toString(36).slice(2)}.tar`),
    }),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.originalname.toLowerCase().endsWith('.tar')) cb(null, true);
      else cb(new Error('Chỉ chấp nhận file .tar'));
    },
  });

  // Dùng chính địa chỉ mà client vừa gọi tới (điện thoại gọi bằng IP LAN thì nhận lại IP LAN, qua tunnel https thì nhận
  // https), không dùng .public-url cũ: địa chỉ tunnel đổi mỗi lần chạy nên dễ lỗi thời.
  const baseUrlFor = (req) => {
    const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
    const host = (req.get('x-forwarded-host') || req.get('host')).split(',')[0].trim();
    return `${proto}://${host}`;
  };

  router.get('/bundles', (req, res) => {
    const modules = Object.values(readRegistry(req.appCtx).modules)
      .map(publicModule)
      .sort((a, b) => a.key.localeCompare(b.key));
    res.json({ modules, baseUrl: baseUrlFor(req) });
  });

  /** Khai báo một mini app (module) để chọn lúc upload, không phải gõ lại mỗi lần. */
  router.post('/bundles/modules', (req, res) => {
    const ctx = req.appCtx;
    const key = String(req.body?.key || '').trim().toLowerCase();
    const label = String(req.body?.label || '').trim().slice(0, 60);
    const tarPrefix = String(req.body?.tarPrefix || '').trim().toLowerCase().slice(0, 80);
    if (!MODULE_KEY_RE.test(key)) {
      return res.status(400).json({ error: 'Mã module chỉ gồm a-z, 0-9, "-" và "_" (tối đa 40 ký tự)' });
    }
    const registry = readRegistry(ctx);
    if (registry.modules[key]) return res.status(409).json({ error: `Module "${key}" đã được khai báo` });
    registry.modules[key] = {
      key,
      label: label || key,
      tarPrefix: tarPrefix || `electro-go-${key}`,
      createdAt: new Date().toISOString(),
      live: null,
      versions: [],
    };
    writeRegistry(ctx, registry);
    res.json({ message: `Đã khai báo module ${key}`, module: publicModule(registry.modules[key]) });
  });

  router.post('/bundles/:key/upload', tarUpload.single('file'), async (req, res) => {
    const ctx = req.appCtx;
    const tarFile = req.file?.path;
    let tmpDir = null;
    try {
      if (!tarFile) throw new Error('Không có file .tar được gửi lên');

      const key = String(req.params.key || '').trim().toLowerCase();
      const version = String(req.body?.version || '').trim();
      const goLive = req.body?.live === '1' || req.body?.live === 'true';
      if (!MODULE_KEY_RE.test(key)) throw new Error('Tên module không hợp lệ');
      if (!VERSION_RE.test(version)) throw new Error('Phiên bản không hợp lệ (ví dụ 1.3.0 hoặc v26)');

      const registry = readRegistry(ctx);
      const mod = registry.modules[key];
      if (!mod) {
        return res.status(404).json({ error: `Module "${key}" chưa được khai báo — bấm "Khai báo module" trước` });
      }
      // Cho phép upload lại cùng version (vd: sửa code mini app mà chưa tăng version): mỗi lần là một bản build mới
      const sameVersion = mod.versions.filter((v) => v.version === version);
      const build = sameVersion.length ? Math.max(...sameVersion.map((v) => v.build || 1)) + 1 : 1;
      const id = build === 1 ? version : `${version}-b${build}`;

      await assertSafeTar(tarFile);
      tmpDir = fs.mkdtempSync(path.join(ctx.bundleDir, '.extract-'));
      await execFileAsync('tar', ['-xf', tarFile, '-C', tmpDir, '--no-same-owner']);

      const bundleRoot = findBundleRoot(tmpDir);
      if (!bundleRoot) {
        throw new Error(
          'Tar không phải bundle: thiếu ios/ hoặc android/ có mf-manifest.json. ' +
            'Hãy chạy "pnpm build" trong thư mục mini app (không phải "pnpm build:src").'
        );
      }
      const platforms = BUNDLE_PLATFORMS.filter((p) =>
        fs.existsSync(path.join(bundleRoot, p, 'mf-manifest.json'))
      );
      // App nạp mini app theo tên module (remote "work" đọc work.container.js.bundle), nên tên trong manifest phải
      // trùng khóa module. Upload nhầm tar của mini app khác vào module này sẽ làm app báo "Failed to prefetch script".
      for (const p of platforms) {
        let manifestName = null;
        try {
          manifestName = JSON.parse(fs.readFileSync(path.join(bundleRoot, p, 'mf-manifest.json'), 'utf8')).name;
        } catch {
          /* manifest hỏng: để bước sau báo lỗi như cũ */
        }
        if (manifestName && manifestName !== key) {
          throw new Error(
            `Tar này là của mini app "${manifestName}", không phải "${key}". ` +
              `Chọn đúng module "${manifestName}" hoặc chọn đúng file tar của "${key}".`
          );
        }
      }

      const dest = path.join(ctx.bundleDir, key, id);
      if (!isInside(ctx.bundleDir, dest)) throw new Error('Đường dẫn đích không hợp lệ');
      fs.mkdirSync(dest, { recursive: true });
      for (const p of platforms) fs.renameSync(path.join(bundleRoot, p), path.join(dest, p));

      mod.versions.push({
        id,
        version,
        build,
        file: req.file.originalname,
        sizeBytes: req.file.size,
        uploadedAt: new Date().toISOString(),
        platforms,
        staging: true,
        prod: false,
        live: goLive,
        active: true,
      });
      writeRegistry(ctx, registry);
      req.app.get('pages')?.schedule();

      res.json({ message: 'Upload bundle thành công', module: publicModule(mod), version, id, build, platforms });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Upload bundle thất bại' });
    } finally {
      if (tarFile) fs.rmSync(tarFile, { force: true });
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  /** Lưu hàng loạt từ bảng lịch sử phiên bản: cờ STAGING/PROD/LIVE và Active của từng bản build.
 * Có thể tick nhiều bản cùng môi trường: app nhận bản trên cùng (mới upload nhất) trong số đã tick. */
  router.patch('/bundles/:key/versions', (req, res) => {
    const ctx = req.appCtx;
    const registry = readRegistry(ctx);
    const mod = registry.modules[req.params.key];
    if (!mod) return res.status(404).json({ error: 'Module không tồn tại' });

    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    for (const c of changes) {
      const v = mod.versions.find((x) => x.id === c.id);
      if (!v) continue;
      if (typeof c.staging === 'boolean') v.staging = c.staging;
      if (typeof c.prod === 'boolean') v.prod = c.prod;
      if (typeof c.live === 'boolean') v.live = c.live;
      if (typeof c.active === 'boolean') v.active = c.active;
      if (!v.active) v.live = false; // bản bị tắt Active thì không còn LIVE
    }

    writeRegistry(ctx, registry);
    req.app.get('pages')?.schedule();
    res.json({ message: 'Đã lưu thay đổi', module: publicModule(mod) });
  });

  router.delete('/bundles/:key/versions/:version', (req, res) => {
    const ctx = req.appCtx;
    const registry = readRegistry(ctx);
    const mod = registry.modules[req.params.key];
    const idx = mod ? mod.versions.findIndex((v) => v.id === req.params.version) : -1;
    if (idx < 0) return res.status(404).json({ error: 'Phiên bản không tồn tại' });

    const dir = path.join(ctx.bundleDir, mod.key, mod.versions[idx].id);
    if (isInside(ctx.bundleDir, dir)) fs.rmSync(dir, { recursive: true, force: true });
    mod.versions.splice(idx, 1);
    writeRegistry(ctx, registry);
    req.app.get('pages')?.schedule();
    res.json({ message: 'Đã xóa phiên bản', module: publicModule(mod) });
  });

  router.delete('/bundles/:key', (req, res) => {
    const ctx = req.appCtx;
    const registry = readRegistry(ctx);
    const mod = registry.modules[req.params.key];
    if (!mod) return res.status(404).json({ error: 'Module không tồn tại' });
    const dir = path.join(ctx.bundleDir, mod.key);
    if (isInside(ctx.bundleDir, dir)) fs.rmSync(dir, { recursive: true, force: true });
    delete registry.modules[mod.key];
    writeRegistry(ctx, registry);
    req.app.get('pages')?.schedule();
    res.json({ message: 'Đã xóa module' });
  });

  /** App ElectroGo gọi API này để biết nạp bản nào. env=live (mặc định) | prod | staging. */
  router.get('/bundles/:key/resolve', (req, res) => {
    const ctx = req.appCtx;
    const mod = readRegistry(ctx).modules[req.params.key];
    const platform = BUNDLE_PLATFORMS.includes(req.query.platform) ? req.query.platform : null;
    const env = ['live', 'prod', 'staging'].includes(req.query.env) ? req.query.env : 'live';
    if (!mod) return res.status(404).json({ error: 'Module không tồn tại' });
    if (!platform) return res.status(400).json({ error: 'Thiếu platform (ios hoặc android)' });

    const chosen = pickServed(mod, env, platform);
    if (!chosen) {
      return res
        .status(404)
        .json({ error: `Chưa có bản ${env.toUpperCase()} cho ${mod.key} (${platform})` });
    }

    res.json({
      app: ctx.id,
      module: mod.key,
      version: chosen.version,
      build: chosen.build,
      env,
      platform,
      manifestUrl: `${baseUrlFor(req)}/bundles/${ctx.bundleUrlPrefix}${mod.key}/${chosen.id}/${platform}/mf-manifest.json`,
    });
  });

  return router;
}

/** Phục vụ file bundle của mọi ứng dụng, chỉ cho phiên bản đang Active.
 * URL: /bundles/<module>/<version>/... (ứng dụng mặc định) hoặc /bundles/_apps/<id>/<module>/<version>/... */
export function createBundleStatic(apps) {
  const router = express.Router();
  router.use(
    (req, res, next) => {
      const parts = decodeURIComponent(req.path).split('/').filter(Boolean);
      // Chặn "." và ".." để không vượt qua kiểm tra Active bằng cách nhảy sang thư mục phiên bản khác
      if (parts.some((s) => s === '.' || s === '..' || s.includes('\0'))) {
        return res.status(400).json({ error: 'Đường dẫn không hợp lệ' });
      }
      let appId = null;
      let rest = parts;
      if (parts[0] === '_apps') {
        appId = parts[1];
        rest = parts.slice(2);
      }
      const ctx = apps.ctxFor(appId || 'electrogo');
      if (!ctx) return res.status(404).json({ error: 'Không tìm thấy bundle' });
      const [key, version] = rest;
      const v = readRegistry(ctx).modules[key]?.versions.find((x) => x.id === version);
      if (!v) return res.status(404).json({ error: 'Không tìm thấy bundle' });
      if (!v.active) return res.status(403).json({ error: 'Phiên bản này đã bị tắt Active' });
      next();
    },
    express.static(apps.BUNDLES_ROOT, { dotfiles: 'deny', maxAge: 0 })
  );
  return router;
}
