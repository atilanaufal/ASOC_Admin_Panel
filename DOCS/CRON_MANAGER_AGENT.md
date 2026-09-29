# Dokumen 35: Arsitektur dan Mekanisme Host Cron Manager (Agent API)

## 1. Latar Belakang & Masalah

Pada fase transisi dockerisasi Next.js Admin Panel, timbul batasan fundamental pada lingkungan container:
1. **Isolasi Kontainer**: Container Next.js berjalan dalam sandbox cgroups/namespaces dan tidak memiliki akses langsung ke utilitas Linux `crontab` di level Host OS.
2. **Risiko Keamanan SSH Loopback**: Menjalankan SSH dari dalam container ke Host OS (`ubuntu@10.20.100.86`) mengharuskan container menyimpan private key SSH host dengan privilege sudo, yang merupakan risiko eskalasi hak akses (*container breakout*).
3. **Risiko Command Injection**: Perintah `echo ... | sudo crontab -` rentan disisipkan arbitrary bash script jika input form tidak difilter secara ketat di level kernel host.

Untuk mengatasi hal tersebut, diterapkan **Host Cron Manager (Agent API)** sebagai jembatan independen antara Dockerized Next.js dan sistem cron host.

---

## 2. Diagram Arsitektur

```
┌────────────────────────────────────────────────────────┐
│               DOCKER CONTAINER NETWORK                 │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │           ASOC Admin Panel (Next.js)           │   │
│   │  - lib/cron-manager-client.ts                  │   │
│   │  - app/api/data-sync/route.ts                  │   │
│   └───────────────────────┬────────────────────────┘   │
└───────────────────────────┼────────────────────────────┘
                            │
                            │ HTTP (Header: X-ASOC-Secret)
                            │ URL: http://host.docker.internal:8765
                            ▼
┌────────────────────────────────────────────────────────┐
│                        HOST VM                         │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │  ASOC Cron Manager Daemon (FastAPI)            │   │
│   │  - Service: asoc-cron-manager.service (Port 8765) │
│   │  - Sanitasi Regex & Validasi Whitelist         │   │
│   └───────────────────────┬────────────────────────┘   │
│                           │                            │
│                           │ sudo crontab -u root       │
│                           ▼                            │
│   ┌────────────────────────────────────────────────┐   │
│   │               Linux System Cron                │   │
│   └───────────────────────┬────────────────────────┘   │
│                           │                            │
│                           │ Periodic Trigger           │
│                           ▼                            │
│   ┌────────────────────────────────────────────────┐   │
│   │  /opt/multi-tenant/scripts/cron_hourly_sync.sh │   │
│   └───────────────────────┬────────────────────────┘   │
│                           │                            │
│            ┌──────────────┴──────────────┐             │
│            ▼                             ▼             │
│    Python Sync Alert/Vuln        Python Wazuh Sync     │
│    (OpenSearch / MongoDB)        (Wazuh Cluster / DB)  │
└────────────────────────────────────────────────────────┘
```

---

## 3. Komponen Teknis

### A. Host Daemon (`cron_manager/server.py`)
Service FastAPI ringan (~120 baris) yang berjalan langsung di VM Host via systemd:
- **Port**: `8765` (Listen `0.0.0.0`, dibatasi firewall & secret key).
- **Authentication**: Validasi header `X-ASOC-Secret` atau `Authorization: Bearer <token>`.
- **Whitelisting Script**: Target cron dikunci secara eksplisit ke `/opt/multi-tenant/scripts/cron_hourly_sync.sh` (mencegah penulisan script arbitrary lain).
- **Regex Validation**:
  ```python
  CRON_REGEX = re.compile(r'^([0-9\*\/\,\-]+)\s+([0-9\*\/\,\-]+)\s+([0-9\*\/\,\-]+)\s+([0-9\*\/\,\-]+)\s+([0-9\*\/\,\-]+)$')
  ```
- **Atomicity**: Membaca crontab aktif, memfilter target script lama, menyisipkan entri baru, dan menulis kembali secara atomik.

### B. Systemd Service Unit (`systemd/asoc-cron-manager.service`)
```ini
[Unit]
Description=ASOC Host Cron Manager Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/asoc-cron-manager
Environment=CRON_MANAGER_SECRET=asoc-cron-secret-key-2026
Environment=CRON_MANAGER_HOST=0.0.0.0
Environment=CRON_MANAGER_PORT=8765
Environment=CRON_TARGET_SCRIPT=/opt/multi-tenant/scripts/cron_hourly_sync.sh
Environment=CRON_LOG_PATH=/var/log/multi-tenant-sync.log
Environment=CRON_USER=root
ExecStart=/opt/venv/bin/python /opt/asoc-cron-manager/server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### C. Client SDK di Next.js (`lib/cron-manager-client.ts`)
Mengabstraksi seluruh interaksi HTTP:
- `getHostCronStatus()`: Mengambil status jadwal dan keterbacaan aktif crontab.
- `updateHostCron(schedule, enabled)`: Mengirim payload JSON update jadwal.
- `getHostCronLogs(lines)`: Mengambil stream logs dari `/var/log/multi-tenant-sync.log`.

---

## 4. Spesifikasi API

### 1. Healthcheck
- **Method**: `GET /health`
- **Response**: `{"status": "ok", "service": "asoc-cron-manager"}`

### 2. Get Cron Status
- **Method**: `GET /cron`
- **Headers**: `X-ASOC-Secret: <secret>`
- **Response**:
```json
{
  "success": true,
  "schedule": "*/5 * * * *",
  "enabled": true,
  "active": true,
  "raw_entry": "*/5 * * * * /opt/multi-tenant/scripts/cron_hourly_sync.sh",
  "target_script": "/opt/multi-tenant/scripts/cron_hourly_sync.sh"
}
```

### 3. Update Cron Schedule
- **Method**: `POST /cron`
- **Headers**:
  - `Content-Type: application/json`
  - `X-ASOC-Secret: <secret>`
- **Body**:
```json
{
  "schedule": "*/15 * * * *",
  "enabled": true
}
```
- **Response**:
```json
{
  "success": true,
  "schedule": "*/15 * * * *",
  "enabled": true,
  "raw_entry": "*/15 * * * * /opt/multi-tenant/scripts/cron_hourly_sync.sh",
  "message": "Crontab updated successfully"
}
```

### 4. Fetch Execution Logs
- **Method**: `GET /logs?lines=60`
- **Headers**: `X-ASOC-Secret: <secret>`
- **Response**:
```json
{
  "success": true,
  "logs": "... log entries ..."
}
```

---

## 5. Konfigurasi Deployment Docker

Pada file `docker-compose.yml` untuk Next.js Admin:
```yaml
services:
  asoc-admin:
    image: asoc-admin-panel:latest
    ports:
      - "3006:3000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - CRON_MANAGER_URL=http://host.docker.internal:8765
      - CRON_MANAGER_SECRET=asoc-cron-secret-key-2026
