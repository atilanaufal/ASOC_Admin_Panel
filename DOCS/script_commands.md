# Daftar Lengkap Command — `/opt/multi-tenant/scripts/`

Semua script mendukung **2 mode**: CLI argumen langsung, atau **interactive wizard** (jalankan tanpa argumen).

Prefix: `python3` atau `/opt/venv/bin/python3`

---

## 1. SYNC SCRIPTS (Pipeline Sinkronisasi Data)

### 1.1 `cron_hourly_sync.sh`
Orchestrator 5-langkah pipeline sinkronisasi otomatis (cron hourly).

```bash
# Sintaks
./cron_hourly_sync.sh [PERIOD] [TENANT]

# Contoh
./cron_hourly_sync.sh                     # default: today, all
./cron_hourly_sync.sh this_week           # all tenant, this_week
./cron_hourly_sync.sh today TENANT_A      # spesifik tenant
```

| Arg | Default | Nilai |
|-----|---------|-------|
| `$1` (PERIOD) | `today` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |
| `$2` (TENANT) | `all` | kode tenant atau `all` |

> [!NOTE]
> Redis sync otomatis pakai `this_week` jika PERIOD = `today`

---

### 1.2 `sync_alerts_indexer_mongo.py`
Sinkronisasi alerts/incidents dari Wazuh Indexer (OpenSearch) → MongoDB.

```bash
# Positional (shorthand)
python3 sync_alerts_indexer_mongo.py [TENANT|PERIOD] [PERIOD|TENANT]

# Named arguments
python3 sync_alerts_indexer_mongo.py --tenant|-t <KODE|all> --period|-p <PERIOD>

# Contoh
python3 sync_alerts_indexer_mongo.py all today
python3 sync_alerts_indexer_mongo.py -t TENANT_A -p this_week
python3 sync_alerts_indexer_mongo.py -t all -p 2026-08-01..2026-08-31
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--period` | `-p` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |

---

### 1.3 `sync_alerts_indexer_mongo_grouped.py`
Sama seperti 1.2, versi pengelompokan (grouped aggregation).

```bash
python3 sync_alerts_indexer_mongo_grouped.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 sync_alerts_indexer_mongo_grouped.py --tenant|-t <KODE|all> --period|-p <PERIOD>
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--period` | `-p` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |

---

### 1.4 `sync_vulnerability_indexer_mongo.py`
Sinkronisasi vulnerability data dari Wazuh Indexer → MongoDB.

```bash
python3 sync_vulnerability_indexer_mongo.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 sync_vulnerability_indexer_mongo.py --tenant|-t <KODE|all> --period|-p <PERIOD>
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--period` | `-p` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |

---

### 1.5 `sync_wazuh_agents.py`
Sinkronisasi data agent/device dari Wazuh API → MongoDB.

```bash
# Positional
python3 sync_wazuh_agents.py [TENANT]

# Named arguments
python3 sync_wazuh_agents.py --tenant|-t <KODE|all> --mode|-m <full|stats> [--json]

# Contoh
python3 sync_wazuh_agents.py all
python3 sync_wazuh_agents.py -t TENANT_A -m stats
python3 sync_wazuh_agents.py -t all -m full --json
```

| Opsi | Alias | Default | Nilai |
|------|-------|---------|-------|
| `--tenant` | `-t` | `all` | kode tenant atau `all` |
| `--mode` | `-m` | `full` | `full` (seluruh data hardware & metadata), `stats` (status & keepalive saja) |
| `--json` | — | false | Output format JSON |

---

### 1.6 `sync_iris_reports.py`
Sinkronisasi kasus investigasi dari DFIR-IRIS API → MongoDB.

```bash
python3 sync_iris_reports.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 sync_iris_reports.py --tenant|-t <KODE|all> --period|-p <PERIOD> [--json] [--force|-f]
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--period` | `-p` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |
| `--json` | — | Output format JSON |
| `--force` | `-f` | Paksa jalankan di luar active hours |

---

### 1.7 `sync_mongo_redis_multitenant.py`
Sinkronisasi data dari MongoDB → Redis cache.

```bash
python3 sync_mongo_redis_multitenant.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 sync_mongo_redis_multitenant.py --tenant|-t <KODE|all> --period|-p <PERIOD>
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--period` | `-p` | `today`, `this_week`, `yesterday`, `last_week`, `YYYY-MM-DD..YYYY-MM-DD` |

---

## 2. CHECK / AUDIT SCRIPTS (Verifikasi & Diagnostik)

