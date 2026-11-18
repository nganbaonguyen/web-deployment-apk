/* Kho APK/IPA của một ứng dụng. Router này được gắn vào /api (ứng dụng mặc định) và
 * /api/apps/:appId (các ứng dụng khác); chỗ lưu lấy từ req.appCtx (xem server/apps.js). */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

function getPackageType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.apk')) return 'android';
  if (lower.endsWith('.ipa')) return 'ios';
  return null;
}

const isAppPackage = (filename) => getPackageType(filename) !== null;

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

export function createPackagesRouter() {
  const router = express.Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        fs.mkdirSync(req.appCtx.uploadDir, { recursive: true });
        cb(null, req.appCtx.uploadDir);
      },
      filename: (_req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${safeName}`);
      },
    }),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (isAppPackage(file.originalname)) cb(null, true);
      else cb(new Error('Chỉ chấp nhận file .apk hoặc .ipa'));
    },
  });

  function resolvePackageFile(ctx, id) {
    const filePath = path.join(ctx.uploadDir, path.basename(decodeURIComponent(id)));
    if (!fs.existsSync(filePath) || !isAppPackage(path.basename(filePath))) return null;
    return filePath;
  }

  function clearActiveId(ctx) {
    try {
      if (fs.existsSync(ctx.activeFile)) fs.unlinkSync(ctx.activeFile);
    } catch {
      /* ignore */
    }
  }

  function readActiveId(ctx) {
    try {
      const id = JSON.parse(fs.readFileSync(ctx.activeFile, 'utf8'))?.activeId;
      if (!id || typeof id !== 'string') return null;
      const base = path.basename(id);
      if (!fs.existsSync(path.join(ctx.uploadDir, base)) || !isAppPackage(base)) {
        clearActiveId(ctx);
        return null;
      }
      return base;
    } catch {
      return null;
    }
  }

  function setActiveId(ctx, id) {
    const base = path.basename(id);
    if (!fs.existsSync(path.join(ctx.uploadDir, base)) || !isAppPackage(base)) {
      throw new Error('Gói không tồn tại');
    }
    fs.writeFileSync(ctx.activeFile, JSON.stringify({ activeId: base }, null, 2));
    return base;
  }

  const isPackageActive = (ctx, id) => {
    const activeId = readActiveId(ctx);
    return !!activeId && path.basename(id) === activeId;
  };

  const downloadUrl = (ctx, filename) => `${ctx.apiBase}/download/${encodeURIComponent(filename)}`;

  function listPackages(ctx) {
    fs.mkdirSync(ctx.uploadDir, { recursive: true });
    const activeId = readActiveId(ctx);
    return fs
      .readdirSync(ctx.uploadDir)
      .filter(isAppPackage)
      .map((filename) => {
        const stat = fs.statSync(path.join(ctx.uploadDir, filename));
        const displayName = filename.replace(/^\d+-/, '');
        return {
          id: filename,
          name: displayName,
          platform: getPackageType(displayName),
          active: filename === activeId,
          size: formatSize(stat.size),
          sizeBytes: stat.size,
          uploadedAt: stat.mtime.toISOString(),
          downloadUrl: downloadUrl(ctx, filename),
        };
      });
  }

  router.get('/download/:id', (req, res) => {
    const ctx = req.appCtx;
    const filePath = resolvePackageFile(ctx, req.params.id);
    if (!filePath) return res.status(404).json({ error: 'File không tồn tại' });
    if (!isPackageActive(ctx, req.params.id)) {
      return res.status(403).json({
        error: 'Gói chưa được kích hoạt. Bật kích hoạt trong kho phân phối để cho phép tải.',
      });
    }
    const filename = path.basename(filePath).replace(/^\d+-/, '');
    res.setHeader('Content-Type', getMimeType(filename));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  });

  router.get('/packages', (req, res) => {
    const list = listPackages(req.appCtx).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json({ packages: list, activeId: readActiveId(req.appCtx) });
  });

  router.get('/apks', (req, res) => {
    res.json(listPackages(req.appCtx).filter((p) => p.platform === 'android'));
  });

  router.post(
    '/upload',
    upload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'apk', maxCount: 1 },
      { name: 'ipa', maxCount: 1 },
    ]),
    (req, res) => {
      const ctx = req.appCtx;
      const uploaded = req.files?.file?.[0] || req.files?.apk?.[0] || req.files?.ipa?.[0] || req.file;
      if (!uploaded) {
        return res.status(400).json({ error: 'Không có file được gửi lên (.apk hoặc .ipa)' });
      }
      const platform = getPackageType(uploaded.originalname);
      if (!platform) return res.status(400).json({ error: 'Chỉ chấp nhận file .apk hoặc .ipa' });

      setActiveId(ctx, uploaded.filename);
      res.json({
        message: 'Upload thành công',
        file: {
          id: uploaded.filename,
          name: uploaded.originalname,
          platform,
          active: true,
          size: formatSize(uploaded.size),
          downloadUrl: downloadUrl(ctx, uploaded.filename),
        },
      });
    }
  );

  function handlePackageActive(req, res) {
    const ctx = req.appCtx;
    const id = path.basename(decodeURIComponent(req.params.id));
    if (!fs.existsSync(path.join(ctx.uploadDir, id)) || !isAppPackage(id)) {
      return res.status(404).json({ error: 'Gói không tồn tại' });
    }
    const wantActive = req.body?.active !== false;
    try {
      if (wantActive) setActiveId(ctx, id);
      else if (isPackageActive(ctx, id)) clearActiveId(ctx);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Không lưu được trạng thái kích hoạt' });
    }
    res.json({
      message: wantActive ? 'Đã kích hoạt gói phân phối' : 'Đã tắt kích hoạt — không thể tải gói này',
      activeId: readActiveId(ctx),
    });
  }

  router.post('/packages/:id/active', handlePackageActive);
  router.patch('/packages/:id/active', handlePackageActive);

  router.delete('/packages/:id', (req, res) => {
    const ctx = req.appCtx;
    const base = path.basename(decodeURIComponent(req.params.id));
    const filePath = path.join(ctx.uploadDir, base);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File không tồn tại' });
    if (isPackageActive(ctx, base)) clearActiveId(ctx);
    fs.unlinkSync(filePath);
    res.json({ message: 'Đã xóa file' });
  });

  router.delete('/apks/:id', (req, res) => {
    const filePath = path.join(req.appCtx.uploadDir, path.basename(decodeURIComponent(req.params.id)));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File không tồn tại' });
    fs.unlinkSync(filePath);
    res.json({ message: 'Đã xóa file' });
  });

  return router;
}
