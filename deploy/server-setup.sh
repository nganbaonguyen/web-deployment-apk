#!/usr/bin/env bash
# Chạy MỘT LẦN trên VPS Ubuntu mới (Oracle Cloud Always Free…):
#   curl -fsSL <link-raw-file-nay> | bash      hoặc copy file lên rồi: bash server-setup.sh
# Việc làm: cài Docker, mở cổng 80/443 trong tường lửa của máy, tạo thư mục /opt/appdeploy.
# Nhớ mở cổng 80 và 443 ở cả tường lửa của nhà cung cấp cloud (Oracle: VCN Security List).

set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

# Ảnh Ubuntu của Oracle có sẵn luật iptables chặn mọi cổng ngoài 22: chèn luật mở 80/443 lên đầu
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
sudo apt-get install -y iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save >/dev/null 2>&1 || true

sudo mkdir -p /opt/appdeploy/storage/uploads /opt/appdeploy/storage/bundles /opt/appdeploy/storage/data
sudo chown "$USER":"$USER" /opt/appdeploy
# Container chạy bằng user "node" (uid 1000): cần quyền ghi vào thư mục dữ liệu
sudo chown -R 1000:1000 /opt/appdeploy/storage

echo ""
echo "Xong. Việc tiếp theo:"
echo "  1. Đăng xuất rồi đăng nhập SSH lại (để dùng docker không cần sudo)"
echo "  2. Tạo /opt/appdeploy/.env (xem .env.example trong repo): DOMAIN, ADMIN_USER, ADMIN_PASSWORD"
echo "  3. Thêm 3 secret DEPLOY_HOST/DEPLOY_USER/DEPLOY_KEY trên GitHub rồi push lên main"