### 2.1 `check_alerts_indexer_mongo.py`
Audit sinkronisasi alerts Indexer vs MongoDB (event-based pure alerts).

```bash
python3 check_alerts_indexer_mongo.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 check_alerts_indexer_mongo.py --tenant|-t <KODE|all> --mode|-m <PERIOD>
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--mode` | `-m` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |

---

### 2.2 `check_alerts_indexer_mongo_grouped.py`
Audit sinkronisasi alerts Indexer vs MongoDB (grouped version).

```bash
python3 check_alerts_indexer_mongo_grouped.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 check_alerts_indexer_mongo_grouped.py --tenant|-t <KODE|all> --mode|-m <PERIOD>
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--mode` | `-m` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |

---

### 2.3 `check_vulnerability_indexer_mongo.py`
Audit sinkronisasi vulnerability Indexer vs MongoDB.

```bash
python3 check_vulnerability_indexer_mongo.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 check_vulnerability_indexer_mongo.py --tenant|-t <KODE|all> --mode|-m <PERIOD>
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--mode` | `-m` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |

---

### 2.4 `check_mongo_redis_multitenant_sync.py`
Audit konsistensi MongoDB vs Redis cache.

```bash
python3 check_mongo_redis_multitenant_sync.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 check_mongo_redis_multitenant_sync.py --tenant|-t <KODE|all> --period|-p <PERIOD>
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--period` | `-p` | `today`, `this_week`, `yesterday`, `last_week`, `YYYY-MM-DD..YYYY-MM-DD` |

---

### 2.5 `check_wazuh_agents.py`
Audit data Wazuh Agent per tenant.

```bash
python3 check_wazuh_agents.py [TENANT]
python3 check_wazuh_agents.py --tenant|-t <KODE|all> [--no-hw] [--json]
```

| Opsi | Alias | Default | Nilai |
|------|-------|---------|-------|
| `--tenant` | `-t` | `all` | kode tenant atau `all` |
| `--no-hw` | — | false | Skip direct Syscollector hardware API call |
| `--json` | — | false | Output format JSON |

---

### 2.6 `check_iris_reports.py`
Audit konsistensi DFIR-IRIS vs MongoDB reports.

```bash
python3 check_iris_reports.py [TENANT|PERIOD] [PERIOD|TENANT]
python3 check_iris_reports.py --tenant|-t <KODE|all> --period|-p <PERIOD> [--json]
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--period` | `-p` | `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `YYYY-MM-DD..YYYY-MM-DD` |
| `--json` | — | Output format JSON |

---

### 2.7 `check_incident_dates.py`
Cek konsistensi tanggal (date vs first_observed vs last_observed) di MongoDB incident.

```bash
python3 check_incident_dates.py
```

> [!NOTE]
> **Tanpa argumen** — langsung scan semua database `tenant*` dan lapor mismatch.

---

### 2.8 `check_tenant_mappings.py`
Cek mapping tenant (Wazuh groups & IRIS customers) dari MySQL.

```bash
python3 check_tenant_mappings.py
```

> [!NOTE]
> **Tanpa argumen** — langsung query MySQL dan tampilkan seluruh mapping.

---

## 3. TENANT & USER MANAGEMENT

### 3.1 `register_tenant.py`
Registrasi tenant baru (MySQL + MongoDB indexes + mapping Wazuh/IRIS).

```bash
# Named arguments
python3 register_tenant.py \
  --code <KODE_TENANT> \
  --name <NAMA_KAMPUS> \
  [--db <NAMA_DB_MONGO>] \
  [--wazuh-group <NAMA_GROUP>] \
  [--iris-id <CUSTOMER_ID>] \
  [--iris-name <NAMA_CUSTOMER>]

# Contoh
python3 register_tenant.py --code UNAIR --name "Universitas Airlangga"
python3 register_tenant.py --code ITB --name "Institut Teknologi Bandung" --wazuh-group itb_group --iris-id 5
```

| Opsi | Wajib | Nilai |
|------|-------|-------|
| `--code` | ❌ | Kode tenant (auto-uppercase) |
| `--name` | ❌ | Nama kampus |
| `--db` | ❌ | Nama database MongoDB (default: `tenant_<code>`) |
| `--wazuh-group` | ❌ | Nama group Wazuh |
| `--iris-id` | ❌ | ID customer DFIR-IRIS (integer) |
| `--iris-name` | ❌ | Nama customer DFIR-IRIS |

---

### 3.2 `delete_tenant.py`
Hapus permanen tenant beserta data MongoDB & Redis-nya.

```bash
python3 delete_tenant.py --id <TENANT_ID> [--keep-mongo] [--keep-redis] [--force|-f]
```

| Opsi | Alias | Default | Nilai |
|------|-------|---------|-------|
| `--id` | — | — | ID tenant (integer) |
| `--keep-mongo` | — | false | Jangan hapus database MongoDB |
| `--keep-redis` | — | false | Jangan hapus cache Redis |
| `--force` | `-f` | false | Paksa hapus tanpa konfirmasi interaktif |

---

### 3.3 `create_tenant_user.py`
Buat akun user untuk tenant spesifik.

```bash
python3 create_tenant_user.py \
  --tenant-id <ID> \
  --username|-u <USERNAME> \
  --password|-p <PASSWORD> \
  [--email|-e <EMAIL>] \
  [--role|-r <ROLE>]

