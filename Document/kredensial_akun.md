# Kredensial Akun ASOC Web Admin & Multi-Tenant

Dokumen ini berisi daftar kredensial akun pengguna, peran (*role*), dan akses portal untuk lingkungan pengembangan dan operasional ASOC.

---

## 🛡️ 1. Akun Superadmin (Central Admin Portal)

Digunakan khusus untuk masuk ke **Web Admin ASOC** ([`http://localhost:3001`](http://localhost:3001)).

| Role | Username | Email | Password | Hak Akses |
| :--- | :--- | :--- | :--- | :--- |
| **Superadmin** | `superadmin` | `superadmin@asoc.id` | `admin12345` | Akses penuh ke seluruh fitur diagnostic, multi-tenant database, benchmark, mapping agent Wazuh, dan background service monitor. |

---

## 🎓 2. Akun Tenant Kampus (Tenant Dashboard)

Digunakan untuk masuk ke **Dashboard Monitoring Tenant Kampus** ([`http://localhost:3000`](http://localhost:3000) / Port 3000).  
> **Catatan:** Akun-akun di bawah ini **tidak dapat masuk** ke Web Admin Portal.

| Tenant Kampus | Kode | Username | Email | Password | Database Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Universitas Indonesia** | `UI` | `user_ui` | `soc@ui.ac.id` | `PasswordUI2026!` | `universitas_indonesia` |
| **Universitas Indonesia (Analis)** | `UI` | `analyst_ui_1` | `analyst@ui.ac.id` | `AnalystUI2026!` | `universitas_indonesia` |
| **Universitas Pembangunan Jaya** | `UPJ` | `user_upj` | `soc@upj.ac.id` | `PasswordUPJ2026!` | `universitas_pembangunan_jaya` |
| **Institut Teknologi Bandung** | `ITB` | `analyst_itb` | `soc@itb.ac.id` | `AnalystITB2026!` | `institut_teknologi_bandung` |

---

## 🗄️ 3. Kredensial Akses Database & Backend VM (`10.175.209.82`)

| Service | Port | Username / Auth | Password / Key |
| :--- | :--- | :--- | :--- |
| **MySQL `auth_db`** | `3306` | `auth_user` | `admin12345` |
| **MongoDB SSOT** | `27017` | *Direct Connection* | - |
| **Redis L1 Cache** | `6379` | *Standalone* | - |
| **Wazuh REST API** | `55000` | `wazuh-wui` | `MyS3cr37P450r.*-` |
| **Wazuh OpenSearch** | `9200` | `admin` | *(Default cert/cluster)* |
| **DFIR-IRIS API** | `8443` | *API Key / Basic* | - |
