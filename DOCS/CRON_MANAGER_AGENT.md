# ASOC Host Cron Manager (Agent API)

Mekanisme pengelolaan cron Linux host secara aman untuk Dockerized / Native Next.js Admin Panel.

## 1. Arsitektur

```
┌───────────────────────────────────────┐
│           DOCKER CONTAINER            │
│  Next.js Admin Panel                  │
│  - lib/cron-manager-client.ts         │
│  - app/api/data-sync/route.ts         │
└──────────────────┬────────────────────┘
                   │
                   │ HTTP REST (Header: X-ASOC-Secret)
                   ▼
┌───────────────────────────────────────┐
│               HOST VM                 │
│  Cron Manager Daemon (Port 8765)      │
│  - Service: asoc-cron-manager.service │
│  - File: /opt/asoc-cron-manager/server.py
└──────────────────┬────────────────────┘
                   │
                   ▼
              Linux Cron
                   │
                   ▼
       /opt/multi-tenant/scripts/cron_hourly_sync.sh
```

## 2. Service di Host VM

- **Direktori:** `/opt/asoc-cron-manager`
- **Systemd Unit:** `/etc/systemd/system/asoc-cron-manager.service`
- **Port:** `8765`
- **Auth:** Header `X-ASOC-Secret: asoc-cron-secret-key-2026`

Perintah cek status service di host:
```bash
sudo systemctl status asoc-cron-manager.service
sudo journalctl -u asoc-cron-manager -f
```

## 3. Endpoints

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/health` | Healthcheck service |
| `GET` | `/cron` | Ambil jadwal cron & status aktif |
| `POST` | `/cron` | Update jadwal cron (`{"schedule": "*/5 * * * *", "enabled": true}`) |
| `GET` | `/logs?lines=60` | Ambil tail log `/var/log/multi-tenant-sync.log` |

## 4. Konfigurasi Docker Container (docker-compose.yml)

Saat Next.js di-dockerisasi:
```yaml
services:
  asoc-admin:
    build: .
    ports:
      - "3006:3000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - CRON_MANAGER_URL=http://host.docker.internal:8765
      - CRON_MANAGER_SECRET=asoc-cron-secret-key-2026
```