# Contoh
python3 create_tenant_user.py --tenant-id 1 -u user_unair -p SecureP@ss123 -e user@unair.ac.id
```

| Opsi | Alias | Default | Nilai |
|------|-------|---------|-------|
| `--tenant-id` | — | — | ID tenant (integer) |
| `--username` | `-u` | — | Username user |
| `--password` | `-p` | — | Password user |
| `--email` | `-e` | `""` | Email user (opsional) |
| `--role` | `-r` | `tenant` | Role pengguna |

---

### 3.4 `user_auth_manager.py`
Manager lengkap: tenant, user, dan admin (CRUD).

```bash
# Subcommands
python3 user_auth_manager.py <COMMAND> [OPTIONS]
```

| Subcommand | Opsi | Keterangan |
|------------|------|------------|
| `create-tenant` | `--code` (wajib), `--name` (wajib), `--database`, `--redis-prefix` | Daftarkan tenant kampus baru |
| `list-tenants` | — | Daftar seluruh tenant |
| `create-user` | `--user` (wajib), `--password` (wajib), `--tenant` (wajib), `--email`, `--role` (default: `tenant`) | Buat akun user tenant |
| `list-users` | — | Daftar seluruh user tenant |
| `delete-user` | `--user` (wajib) | Hapus user tenant |
| `create-admin` | `--user` (wajib), `--password` (wajib), `--name`, `--email`, `--role` (default: `admin`) | Buat akun admin platform |
| `list-admins` | — | Daftar seluruh admin |
| `delete-admin` | `--user` (wajib) | Hapus admin platform |

```bash
# Contoh
python3 user_auth_manager.py create-tenant --code UNAIR --name "Universitas Airlangga"
python3 user_auth_manager.py create-user --user john --password P@ss123 --tenant UNAIR
python3 user_auth_manager.py create-admin --user superadmin --password Admin@123
python3 user_auth_manager.py list-users
python3 user_auth_manager.py delete-user --user john
```

---

### 3.5 `manage_tenant_mappings.py`
Kelola mapping Wazuh Groups & IRIS Customers per tenant.

```bash
python3 manage_tenant_mappings.py [TENANT] [OPTIONS]
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--tenant` | `-t` | kode tenant atau `all` |
| `--add-wazuh-group` | `--add-wg` | Tambah Wazuh group (bisa koma-separated, repeatable) |
| `--remove-wazuh-group` | `--remove-wg` | Hapus Wazuh group (repeatable) |
| `--create-wazuh-group` | — | Auto-buat group di Wazuh API jika belum ada |
| `--add-iris-customer` | `--add-ic` | Tambah IRIS customer (`ID` atau `ID:Nama`, repeatable) |
| `--add-iris-id` | — | Tambah IRIS customer ID angka (repeatable) |
| `--add-iris-name` | — | Tambah IRIS customer by nama (repeatable) |
| `--remove-iris-customer` | `--remove-ic` | Hapus IRIS customer (repeatable) |
| `--remove-iris-id` | — | Hapus IRIS customer by ID (repeatable) |
| `--list` | `-l` | Tampilkan daftar pemetaan tenant |
| `--available` | `-a` | Tampilkan grup/customer yang belum terpetakan |
| `--json` | — | Output format JSON |
| `--dry-run` | — | Simulasi tanpa simpan ke database |

```bash
# Contoh
python3 manage_tenant_mappings.py -t UNAIR --list
python3 manage_tenant_mappings.py -t UNAIR --add-wg unair_group --create-wazuh-group
python3 manage_tenant_mappings.py -t UNAIR --add-ic 5:UnairCustomer
python3 manage_tenant_mappings.py -t UNAIR --remove-wg old_group --dry-run
python3 manage_tenant_mappings.py --available
```

---

### 3.6 `tenant_auth_gateway.py`
Gateway otentikasi & query data dengan isolasi tenant.

```bash
python3 tenant_auth_gateway.py <COMMAND> [OPTIONS]
```

| Subcommand | Opsi | Keterangan |
|------------|------|------------|
| `audit` | — | Audit isolasi data seluruh pengguna terdaftar |
| `login` | `--user\|-u` (wajib), `--password\|-p` (wajib) | Otentikasi login pengguna |
| `query` | `--user\|-u` (wajib), `--password\|-p` (wajib), `--tenant\|-t` (khusus superadmin), `--limit\|-l` (default: 10) | Kueri data insiden dengan isolasi tenant |

```bash
# Contoh
python3 tenant_auth_gateway.py audit
python3 tenant_auth_gateway.py login -u john -p SecureP@ss
python3 tenant_auth_gateway.py query -u john -p SecureP@ss -l 20
python3 tenant_auth_gateway.py query -u superadmin -p Admin@123 -t UNAIR -l 50
```

---

## 4. TTL & DATA RETENTION

### 4.1 `configure_ttl.py` / `set_ttl.py`
Konfigurasi kebijakan TTL (Time-To-Live) MongoDB & Redis. Kedua script **identik** (alias).

```bash
python3 configure_ttl.py [TENANT] [OPTIONS]
python3 set_ttl.py [TENANT] [OPTIONS]
```

| Opsi | Alias | Default | Nilai |
|------|-------|---------|-------|
| `--tenant` | `-t` | — | kode tenant atau `all` |
| `--mongo-days` | `-m` | (env default) | Durasi TTL MongoDB dalam hari (float) |
| `--redis-days` | `-r` | (env default) | Durasi TTL Redis cache dalam hari (float) |
| `--status` | `--check`, `-c` | false | Cek status kebijakan TTL saat ini |
| `--reset-default` | — | false | Reset TTL ke default standar |
| `--dry-run` | — | false | Simulasi tanpa menerapkan perubahan |
| `--json` | — | false | Output format JSON |

```bash
# Contoh
python3 configure_ttl.py -t all --status
python3 configure_ttl.py -t UNAIR -m 60 -r 14
python3 set_ttl.py -t all --reset-default
python3 set_ttl.py -t UNAIR -m 90 --dry-run --json
```

---

## 5. INFRASTRUCTURE & SETUP

### 5.1 `installer.py`
Installer otomatis lengkap (venv, Go build, systemd, cron, health check).

```bash
python3 installer.py [OPTIONS]
```

| Opsi | Alias | Nilai |
|------|-------|-------|
| `--full-install` | — | Jalankan instalasi lengkap otomatis |
| `--set-ip` | — | Ubah IP server (misal: `--set-ip 192.168.1.100`) |
| `--rebuild-bin` | — | Kompilasi ulang seluruh binari Go |
| `--setup-systemd` | — | Pasang/update unit service systemd |
| `--check` | `--health` | Jalankan uji diagnostik konektivitas |

```bash
# Contoh
python3 installer.py --full-install
python3 installer.py --set-ip 10.20.100.86
python3 installer.py --rebuild-bin
python3 installer.py --check
```

---

### 5.2 `init_indexes.py`
Aplikasi indexing & TTL policy MongoDB untuk production.

```bash
python3 init_indexes.py
```

> [!NOTE]
> **Tanpa argumen** — otomatis baca semua tenant dari MySQL lalu terapkan indexes ke seluruh collection MongoDB.

---

## Ringkasan Jumlah

| Kategori | Jumlah | Scripts |
|----------|--------|---------|
| Sync Pipeline | 6 + 1 shell | `sync_alerts_*`, `sync_vulnerability_*`, `sync_wazuh_agents`, `sync_iris_reports`, `sync_mongo_redis_*`, `cron_hourly_sync.sh` |
| Check/Audit | 8 | `check_alerts_*` (2), `check_vulnerability_*`, `check_mongo_redis_*`, `check_wazuh_agents`, `check_iris_reports`, `check_incident_dates`, `check_tenant_mappings` |
| Tenant & User | 5 | `register_tenant`, `delete_tenant`, `create_tenant_user`, `user_auth_manager`, `manage_tenant_mappings` |
| Auth Gateway | 1 | `tenant_auth_gateway` |
| TTL/Retention | 2 | `configure_ttl`, `set_ttl` (identik) |
| Infrastructure | 2 | `installer`, `init_indexes` |
| **Total** | **25** | |
