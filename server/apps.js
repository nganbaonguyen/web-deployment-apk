/* ───────────────────────────── Nhiều ứng dụng (App hosts) ─────────────────────────────
 * Mỗi ứng dụng có kho APK/IPA và danh sách bundle mini app riêng.
 * Ứng dụng mặc định (electrogo) giữ nguyên chỗ lưu cũ (uploads/, bundles/) và URL cũ (/api/...),
 * nên link đã phát hành và dữ liệu hiện có vẫn dùng được. Ứng dụng khác lưu ở:
 *   uploads/apps/<id>/        kho APK/IPA
 *   bundles/_apps/<id>/       bundle mini app
 * và dùng URL /api/apps/<id>/... */

import express from 'express';
import path from 'path';
import fs from 'fs';

export const DEFAULT_APP_ID = 'electrogo';
const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;
const COLORS = ['#6366f1', '#10b981', '#3b82f6', '#14b8a6', '#8b5cf6', '#f97316', '#ec4899', '#0ea5e9'];

export function createAppsStore({ root }) {
  const DATA_DIR = path.join(root, 'data');
  const FILE = path.join(DATA_DIR, 'apps.json');
  const UPLOAD_ROOT = path.join(root, 'uploads');
  // BUNDLES_DIR: đổi thư mục lưu bundle (dùng khi chạy thử để không đụng dữ liệu thật)
  const BUNDLES_ROOT = process.env.BUNDLES_DIR ? path.resolve(process.env.BUNDLES_DIR) : path.join(root, 'bundles');

  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (Array.isArray(data.apps) && data.apps.some((a) => a.id === DEFAULT_APP_ID)) return data;
    } catch {
      /* chưa có file: tạo mới bên dưới */
    }
    // Lần chạy đầu: khai báo sẵn 2 ứng dụng. Hypertech xóa được, thêm ứng dụng khác bằng nút + ở sidebar.
    const now = new Date().toISOString();
    const fresh = {
      apps: [
        { id: DEFAULT_APP_ID, name: 'ElectroGo', color: COLORS[0], createdAt: now },
        { id: 'hypertech', name: 'Hypertech', color: COLORS[1], createdAt: now },
      ],
    };
    write(fresh);
    return fresh;
  }

  function write(data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  }

  /** Thông tin chỗ lưu và URL của một ứng dụng; null nếu chưa khai báo. */
  function ctxFor(id) {
    const entry = read().apps.find((a) => a.id === id);
    if (!entry) return null;
    const isDefault = id === DEFAULT_APP_ID;
    const uploadDir = isDefault ? UPLOAD_ROOT : path.join(UPLOAD_ROOT, 'apps', id);
    const bundleDir = isDefault ? BUNDLES_ROOT : path.join(BUNDLES_ROOT, '_apps', id);
    return {
      id,
      name: entry.name,
      color: entry.color,
      isDefault,
      uploadDir,
      activeFile: path.join(uploadDir, '.active-package.json'),
      bundleDir,
      apiBase: isDefault ? '/api' : `/api/apps/${id}`,
      bundleUrlPrefix: isDefault ? '' : `_apps/${id}/`,
    };
  }

  const publicApp = (a) => ({ ...a, isDefault: a.id === DEFAULT_APP_ID });

  /** Middleware: đọc :appId từ URL */
  function requireApp(req, res, next) {
    const ctx = ctxFor(String(req.params.appId || ''));
    if (!ctx) return res.status(404).json({ error: 'Ứng dụng không tồn tại' });
    req.appCtx = ctx;
    next();
  }

  /** Middleware cho URL cũ (/api/...): luôn là ứng dụng mặc định */
  function useDefaultApp(req, _res, next) {
    req.appCtx = ctxFor(DEFAULT_APP_ID);
    next();
  }

  function slugify(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
  }

  function register(app) {
    const router = express.Router();

    router.get('/', (_req, res) => {
      res.json({ apps: read().apps.map(publicApp), defaultId: DEFAULT_APP_ID });
    });

    router.post('/', (req, res) => {
      const name = String(req.body?.name || '').trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'Nhập tên ứng dụng' });
      const id = String(req.body?.id || '').trim().toLowerCase() || slugify(name);
      if (!APP_ID_RE.test(id)) {
        return res.status(400).json({ error: 'Mã ứng dụng chỉ gồm a-z, 0-9 và "-" (tối đa 30 ký tự)' });
      }
      const data = read();
      if (data.apps.some((a) => a.id === id)) {
        return res.status(409).json({ error: `Mã "${id}" đã được dùng` });
      }
      const color = /^#[0-9a-f]{6}$/i.test(req.body?.color || '')
        ? req.body.color
        : COLORS[data.apps.length % COLORS.length];
      const entry = { id, name, color, createdAt: new Date().toISOString() };
      data.apps.push(entry);
      write(data);
      const ctx = ctxFor(id);
      fs.mkdirSync(ctx.uploadDir, { recursive: true });
      fs.mkdirSync(ctx.bundleDir, { recursive: true });
      res.json({ message: `Đã thêm ứng dụng ${name}`, app: publicApp(entry) });
    });

    router.patch('/:id', (req, res) => {
      const data = read();
      const entry = data.apps.find((a) => a.id === req.params.id);
      if (!entry) return res.status(404).json({ error: 'Ứng dụng không tồn tại' });
      const name = String(req.body?.name ?? entry.name).trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'Tên không được để trống' });
      entry.name = name;
      if (/^#[0-9a-f]{6}$/i.test(req.body?.color || '')) entry.color = req.body.color;
      write(data);
      res.json({ message: 'Đã cập nhật ứng dụng', app: publicApp(entry) });
    });

    router.delete('/:id', (req, res) => {
      if (req.params.id === DEFAULT_APP_ID) {
        return res.status(400).json({ error: 'Không thể xóa ứng dụng mặc định' });
      }
      const data = read();
      const idx = data.apps.findIndex((a) => a.id === req.params.id);
      if (idx < 0) return res.status(404).json({ error: 'Ứng dụng không tồn tại' });
      const ctx = ctxFor(req.params.id);
      for (const dir of [ctx.uploadDir, ctx.bundleDir]) {
        const rel = path.relative(root, dir);
        if (rel && !rel.startsWith('..')) fs.rmSync(dir, { recursive: true, force: true });
      }
      data.apps.splice(idx, 1);
      write(data);
      res.json({ message: 'Đã xóa ứng dụng cùng toàn bộ gói và bundle' });
    });

    app.use('/api/apps', router);
  }

  return { ctxFor, requireApp, useDefaultApp, register, BUNDLES_ROOT };
}
