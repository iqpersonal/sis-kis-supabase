# Live SQL Server Sync Plan

## Connection Details

| Item | Value |
|---|---|
| Server IP | `172.16.1.160` |
| Server Name | `KIS-SIS-NEW\SQL2016` |
| Database | `SIS` |
| Auth Mode | SQL Server Authentication |
| Login | `sis_reader` (read-only, `db_datareader` role) |
| Password | Stored in `scripts/.env` (not committed to git) |
| ODBC Driver | `ODBC Driver 17 for SQL Server` |

## Connection String

```
DRIVER={ODBC Driver 17 for SQL Server};SERVER=172.16.1.160\SQL2016;DATABASE=SIS;UID=sis_reader;PWD=<from .env>;Connection Timeout=30;Encrypt=yes;TrustServerCertificate=yes;
```

## Connectivity Status (verified 2026-03-29)

- [x] Ping `172.16.1.160` — PASS (<1ms, same LAN)
- [x] SQL Server responding — PASS
- [x] SQL Server Authentication — ENABLED
- [x] ODBC Driver 17 installed on dev PC — YES
- [x] `sis_reader` login created — DONE (2026-03-30)

## SQL for IT to Run on KIS-SIS-NEW\SQL2016

```sql
CREATE LOGIN sis_reader WITH PASSWORD = 'YOUR_CHOSEN_PASSWORD';
USE [SIS];
CREATE USER sis_reader FOR LOGIN sis_reader;
ALTER ROLE db_datareader ADD MEMBER sis_reader;
```

## Implementation Plan

### 1. Create `scripts/.env`

```env
SQL_SERVER=172.16.1.160\SQL2016
SQL_DATABASE=SIS
SQL_UID=sis_reader
SQL_PWD=<password from IT>
```

### 2. Create `scripts/db_config.py`

Shared config module that:
- Reads credentials from `.env`
- Provides `connect_sql()` function
- Used by all scripts (replaces hardcoded `localhost\SQLEXPRESS`)

### 3. Create `scripts/live_sync_to_firestore.py`

Streamlined sync script that:
- Connects directly to `172.16.1.160\SQL2016` → `SIS`
- No `.bak` restore or temp DB needed
- Extracts same 24 tables (KEY_TABLES from extract_and_upload_sis.py)
- Uploads to Firestore in batches
- Logs to `scripts/live_sync.log`
- Retry logic for network failures

### 4. Update `.gitignore`

Ensure `.env` is excluded from version control.

### 5. Task Scheduler (daily 6 PM)

```powershell
schtasks /Create /TN "SiS-LiveSync" /TR "c:\Users\Admin\Desktop\Project\SiS\.venv\Scripts\python.exe c:\Users\Admin\Desktop\Project\SiS\scripts\live_sync_to_firestore.py" /SC DAILY /ST 18:00 /F
```

## Tables to Sync (24 tables)

| SQL Table | Firestore Collection |
|---|---|
| Student | students |
| Sponsor | sponsors |
| Registration | registrations |
| Registration_Status | registration_status |
| Student_Charges | student_charges |
| Student_Discount | student_discounts |
| Student_Installments | student_installments |
| Student_Invoice | student_invoices |
| Student_Absence | student_absence |
| Student_Exam_Results | student_exam_results |
| Student_Tardy | student_tardy |
| Section | sections |
| Section_Avg | section_averages |
| Class | classes |
| Class_Subjects | class_subjects |
| Subject | subjects |
| Employee | employees |
| Academic_Year | academic_years |
| Charge_Type | charge_types |
| Nationality | nationalities |
| Exams | exams |
| Branch | branches |
| School | schools |

## Security Notes

- `sis_reader` has `db_datareader` role ONLY — cannot write, delete, or alter anything
- Password stored in `.env` file, never hardcoded
- `.env` excluded from git via `.gitignore`
- `sa` credentials should NOT be used for sync scripts

## Existing Scripts to Migrate Later

These scripts still use `localhost\SQLEXPRESS` / `_bak_import_temp`:
- extract_and_upload_sis.py
- mirror_bak_to_firestore.py
- sync_all_data.py
- incremental_sync.py
- generate_summaries.py
- generate_parent_data.py
- check_doc_sizes.py
- ~20 check_*.py scripts

They can be updated to use `db_config.py` in a future phase.