```

---

## 6. Panduan Langkah-demi-Langkah Implementasi dari Nol sampai Berjalan

Berikut adalah panduan lengkap step-by-step untuk menerapkan Host Cron Manager pada server baru maupun server yang sedang berjalan:

### Langkah 1: Siapkan Direktori & Salin File di Host VM
Masuk ke terminal Host VM (10.20.100.86):
```bash
sudo mkdir -p /opt/asoc-cron-manager
sudo chown -R ubuntu:ubuntu /opt/asoc-cron-manager
```
Salin file `cron_manager/server.py` ke direktori tersebut:
```bash
cp cron_manager/server.py /opt/asoc-cron-manager/server.py
```

### Langkah 2: Setup Dependensi Python
Gunakan virtual environment yang sudah ada (`/opt/venv`) atau buat virtual environment baru:
```bash
# Pastikan modul fastapi dan uvicorn terinstall
/opt/venv/bin/pip install fastapi uvicorn pydantic
```

### Langkah 3: Daftarkan & Jalankan Systemd Service
Pasang unit systemd agar Cron Manager berjalan otomatis di latar belakang saat sistem boot:
```bash
sudo cp systemd/asoc-cron-manager.service /etc/systemd/system/asoc-cron-manager.service
sudo systemctl daemon-reload
sudo systemctl enable --now asoc-cron-manager.service
```

Pastikan service aktif (`active (running)`):
```bash
sudo systemctl status asoc-cron-manager.service
```

### Langkah 4: Uji Coba API Host Cron Manager secara Lokal
Jalankan pengujian langsung di terminal host untuk memastikan API merespons:
```bash
# 1. Healthcheck
curl -s http://127.0.0.1:8765/health

# 2. Cek Cron Aktif
curl -s -H "X-ASOC-Secret: asoc-cron-secret-key-2026" http://127.0.0.1:8765/cron

# 3. Uji Coba Update Cron (Contoh ke interval 10 menit)
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "X-ASOC-Secret: asoc-cron-secret-key-2026" \
  -d '{"schedule": "*/10 * * * *", "enabled": true}' \
  http://127.0.0.1:8765/cron

# 4. Verifikasi crontab sistem root
sudo crontab -l | grep cron_hourly_sync.sh
```

### Langkah 5: Hubungkan Web Admin Panel (Next.js)

#### Kasus A: Jika Next.js Berjalan Native (Host)
Tambahkan variabel lingkungan ke file `.env.production` di root Next.js:
```bash
CRON_MANAGER_URL=http://127.0.0.1:8765
CRON_MANAGER_SECRET=asoc-cron-secret-key-2026
```
Restart service web admin:
```bash
sudo systemctl restart asoc-admin.service
```

#### Kasus B: Jika Next.js Berjalan di Docker
Tambahkan mapping `host.docker.internal` dan environment pada `docker-compose.yml`:
```yaml
services:
  asoc-admin:
    image: asoc-admin-panel:latest
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - CRON_MANAGER_URL=http://host.docker.internal:8765
      - CRON_MANAGER_SECRET=asoc-cron-secret-key-2026
```
Jalankan container:
```bash
docker compose up -d
```

### Langkah 6: Verifikasi End-to-End via Antarmuka Web
1. Buka browser menuju halaman **Data Synchronization** (`/data-sync`).
2. Masuk ke tab **Cron Job Configuration**.
3. Pilih salah satu frekuensi (misalnya `Every 5 Minutes (Testing / Rapid Sync)`).
4. Klik tombol **Save Configuration**.
5. Amati toast notifikasi berhasil dan pastikan kolom **Next Run** menampilkan jam eksekusi berikutnya secara valid (bukan `Invalid Date`).
6. Periksa crontab di terminal host (`sudo crontab -l`) untuk memastikan baris crontab root telah terupdate secara otomatis dan aman.

---

## 7. Prosedur Troubleshooting & Verifikasi

1. **Cek Status Service Host**:
   ```bash
   sudo systemctl status asoc-cron-manager.service
   ```
2. **Cek Journal Log Host**:
   ```bash
   sudo journalctl -u asoc-cron-manager -f
   ```
3. **Uji Langsung via cURL**:
   ```bash
   curl -s -H "X-ASOC-Secret: asoc-cron-secret-key-2026" http://127.0.0.1:8765/cron
   ```
4. **Verifikasi Crontab Sistem Root**:
   ```bash
   sudo crontab -l | grep cron_hourly_sync.sh
   ```

