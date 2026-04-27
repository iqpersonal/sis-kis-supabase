-- ============================================================
-- SiS-KiS Supabase Schema Migration
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/clrzakvxvbtae1hyndwn/sql
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Admin Users (maps Supabase Auth users to RBAC roles) ────
-- This is the most critical table — auth context depends on it.
CREATE TABLE IF NOT EXISTS public.admin_users (
  id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT        NOT NULL,
  display_name        TEXT,
  username            TEXT,
  role                TEXT        NOT NULL DEFAULT 'viewer',
  roles               TEXT[]      NOT NULL DEFAULT '{}',
  secondary_roles     TEXT[]      NOT NULL DEFAULT '{}',
  assigned_major      TEXT,
  supervised_classes  TEXT[]      NOT NULL DEFAULT '{}',
  supervised_subjects TEXT[]      NOT NULL DEFAULT '{}',
  teaches             BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extra columns for teacher local-auth and profile
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS school_year TEXT;

-- Enable RLS — only the service role client (backend) and the user themselves can read their own row
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own record" ON public.admin_users;

CREATE POLICY "Users can read own record"
  ON public.admin_users FOR SELECT
  USING (auth.uid() = id);

-- Service role bypasses RLS automatically — no policy needed for backend

-- ─── Academic Years ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academic_years (
  id          TEXT PRIMARY KEY,  -- e.g. "2025-2026"
  label       TEXT NOT NULL,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibility columns for legacy route expectations
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS academic_year TEXT;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS "Academic_Year" TEXT;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS current_year BOOLEAN;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS "Current_Year" BOOLEAN;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS date_from DATE;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS "Date_From" DATE;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS date_to DATE;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS "Date_To" DATE;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS term_count INTEGER;

-- ─── Students ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.students (
  student_number    TEXT        PRIMARY KEY,
  first_name        TEXT,
  last_name         TEXT,
  full_name         TEXT,
  arabic_name       TEXT,
  gender            TEXT,
  date_of_birth     DATE,
  nationality       TEXT,
  passport_number   TEXT,
  iqama_number      TEXT,
  email             TEXT,
  phone             TEXT,
  photo_url         TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Registrations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registrations (
  id              TEXT        PRIMARY KEY,   -- Firestore doc id
  student_number  TEXT        REFERENCES public.students(student_number),
  academic_year   TEXT        REFERENCES public.academic_years(id),
  school          TEXT,        -- 'KG' | 'Primary' | 'Middle' | 'High'
  grade           TEXT,        -- e.g. 'Grade 7'
  section         TEXT,        -- section id
  class_id        TEXT,
  status          TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'withdrawn' | 'transferred'
  enrollment_date DATE,
  withdrawal_date DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibility columns used by migrated API routes
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS major_code TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS class_code TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS section_code TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS termination_date DATE;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS school_code TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS "School_Code" TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS "Class_Code" TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS "Section_Code" TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS family_number TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS "Family_Number" TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS "Academic_Year" TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS "Termination_Date" DATE;

-- ─── Sections ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sections (
  id              TEXT        PRIMARY KEY,
  academic_year   TEXT        REFERENCES public.academic_years(id),
  school          TEXT,
  grade           TEXT,
  section_name    TEXT,
  homeroom_teacher TEXT,
  max_students    INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS "Class_Code" TEXT;
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS "Section_Code" TEXT;
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS "Major_Code" TEXT;
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS class_code TEXT;
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS section_code TEXT;
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS major_code TEXT;

-- ─── Classes (subjects per section) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.classes (
  id              TEXT        PRIMARY KEY,
  academic_year   TEXT        REFERENCES public.academic_years(id),
  section_id      TEXT        REFERENCES public.sections(id),
  subject_code    TEXT,
  subject_name    TEXT,
  teacher_username TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS class_code TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "Class_Code" TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS e_class_name TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "E_Class_Name" TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS a_class_name TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "A_Class_Name" TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS e_class_desc TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "E_Class_Desc" TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS a_class_desc TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "A_Class_Desc" TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS e_class_abbreviation TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "E_Class_Abbreviation" TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS a_class_abbreviation TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "A_Class_Abbreviation" TEXT;

-- ─── Staff ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff (
  id              TEXT        PRIMARY KEY,
  employee_id     TEXT,
  first_name      TEXT,
  last_name       TEXT,
  full_name       TEXT,
  "E_Mail"        TEXT,        -- kept uppercase to match Firestore field name
  username        TEXT,
  department      TEXT,
  position        TEXT,
  phone           TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sponsors / Guardians ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsors (
  id              TEXT        PRIMARY KEY,
  student_number  TEXT        REFERENCES public.students(student_number),
  relationship    TEXT,        -- 'father' | 'mother' | 'guardian'
  full_name       TEXT,
  arabic_name     TEXT,
  phone           TEXT,
  whatsapp        TEXT,
  email           TEXT,
  iqama_number    TEXT,
  passport_number TEXT,
  nationality     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Student Absence ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_absence (
  id              TEXT        PRIMARY KEY,
  student_number  TEXT        REFERENCES public.students(student_number),
  academic_year   TEXT,
  date            DATE        NOT NULL,
  period          TEXT,        -- 'AM' | 'PM' | period number
  reason          TEXT,
  excused         BOOLEAN     NOT NULL DEFAULT FALSE,
  recorded_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Student Tardy ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_tardy (
  id              TEXT        PRIMARY KEY,
  student_number  TEXT        REFERENCES public.students(student_number),
  academic_year   TEXT,
  date            DATE        NOT NULL,
  minutes_late    INTEGER,
  reason          TEXT,
  excused         BOOLEAN     NOT NULL DEFAULT FALSE,
  recorded_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Student Exam Results ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_exam_results (
  id              TEXT        PRIMARY KEY,
  student_number  TEXT        REFERENCES public.students(student_number),
  academic_year   TEXT,
  class_id        TEXT        REFERENCES public.classes(id),
  subject_code    TEXT,
  exam_code       TEXT,        -- '01' T1 Assess | '04' T1 Exam | '05' Sem1 | '06' T2 Assess | '09' T2 Exam | '10' Sem2 | '11' Annual
  grade_value     NUMERIC(5,2),
  letter_grade    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Student Progress ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_progress (
  id              TEXT        PRIMARY KEY,
  student_number  TEXT        REFERENCES public.students(student_number),
  academic_year   TEXT,
  overall_sem1    NUMERIC(5,2),
  overall_sem2    NUMERIC(5,2),
  overall_annual  NUMERIC(5,2),
  rank_in_class   INTEGER,
  promoted        BOOLEAN,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Fees / Finance ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_charges (
  id              TEXT        PRIMARY KEY,
  student_number  TEXT        REFERENCES public.students(student_number),
  academic_year   TEXT,
  charge_type     TEXT,
  description     TEXT,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'SAR',
  due_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_invoices (
  id              TEXT        PRIMARY KEY,
  student_number  TEXT        REFERENCES public.students(student_number),
  academic_year   TEXT,
  invoice_number  TEXT,
  total_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'unpaid',  -- 'unpaid' | 'partial' | 'paid'
  issue_date      DATE,
  due_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_installments (
  id              TEXT        PRIMARY KEY,
  invoice_id      TEXT        REFERENCES public.student_invoices(id),
  student_number  TEXT        REFERENCES public.students(student_number),
  amount          NUMERIC(10,2) NOT NULL,
  paid_at         TIMESTAMPTZ,
  payment_method  TEXT,
  receipt_number  TEXT,
  recorded_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_discounts (
  id              TEXT        PRIMARY KEY,
  student_number  TEXT        REFERENCES public.students(student_number),
  academic_year   TEXT,
  discount_type   TEXT,
  percentage      NUMERIC(5,2),
  amount          NUMERIC(10,2),
  reason          TEXT,
  approved_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Announcements ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id              TEXT        PRIMARY KEY,
  title           TEXT        NOT NULL,
  body            TEXT,
  audience        TEXT[],      -- ['all'] | ['parents'] | ['teachers'] | ['students']
  pinned          BOOLEAN     NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Library ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.library_books (
  id              TEXT        PRIMARY KEY,
  barcode         TEXT        UNIQUE,
  title           TEXT        NOT NULL,
  title_ar        TEXT,
  author          TEXT,
  isbn            TEXT,
  category        TEXT,
  language        TEXT,
  publication_year INTEGER,
  publisher       TEXT,
  age_group       TEXT,
  grade_level     TEXT,
  pages           INTEGER,
  call_number     TEXT,
  total_copies    INTEGER     NOT NULL DEFAULT 1,
  available_copies INTEGER    NOT NULL DEFAULT 1,
  cover_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.library_copies (
  id              TEXT        PRIMARY KEY,
  book_id         TEXT        REFERENCES public.library_books(id),
  barcode         TEXT,
  status          TEXT        NOT NULL DEFAULT 'available',  -- available|borrowed|lost|damaged
  location        TEXT,
  condition       TEXT        NOT NULL DEFAULT 'good',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_library_copies_book ON public.library_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_library_copies_status ON public.library_copies(status);

CREATE TABLE IF NOT EXISTS public.library_borrowings (
  id              TEXT        PRIMARY KEY,
  book_id         TEXT        REFERENCES public.library_books(id),
  book_title      TEXT,
  book_title_ar   TEXT,
  author          TEXT,
  copy_id         TEXT        REFERENCES public.library_copies(id),
  student_number  TEXT,
  student_name    TEXT,
  borrower_type   TEXT        DEFAULT 'student',
  borrow_date     TEXT,
  due_date        TEXT,
  return_date     TEXT,
  status          TEXT        NOT NULL DEFAULT 'borrowed',  -- borrowed|returned|overdue|lost
  notes           TEXT,
  return_condition TEXT,
  return_notes    TEXT,
  fine            NUMERIC(8,2) DEFAULT 0,
  lost_date       TEXT,
  renewed_at      TEXT,
  checked_out_by  TEXT,
  recorded_by     TEXT,
  borrowed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_library_borrowings_student ON public.library_borrowings(student_number);
CREATE INDEX IF NOT EXISTS idx_library_borrowings_status ON public.library_borrowings(status);
CREATE INDEX IF NOT EXISTS idx_library_borrowings_book ON public.library_borrowings(book_id);

-- ─── App Config ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_config (
  id              TEXT        PRIMARY KEY,
  data            JSONB       NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Store ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_items (
  id              TEXT        PRIMARY KEY,
  barcode         TEXT        UNIQUE,
  name            TEXT        NOT NULL,
  name_ar         TEXT,
  category        TEXT,        -- 'general' | 'it' | 'bookshop'
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock           INTEGER     NOT NULL DEFAULT 0,
  image_url       TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_transactions (
  id              TEXT        PRIMARY KEY,
  item_id         TEXT        REFERENCES public.store_items(id),
  transaction_type TEXT       NOT NULL,  -- 'sale' | 'refund' | 'restock'
  quantity        INTEGER     NOT NULL,
  unit_price      NUMERIC(10,2),
  total_amount    NUMERIC(10,2),
  student_number  TEXT,
  staff_id        TEXT,
  recorded_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Book Sales ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.book_catalog (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  title_ar    TEXT,
  grade       TEXT,
  subject     TEXT,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  isbn        TEXT,
  year        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.book_bundles (
  id          TEXT PRIMARY KEY,
  grade       TEXT,
  year        TEXT,
  school      TEXT,
  book_ids    TEXT[] NOT NULL DEFAULT '{}',
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.book_sales (
  id             TEXT PRIMARY KEY,
  receipt_number TEXT,
  student_number TEXT,
  student_name   TEXT,
  family_number  TEXT,
  family_name    TEXT,
  grade          TEXT,
  school         TEXT,
  items          JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_rate       NUMERIC(5,2) NOT NULL DEFAULT 15,
  total_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  status         TEXT NOT NULL DEFAULT 'paid',
  sold_by        TEXT,
  year           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  void_reason    TEXT,
  voided_by      TEXT,
  voided_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.book_sales_meta (
  id    TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

-- ─── Notifications / Messages ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id              TEXT        PRIMARY KEY,
  recipient_type  TEXT,        -- 'student' | 'parent' | 'staff' | 'all'
  recipient_id    TEXT,
  title           TEXT,
  body            TEXT,
  channel         TEXT,        -- 'push' | 'whatsapp' | 'email' | 'sms'
  status          TEXT        NOT NULL DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Quiz ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quiz_assignments (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title           TEXT        NOT NULL,
  title_ar        TEXT,
  subject         TEXT        NOT NULL,
  class_code      TEXT        NOT NULL,  -- NWEA band "k-2"|"3-5"|"6-8"|"9-12"
  class_name      TEXT,
  section         TEXT        NOT NULL DEFAULT 'all',
  sis_class_code  TEXT,
  sis_section_code TEXT,
  sis_school      TEXT,
  question_ids    JSONB       NOT NULL DEFAULT '[]',
  question_count  INTEGER     NOT NULL DEFAULT 0,
  year            TEXT        NOT NULL,
  start_date      TEXT,
  end_date        TEXT,
  duration_minutes INTEGER    NOT NULL DEFAULT 0,
  adaptive        BOOLEAN     NOT NULL DEFAULT TRUE,
  status          TEXT        NOT NULL DEFAULT 'active',
  created_by      TEXT        NOT NULL,
  stats           JSONB       NOT NULL DEFAULT '{"started":0,"completed":0,"avg_score":0}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_assignments_class   ON public.quiz_assignments(class_code);
CREATE INDEX IF NOT EXISTS idx_quiz_assignments_year    ON public.quiz_assignments(year);
CREATE INDEX IF NOT EXISTS idx_quiz_assignments_status  ON public.quiz_assignments(status);
CREATE INDEX IF NOT EXISTS idx_quiz_assignments_sis     ON public.quiz_assignments(sis_class_code);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  text            TEXT        NOT NULL,
  text_ar         TEXT,
  type            TEXT        NOT NULL DEFAULT 'mcq',
  subject         TEXT        NOT NULL,
  class_code      TEXT        NOT NULL,
  difficulty      INTEGER     NOT NULL DEFAULT 3,  -- 1-5
  options         JSONB       NOT NULL DEFAULT '[]',  -- [{label,text,text_ar}]
  correct_option  TEXT        NOT NULL,  -- "A","B","C","D"
  explanation     TEXT,
  standard        TEXT,
  created_by      TEXT        NOT NULL,
  year            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_subject    ON public.quiz_questions(subject);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_class      ON public.quiz_questions(class_code);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_difficulty ON public.quiz_questions(difficulty);

CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id                    TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id         TEXT        NOT NULL,
  student_number        TEXT        NOT NULL,
  student_name          TEXT,
  subject               TEXT,
  class_code            TEXT,
  year                  TEXT,
  adaptive              BOOLEAN     NOT NULL DEFAULT TRUE,
  status                TEXT        NOT NULL DEFAULT 'active',
  current_difficulty    INTEGER     NOT NULL DEFAULT 3,
  current_question_index INTEGER    NOT NULL DEFAULT 0,
  total_questions       INTEGER     NOT NULL DEFAULT 0,
  question_pool         JSONB       NOT NULL DEFAULT '{}',
  answered              JSONB       NOT NULL DEFAULT '[]',
  answered_ids          JSONB       NOT NULL DEFAULT '[]',
  score                 INTEGER     NOT NULL DEFAULT 0,
  correct_count         INTEGER     NOT NULL DEFAULT 0,
  wrong_count           INTEGER     NOT NULL DEFAULT 0,
  rapid_guess_count     INTEGER     NOT NULL DEFAULT 0,
  consecutive_fast      INTEGER     NOT NULL DEFAULT 0,
  mastery               TEXT,
  estimated_ability     INTEGER,
  difficulty_breakdown  JSONB,
  avg_time_per_question INTEGER,
  total_time            INTEGER,
  duration_limit        INTEGER     NOT NULL DEFAULT 0,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at             TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_assignment ON public.quiz_sessions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student    ON public.quiz_sessions(student_number);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_status     ON public.quiz_sessions(status);

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id                    TEXT        PRIMARY KEY,  -- assignment_id + "_" + student_number
  assignment_id         TEXT        NOT NULL,
  student_number        TEXT        NOT NULL,
  student_name          TEXT,
  subject               TEXT,
  class_code            TEXT,
  year                  TEXT,
  score                 INTEGER     NOT NULL DEFAULT 0,
  mastery               TEXT,
  estimated_ability     INTEGER,
  correct_count         INTEGER     NOT NULL DEFAULT 0,
  total_questions       INTEGER     NOT NULL DEFAULT 0,
  difficulty_breakdown  JSONB,
  avg_time_per_question INTEGER,
  total_time            INTEGER,
  rapid_guess_count     INTEGER,
  percentage            INTEGER     GENERATED ALWAYS AS (score) STORED,
  completed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_results_student    ON public.quiz_results(student_number);
CREATE INDEX IF NOT EXISTS idx_quiz_results_assignment ON public.quiz_results(assignment_id);

-- ─── Exam Seating ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_halls (
  id          TEXT PRIMARY KEY,
  hallName    TEXT NOT NULL,
  campus      TEXT NOT NULL,
  rows        INTEGER NOT NULL,
  columns     INTEGER NOT NULL,
  isActive    BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.exam_schedules (
  id            TEXT PRIMARY KEY,
  academicYear  TEXT NOT NULL,
  examType      TEXT NOT NULL,
  gradeGroup    TEXT NOT NULL,
  days          JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft',
  createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.exam_seating_plans (
  id            TEXT PRIMARY KEY,
  scheduleId    TEXT NOT NULL REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
  examDate      DATE,
  subjectName   TEXT,
  subjectCode   TEXT,
  campus        TEXT,
  gradeGroup    TEXT,
  academicYear  TEXT,
  halls         JSONB NOT NULL DEFAULT '[]'::jsonb,
  totalStudents INTEGER NOT NULL DEFAULT 0,
  generatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Diploma Verifications ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diploma_verifications (
  id              TEXT        PRIMARY KEY,  -- UUID verification code
  student_name    TEXT        NOT NULL,
  student_number  TEXT        NOT NULL,
  ceremony_date   TEXT,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── IT / Fixed Assets ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.it_assets (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                    TEXT        UNIQUE NOT NULL,
  asset_type                  TEXT        NOT NULL,
  brand                       TEXT        NOT NULL,
  model                       TEXT        NOT NULL,
  serial_number               TEXT        UNIQUE NOT NULL,
  purchase_date               TEXT,
  purchase_price              NUMERIC(12,2),
  warranty_expiry             TEXT,
  status                      TEXT        NOT NULL DEFAULT 'available',
  condition                   TEXT        NOT NULL DEFAULT 'good',
  location                    TEXT,
  branch                      TEXT,
  assigned_to                 TEXT,
  assigned_to_name            TEXT,
  assigned_date               TEXT,
  notes                       TEXT,
  specs                       JSONB       DEFAULT '{}'::jsonb,
  useful_life_years           INTEGER,
  salvage_value               NUMERIC(12,2),
  next_maintenance_date       TEXT,
  maintenance_interval_days   INTEGER,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_it_assets_asset_type ON public.it_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_it_assets_status ON public.it_assets(status);
CREATE INDEX IF NOT EXISTS idx_it_assets_assigned_to ON public.it_assets(assigned_to);

-- IT Asset History
CREATE TABLE IF NOT EXISTS public.it_asset_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        TEXT        NOT NULL,
  action          TEXT        NOT NULL,
  from_staff      TEXT,
  to_staff        TEXT,
  notes           TEXT,
  performed_by    TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_it_asset_history_asset_id ON public.it_asset_history(asset_id);

-- ─── Section Averages (cached per section per subject) ────────
CREATE TABLE IF NOT EXISTS public.section_averages (
  id              TEXT        PRIMARY KEY,
  section_id      TEXT        REFERENCES public.sections(id),
  academic_year   TEXT,
  subject_code    TEXT,
  exam_code       TEXT,
  average         NUMERIC(5,2),
  highest         NUMERIC(5,2),
  lowest          NUMERIC(5,2),
  pass_count      INTEGER,
  fail_count      INTEGER,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Parent Config (browse index cache) ──────────────────────
CREATE TABLE IF NOT EXISTS public.parent_config (
  id              TEXT        PRIMARY KEY,
  buckets         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Families (for contact update flow) ──────────────────────
CREATE TABLE IF NOT EXISTS public.families (
  id                TEXT        PRIMARY KEY,
  family_number     TEXT        UNIQUE,
  family_name       TEXT,
  father_name       TEXT,
  mother_name       TEXT,
  father_phone      TEXT,
  mother_phone      TEXT,
  father_email      TEXT,
  mother_email      TEXT,
  address_city      TEXT,
  address_district  TEXT,
  address_street    TEXT,
  emergency_name    TEXT,
  emergency_phone   TEXT,
  father_workplace  TEXT,
  mother_workplace  TEXT,
  children          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  contact_updated_at TIMESTAMPTZ,
  contact_updated_via TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_families_family_number ON public.families(family_number);

-- Extra auth columns for parent local-login
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_families_username ON public.families(username) WHERE username IS NOT NULL;

-- ─── Student Credentials (local login cache) ──────────────────
CREATE TABLE IF NOT EXISTS public.student_credentials (
  student_number  TEXT        PRIMARY KEY,
  student_name    TEXT,
  username        TEXT        UNIQUE,
  password_hash   TEXT,
  gender          TEXT,
  class_name      TEXT,
  section_name    TEXT,
  school          TEXT,
  family_number   TEXT,
  academic_year   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Subjects reference list ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id              TEXT        PRIMARY KEY,
  subject_code    TEXT        NOT NULL,
  e_subject_name  TEXT,
  a_subject_name  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_code ON public.subjects(subject_code);

-- ─── System Config ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_config (
  id              TEXT        PRIMARY KEY,
  data            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Contact Update Tokens / Audits ──────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_update_tokens (
  id              TEXT        PRIMARY KEY,
  family_number   TEXT        NOT NULL,
  used            BOOLEAN     NOT NULL DEFAULT FALSE,
  verified        BOOLEAN     NOT NULL DEFAULT FALSE,
  otp             TEXT,
  otp_expires_at  TIMESTAMPTZ,
  otp_attempts    INTEGER     NOT NULL DEFAULT 0,
  otp_sends       INTEGER     NOT NULL DEFAULT 0,
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_update_tokens_family ON public.contact_update_tokens(family_number);

CREATE TABLE IF NOT EXISTS public.contact_updates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_number   TEXT,
  token           TEXT,
  old_values      JSONB,
  new_values      JSONB,
  changed_fields  TEXT[],
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_phone  BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ─── WhatsApp Message Log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mode              TEXT,
  templateName      TEXT,
  templateId        TEXT,
  text              TEXT,
  audience          TEXT,
  audience_filter   JSONB,
  sender            TEXT,
  purpose           TEXT,
  total_families    INTEGER,
  total_recipients  INTEGER,
  sent              INTEGER,
  failed            INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── WhatsApp Bot Log / Session State ───────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_bot_log (
  id              TEXT        PRIMARY KEY,
  phone           TEXT        NOT NULL,
  message         TEXT,
  action          TEXT,
  family_number   TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_bot_log_timestamp ON public.whatsapp_bot_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bot_log_phone ON public.whatsapp_bot_log(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bot_log_action ON public.whatsapp_bot_log(action);

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id              TEXT        PRIMARY KEY,
  phone           TEXT,
  flow            TEXT,
  step            TEXT,
  current_child   INTEGER     NOT NULL DEFAULT 0,
  total_children  INTEGER     NOT NULL DEFAULT 0,
  data            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON public.whatsapp_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_expires_at ON public.whatsapp_sessions(expires_at);

-- ─── Admission Flow ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admission_config (
  id              TEXT        PRIMARY KEY,
  last_number     INTEGER     NOT NULL DEFAULT 1000,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admission_enquiries (
  id              TEXT        PRIMARY KEY,
  ref_number      TEXT        UNIQUE,
  phone           TEXT,
  parent_name     TEXT,
  email           TEXT,
  students        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  student_count   INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'new',
  source          TEXT,
  notes           TEXT,
  email_sent      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admission_enquiries ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.admission_enquiries ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_admission_enquiries_phone ON public.admission_enquiries(phone);
CREATE INDEX IF NOT EXISTS idx_admission_enquiries_created_at ON public.admission_enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_admission_enquiries_status ON public.admission_enquiries(status);

CREATE TABLE IF NOT EXISTS public.admission_tests (
  id              TEXT        PRIMARY KEY,
  enquiry_ref     TEXT,
  parent_name     TEXT,
  student_name    TEXT,
  desired_grade   TEXT,
  test_date       TEXT,
  time            TEXT,
  place           TEXT,
  staff           TEXT,
  math_score      NUMERIC(6,2),
  english_score   NUMERIC(6,2),
  arabic_score    NUMERIC(6,2),
  result          TEXT        NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admission_tests ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE public.admission_tests ADD COLUMN IF NOT EXISTS place TEXT;
ALTER TABLE public.admission_tests ADD COLUMN IF NOT EXISTS staff TEXT;

CREATE INDEX IF NOT EXISTS idx_admission_tests_enquiry_ref ON public.admission_tests(enquiry_ref);
CREATE INDEX IF NOT EXISTS idx_admission_tests_created_at ON public.admission_tests(created_at);

CREATE TABLE IF NOT EXISTS public.admission_interviews (
  id              TEXT        PRIMARY KEY,
  enquiry_ref     TEXT,
  parent_name     TEXT,
  student_name    TEXT,
  desired_grade   TEXT,
  interview_date  TEXT,
  interview_time  TEXT,
  place           TEXT,
  interviewer     TEXT,
  outcome         TEXT        NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admission_interviews ADD COLUMN IF NOT EXISTS place TEXT;

CREATE INDEX IF NOT EXISTS idx_admission_interviews_enquiry_ref ON public.admission_interviews(enquiry_ref);
CREATE INDEX IF NOT EXISTS idx_admission_interviews_created_at ON public.admission_interviews(created_at);

-- ─── Daily Attendance ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_attendance (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE        NOT NULL,
  student_number  TEXT        NOT NULL,
  student_name    TEXT,
  class_code      TEXT        NOT NULL,
  section_code    TEXT,
  year            TEXT,
  school          TEXT,
  status          TEXT        NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_attendance_lookup
  ON public.daily_attendance(date, class_code, student_number);

-- ─── Useful indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_registrations_student     ON public.registrations(student_number);
CREATE INDEX IF NOT EXISTS idx_registrations_year        ON public.registrations(academic_year);
CREATE INDEX IF NOT EXISTS idx_registrations_section     ON public.registrations(section);
CREATE INDEX IF NOT EXISTS idx_student_absence_sn        ON public.student_absence(student_number);
CREATE INDEX IF NOT EXISTS idx_student_tardy_sn          ON public.student_tardy(student_number);
CREATE INDEX IF NOT EXISTS idx_exam_results_sn           ON public.student_exam_results(student_number);
CREATE INDEX IF NOT EXISTS idx_exam_results_class        ON public.student_exam_results(class_id);
CREATE INDEX IF NOT EXISTS idx_store_items_barcode       ON public.store_items(barcode);
CREATE INDEX IF NOT EXISTS idx_book_catalog_grade_year   ON public.book_catalog(grade, year);
CREATE INDEX IF NOT EXISTS idx_book_bundles_grade_year   ON public.book_bundles(grade, year);
CREATE INDEX IF NOT EXISTS idx_book_sales_year           ON public.book_sales(year);
CREATE INDEX IF NOT EXISTS idx_book_sales_family         ON public.book_sales(family_number);
CREATE INDEX IF NOT EXISTS idx_book_sales_status         ON public.book_sales(status);
CREATE INDEX IF NOT EXISTS idx_book_sales_created_at     ON public.book_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_users_email         ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_staff_email               ON public.staff("E_Mail");
CREATE INDEX IF NOT EXISTS idx_exam_halls_campus         ON public.exam_halls(campus);
CREATE INDEX IF NOT EXISTS idx_exam_schedules_year_type  ON public.exam_schedules(academicYear, examType);
CREATE INDEX IF NOT EXISTS idx_exam_plans_schedule       ON public.exam_seating_plans(scheduleId);

-- ─── Assessment Templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assessment_templates (
  id              TEXT        PRIMARY KEY,  -- e.g. "25-26_24_MTH_S1"
  academic_year   TEXT,
  class_code      TEXT,
  subject_code    TEXT,
  semester        TEXT,
  status          TEXT        NOT NULL DEFAULT 'draft',
  categories      JSONB,       -- array of { id, name, sub_assessments: [{id, name, max_score}] }
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Assessment Scores ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assessment_scores (
  id              TEXT        PRIMARY KEY,  -- "year_sem_student_subject_subId"
  academic_year   TEXT,
  semester        TEXT,
  student_number  TEXT,
  subject_code    TEXT,
  class_code      TEXT,
  section_code    TEXT,
  category_id     TEXT,
  sub_assessment_id TEXT,
  score           NUMERIC(6,2),
  max_score       NUMERIC(6,2),
  recorded_by     TEXT,
  recorded_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assessment_scores_lookup
  ON public.assessment_scores(academic_year, semester, class_code, section_code, subject_code);

-- ─── Exam Results (teacher portal) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_results (
  id              TEXT        PRIMARY KEY,  -- "year_term_student_subject"
  "STUDENT_NUMBER" TEXT,
  "SUBJECT"       TEXT,
  "TOTAL"         NUMERIC(6,2),
  "TERM"          TEXT,
  "SCHOOL_YEAR"   TEXT,
  "GRADE"         TEXT,
  "SECTION"       TEXT,
  recorded_by     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_results_grade_year
  ON public.exam_results("GRADE", "SCHOOL_YEAR");

-- ─── Daily Attendance (teacher portal) ───────────────────────
-- extends existing daily_attendance table with class_code column
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS class_code TEXT;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS recorded_by TEXT;

-- ─── Departments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id              TEXT        PRIMARY KEY,
  name            TEXT,
  name_ar         TEXT,
  head_staff_id   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Family Children ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.family_children (
  id              TEXT        PRIMARY KEY,
  "Family_Number" TEXT,
  "Child_Number"  INTEGER,
  "E_Child_Name"  TEXT,
  "A_Child_Name"  TEXT,
  "Gender"        BOOLEAN,     -- true=M, false=F
  "Nationality_Code_Primary" TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_children_family
  ON public.family_children("Family_Number");

-- ─── Raw Family ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_family (
  id              TEXT        PRIMARY KEY,
  "Family_Number" TEXT        UNIQUE,
  "E_Father_Name" TEXT,
  "A_Father_Name" TEXT,
  "E_Family_Name" TEXT,
  "A_Family_Name" TEXT,
  data            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Student Progress (extended columns) ─────────────────────
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS student_number_ref TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS student_name_ar TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS class_name TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS section_name TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS passport_id TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS iqama_number TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS passport_expiry TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS iqama_expiry TEXT;
ALTER TABLE public.student_progress ADD COLUMN IF NOT EXISTS data JSONB;

-- ─── Student Absence (SIS SQL Server field names) ─────────────
ALTER TABLE public.student_absence ADD COLUMN IF NOT EXISTS "Student_Number" TEXT;
ALTER TABLE public.student_absence ADD COLUMN IF NOT EXISTS absence_date TEXT;
ALTER TABLE public.student_absence ADD COLUMN IF NOT EXISTS no_of_days INTEGER DEFAULT 1;
ALTER TABLE public.student_absence ADD COLUMN IF NOT EXISTS absence_reason_code TEXT;
ALTER TABLE public.student_absence ADD COLUMN IF NOT EXISTS absence_reason_desc TEXT;
ALTER TABLE public.student_absence ADD COLUMN IF NOT EXISTS year_code TEXT;

-- ─── Student Tardy (SIS SQL Server field names) ───────────────
ALTER TABLE public.student_tardy ADD COLUMN IF NOT EXISTS "Student_Number" TEXT;
ALTER TABLE public.student_tardy ADD COLUMN IF NOT EXISTS tardy_date TEXT;
ALTER TABLE public.student_tardy ADD COLUMN IF NOT EXISTS tardy_reason_code TEXT;
ALTER TABLE public.student_tardy ADD COLUMN IF NOT EXISTS tardy_reason_desc TEXT;
ALTER TABLE public.student_tardy ADD COLUMN IF NOT EXISTS year_code TEXT;

-- ─── Messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id              TEXT        PRIMARY KEY,
  title           TEXT,
  body            TEXT,
  sender          TEXT,
  audience        TEXT        NOT NULL DEFAULT 'all',   -- 'all'|'school'|'class'|'family'
  audience_filter JSONB       NOT NULL DEFAULT '{}',
  read_by         TEXT[]      NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_audience ON public.messages(audience);
CREATE INDEX IF NOT EXISTS idx_messages_created   ON public.messages(created_at DESC);

-- ─── Store Items (extended) ───────────────────────────────────
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS store_type TEXT DEFAULT 'general';  -- 'general'|'it'
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_store_items_store_type ON public.store_items(store_type);

-- ─── Store Requests (combines gs_requests + its_requests) ─────
CREATE TABLE IF NOT EXISTS public.store_requests (
  id              TEXT        PRIMARY KEY,
  request_id      TEXT        UNIQUE,
  store_type      TEXT        NOT NULL DEFAULT 'general',  -- 'general'|'it'
  requested_by    TEXT,
  requested_by_name TEXT,
  items           JSONB       NOT NULL DEFAULT '[]',
  status          TEXT        NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'issued'
  notes           TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by     TEXT,
  reviewed_by_name TEXT,
  reviewed_at     TIMESTAMPTZ,
  issued_by       TEXT,
  issued_by_name  TEXT,
  issued_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_requests_by ON public.store_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_store_requests_status ON public.store_requests(status);

-- ─── Counters ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.counters (
  id              TEXT        PRIMARY KEY,
  count           INTEGER     NOT NULL DEFAULT 0
);

-- ─── Audit Log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor           TEXT,
  action          TEXT,
  details         TEXT,
  target_id       TEXT,
  target_type     TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_ts      ON public.audit_log(timestamp DESC);

-- ─── Reports (upload destination) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id              TEXT        PRIMARY KEY,
  data            JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Push Tokens ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id              TEXT        PRIMARY KEY,
  family_number   TEXT,
  student_number  TEXT,
  school          TEXT,
  class           TEXT,
  section         TEXT,
  tokens          JSONB       NOT NULL DEFAULT '[]',   -- [{token, platform}]
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_family ON public.push_tokens(family_number);
CREATE INDEX IF NOT EXISTS idx_push_tokens_school ON public.push_tokens(school);

-- ─── Student Transfers ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_transfers (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_number  TEXT,
  student_name    TEXT,
  class_name      TEXT,
  school          TEXT,
  type            TEXT        NOT NULL DEFAULT 'transfer',  -- 'transfer'|'withdrawal'
  status          TEXT        NOT NULL DEFAULT 'pending',   -- 'pending'|'approved'|'completed'|'cancelled'
  reason          TEXT,
  destination_school TEXT,
  effective_date  TEXT,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_transfers_status ON public.student_transfers(status);
CREATE INDEX IF NOT EXISTS idx_student_transfers_student ON public.student_transfers(student_number);

-- ─── Fee Transactions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fee_transactions (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_number  TEXT,
  year            TEXT,
  installment_label TEXT,
  amount          NUMERIC(10,2) NOT NULL,
  type            TEXT        NOT NULL,   -- 'payment'|'discount'|'charge'|'adjustment'
  notes           TEXT,
  recorded_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_tx_student ON public.fee_transactions(student_number);

-- Store Notifications
CREATE TABLE IF NOT EXISTS public.store_notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT        NOT NULL DEFAULT 'operational',  -- 'operational'|'request_status'|'request_issued'
  type            TEXT        NOT NULL,
  severity        TEXT,
  title           TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  store_type      TEXT,       -- 'general'|'it'
  scope           TEXT,
  alert_key       TEXT,
  item_doc_id     TEXT,
  item_id         TEXT,
  item_name       TEXT,
  quantity        INTEGER,
  reorder_level   INTEGER,
  request_id      TEXT,
  staff_number    TEXT,
  staff_name      TEXT,
  dn_number       TEXT,
  recipient_roles TEXT[],
  active          BOOLEAN     DEFAULT TRUE,
  read            BOOLEAN     DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_notif_alert_key ON public.store_notifications(alert_key);
CREATE INDEX IF NOT EXISTS idx_store_notif_staff ON public.store_notifications(staff_number);

-- Delivery Notes
CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dn_number            TEXT        UNIQUE NOT NULL,
  store_type           TEXT        NOT NULL,   -- 'general'|'it'
  branch               TEXT,
  request_id           TEXT,
  items                JSONB       NOT NULL DEFAULT '[]',
  issued_by            TEXT,
  issued_by_name       TEXT,
  received_by          TEXT,
  received_by_name     TEXT,
  received_by_name_ar  TEXT,
  department           TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending_acknowledgment',
  issued_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at      TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_store_type ON public.delivery_notes(store_type);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_request ON public.delivery_notes(request_id);

-- Stock Takes
CREATE TABLE IF NOT EXISTS public.stock_takes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_type      TEXT        NOT NULL,  -- 'general'|'it'
  status          TEXT        NOT NULL DEFAULT 'in_progress',  -- 'in_progress'|'completed'
  created_by      TEXT,
  completed_by    TEXT,
  notes           TEXT,
  items           JSONB       NOT NULL DEFAULT '{}',
  item_count      INTEGER     NOT NULL DEFAULT 0,
  counted         INTEGER     NOT NULL DEFAULT 0,
  variances       INTEGER     NOT NULL DEFAULT 0,
  adjustments_applied BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number       TEXT        UNIQUE NOT NULL,
  store_type      TEXT        NOT NULL,
  supplier        TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft',  -- 'draft'|'approved'|'partial'|'received'
  items           JSONB       NOT NULL DEFAULT '[]',
  total_cost      NUMERIC(12,2) DEFAULT 0,
  notes           TEXT,
  expected_date   TEXT,
  created_by      TEXT,
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fixed Assets
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                    TEXT        UNIQUE NOT NULL,
  category                    TEXT        NOT NULL,
  name                        TEXT        NOT NULL,
  name_ar                     TEXT,
  serial_number               TEXT,
  department                  TEXT,
  purchase_date               TEXT,
  purchase_price              NUMERIC(12,2),
  warranty_expiry             TEXT,
  status                      TEXT        NOT NULL DEFAULT 'available',
  condition                   TEXT        NOT NULL DEFAULT 'good',
  location                    TEXT,
  branch                      TEXT,
  notes                       TEXT,
  useful_life_years           INTEGER,
  salvage_value               NUMERIC(12,2),
  next_maintenance_date       TEXT,
  maintenance_interval_days   INTEGER,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON public.fixed_assets(category);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON public.fixed_assets(status);

-- Fixed Asset History
CREATE TABLE IF NOT EXISTS public.fixed_asset_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        TEXT        NOT NULL,
  action          TEXT        NOT NULL,
  notes           TEXT,
  performed_by    TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fa_history_asset_id ON public.fixed_asset_history(asset_id);

-- ─── KG Assessments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kg_assessments (
  id              TEXT        PRIMARY KEY,  -- academic_year_term_student_number
  student_number  TEXT,
  student_name    TEXT,
  class_code      TEXT,
  class_name      TEXT,
  section_code    TEXT,
  section_name    TEXT,
  academic_year   TEXT,
  term            TEXT,
  ratings         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  domain_notes    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  teacher_comment TEXT,
  recorded_by     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kg_assessments_year_term ON public.kg_assessments(academic_year, term);
CREATE INDEX IF NOT EXISTS idx_kg_assessments_student   ON public.kg_assessments(student_number);

-- ─── KG Skill Domains ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kg_skill_domains (
  id              TEXT        PRIMARY KEY,  -- academic year e.g. "25-26"
  domains         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Notification Reads (read-status for auto-generated alerts) ──
CREATE TABLE IF NOT EXISTS public.notification_reads (
  doc_id          TEXT        PRIMARY KEY,  -- "auto" or "store_{uid}"
  ids             TEXT[]      NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extend notifications table to support admin dashboard alerts
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS severity TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_number TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;

-- Compatibility columns for Firestore-migrated data
ALTER TABLE public.students     ADD COLUMN IF NOT EXISTS "Family_Number"  TEXT;
ALTER TABLE public.students     ADD COLUMN IF NOT EXISTS "Child_Number"   TEXT;
ALTER TABLE public.sections     ADD COLUMN IF NOT EXISTS "E_Section_Name" TEXT;
ALTER TABLE public.sections     ADD COLUMN IF NOT EXISTS "Academic_Year"  TEXT;
ALTER TABLE public.sponsors     ADD COLUMN IF NOT EXISTS "Student_Number" TEXT;
ALTER TABLE public.sponsors     ADD COLUMN IF NOT EXISTS "Sponsor_Type"   TEXT;
ALTER TABLE public.sponsors     ADD COLUMN IF NOT EXISTS "E_Sponsor_Name" TEXT;

-- ─── Progress Reports ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.progress_reports (
  id                      TEXT        PRIMARY KEY,  -- progressReportDocId(year,month,sn,subject)
  student_number          TEXT,
  student_name            TEXT,
  subject                 TEXT,
  class_code              TEXT,
  section_code            TEXT,
  academic_year           TEXT,
  month                   TEXT,
  term                    TEXT,
  academic_performance    TEXT,
  homework_effort         TEXT,
  participation           TEXT,
  conduct                 TEXT,
  notes                   TEXT,
  recorded_by             TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_progress_reports_year_month ON public.progress_reports(academic_year, month);
CREATE INDEX IF NOT EXISTS idx_progress_reports_student    ON public.progress_reports(student_number);

-- ─── Summaries (pre-aggregated data for AI insights / dashboards) ────────────
CREATE TABLE IF NOT EXISTS public.summaries (
  id          TEXT        PRIMARY KEY,  -- academic year e.g. "25-26"
  all         JSONB,
  "0021-01"   JSONB,
  "0021-02"   JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── IT Support Tickets ───────────────────────────────────────────────────────
-- ─── Quiz Summaries (pre-aggregated NWEA/quiz analytics) ─────────────────────
CREATE TABLE IF NOT EXISTS public.quiz_summaries (
  id          TEXT        PRIMARY KEY,  -- academic year e.g. "25-26"
  all         JSONB,
  "0021-01"   JSONB,
  "0021-02"   JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Delinquency Students (fully-paid / zero-paid lists per year+school) ──────
CREATE TABLE IF NOT EXISTS public.delinquency_students (
  id                   TEXT  PRIMARY KEY,  -- "{year}_{school}" e.g. "25-26_all"
  fully_paid_students  JSONB NOT NULL DEFAULT '[]',
  zero_paid_students   JSONB NOT NULL DEFAULT '[]',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── IT Support Tickets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.it_tickets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       TEXT        UNIQUE NOT NULL,
  staff_number    TEXT,
  staff_name      TEXT,
  title           TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  category        TEXT        NOT NULL DEFAULT 'other',
  priority        TEXT        NOT NULL DEFAULT 'medium',
  status          TEXT        NOT NULL DEFAULT 'open',
  assigned_to     TEXT,
  notes           JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_it_tickets_staff ON public.it_tickets(staff_number);
CREATE INDEX IF NOT EXISTS idx_it_tickets_status ON public.it_tickets(status);
