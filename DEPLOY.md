# Đưa App Deploy Pro lên server miễn phí (Oracle Cloud) + tự động deploy

Kết quả: web chạy 24/7 ở `https://<domain-của-bạn>`, đóng máy Mac vẫn chạy. Mỗi lần `git push` lên `main`, GitHub Actions tự cập nhật server.

```
Điện thoại / trình duyệt ──HTTPS──► Caddy ──► Express (Docker)
                                                  │
                                      /opt/appdeploy/storage  (APK, IPA, bundle: giữ nguyên khi deploy)
```

## Bước 1. Tạo máy ảo miễn phí trên Oracle Cloud

1. Đăng ký https://www.oracle.com/cloud/free/ (cần thẻ để xác minh, gói *Always Free* không bị trừ tiền).
2. Compute → Instances → Create instance:
   - Image: **Ubuntu 22.04** (hoặc 24.04)
   - Shape: **Ampere A1** (ARM, 1–2 OCPU, 6–12 GB RAM) hoặc **VM.Standard.E2.1.Micro** (AMD). Cả hai đều có nhãn *Always Free eligible*.
   - Tải về file **SSH private key** khi tạo (giữ kỹ).
3. Ghi lại **Public IP** của máy.
4. Mở cổng web: Networking → VCN → Subnet → Security List → **Add Ingress Rules**: Source `0.0.0.0/0`, TCP, Destination Port `80,443`.

> Nếu báo hết máy (*Out of capacity*) thì thử lại vài giờ sau hoặc đổi Availability Domain.

## Bước 2. Chuẩn bị domain

Let's Encrypt cần một domain trỏ về IP máy. Chọn một trong hai:

- **Không có domain (nhanh nhất):** dùng `<IP có dấu gạch>.sslip.io`, ví dụ IP `129.146.10.5` → domain `129-146-10-5.sslip.io`. Không cần cấu hình gì thêm.
- **Domain miễn phí:** tạo tại https://www.duckdns.org rồi trỏ về IP máy.

## Bước 3. Cài đặt máy chủ (một lần)

```bash
ssh -i <file-private-key> ubuntu@<IP>
# trên máy chủ:
curl -fsSL https://raw.githubusercontent.com/nganbaonguyen/web-deployment-apk/main/deploy/server-setup.sh | bash
exit            # đăng xuất rồi SSH lại để dùng docker không cần sudo
```

(Repo private thì copy nội dung `deploy/server-setup.sh` lên máy rồi chạy `bash server-setup.sh`.)

Tạo file cấu hình `/opt/appdeploy/.env` trên máy chủ:

```bash
cat > /opt/appdeploy/.env <<'EOF'
DOMAIN=129-146-10-5.sslip.io
ADMIN_USER=admin
ADMIN_PASSWORD=mat-khau-dai-kho-doan
EOF
chmod 600 /opt/appdeploy/.env
```

## Bước 4. Nối GitHub Actions với máy chủ

1. Trên máy Mac tạo khóa riêng cho deploy:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/appdeploy_ci -N ""
   ssh-copy-id -i ~/.ssh/appdeploy_ci.pub -o "IdentityFile <file-private-key-oracle>" ubuntu@<IP>
   ```
   (hoặc dán nội dung `appdeploy_ci.pub` vào `~/.ssh/authorized_keys` trên máy chủ)
2. GitHub repo → Settings → Secrets and variables → Actions → **New repository secret**:
   | Tên | Giá trị |
   |---|---|
   | `DEPLOY_HOST` | IP của máy chủ |
   | `DEPLOY_USER` | `ubuntu` |
   | `DEPLOY_KEY` | toàn bộ nội dung file `~/.ssh/appdeploy_ci` (private key) |
3. `git push` lên `main` (hoặc Actions → Deploy → Run workflow). Lần đầu build khoảng 2–4 phút.
4. Mở `https://<domain>` → trình duyệt hỏi tài khoản/mật khẩu trong `.env`.

## Bước 5. Chuyển dữ liệu hiện có từ Mac lên (tùy chọn)

Muốn giữ APK, bundle và danh sách ứng dụng đang có trên Mac:

```bash
cd web-deployment-apk
rsync -az uploads/ ubuntu@<IP>:/opt/appdeploy/storage/uploads/
rsync -az bundles/ ubuntu@<IP>:/opt/appdeploy/storage/bundles/
rsync -az data/    ubuntu@<IP>:/opt/appdeploy/storage/data/
ssh ubuntu@<IP> 'sudo chown -R 1000:1000 /opt/appdeploy/storage'
```

## Bước 6. Trỏ app ElectroGo về server mới

Trong app ElectroGo, đổi địa chỉ gọi API bundle từ IP/tunnel cũ sang `https://<domain>`
(ví dụ `https://<domain>/api/bundles/sale/resolve?platform=android`).

## Quyền truy cập

| Cần đăng nhập | Công khai (không cần mật khẩu) |
|---|---|
| Giao diện web, danh sách, upload, xóa, bật/tắt gói, khai báo module | `GET /bundles/...` (file bundle bản Active) |
| | `GET /api/download/<file>` (chỉ gói đang kích hoạt) |
| | `GET /api/bundles/<module>/resolve` (app hỏi bản nào) |

Link **Copy link** trong kho phân phối là link tải công khai, gửi cho người dùng được.

## Vận hành

```bash
cd /opt/appdeploy
docker compose ps                  # trạng thái
docker compose logs -f app         # xem log
docker compose restart app         # restart
tar czf ~/backup-$(date +%F).tgz storage   # sao lưu dữ liệu
```

Sao lưu `storage/` định kỳ: đây là nơi duy nhất giữ APK, IPA và bundle thật.
