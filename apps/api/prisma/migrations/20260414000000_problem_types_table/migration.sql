-- Spec 09: Replace problem_type enum with problem_types table
-- This migration must be applied manually (prisma migrate resolve --applied)

-- 1. Create problem_types table
CREATE TABLE problem_types (
  id          TEXT PRIMARY KEY,
  name_hy     TEXT NOT NULL,
  name_ru     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- 2. Seed data
INSERT INTO problem_types (id, name_hy, name_ru, name_en, is_active, sort_order) VALUES
  ('pothole', 'Փոս', 'Яма', 'Pothole', true, 1),
  ('damaged_barrier', 'Վնասված պատնեշ', 'Поврежд. ограждение', 'Damaged barrier', true, 2),
  ('missing_marking', 'Բացակայ նշագծ', 'Отсутствие разметки', 'Missing marking', true, 3),
  ('damaged_sign', 'Վնասված նշան', 'Повреждённый знак', 'Damaged sign', true, 4),
  ('hazard', 'Վտանգ', 'Опасность', 'Hazard', true, 5),
  ('broken_light', 'Խափանված լույս', 'Неработающий светофор', 'Broken light', true, 6),
  ('missing_ramp', 'Բացակայ թեքություն', 'Отсутствие пандуса', 'Missing ramp', true, 7),
  ('other', 'Այլ', 'Другое', 'Other', true, 8),
  ('not_a_road_problem', '—', '—', 'Not a road problem', false, 99);

-- 3. Convert reports columns from enum to TEXT
ALTER TABLE reports
  ALTER COLUMN problem_type_ai     TYPE TEXT,
  ALTER COLUMN problem_type_user   TYPE TEXT,
  ALTER COLUMN problem_type_final  TYPE TEXT;

-- 4. Convert photo_classifications column from enum to TEXT
ALTER TABLE photo_classifications
  ALTER COLUMN problem_type_ai TYPE TEXT;

-- 5. Add FK constraints
ALTER TABLE reports
  ADD CONSTRAINT reports_problem_type_ai_fkey
    FOREIGN KEY (problem_type_ai)    REFERENCES problem_types(id),
  ADD CONSTRAINT reports_problem_type_user_fkey
    FOREIGN KEY (problem_type_user)  REFERENCES problem_types(id),
  ADD CONSTRAINT reports_problem_type_final_fkey
    FOREIGN KEY (problem_type_final) REFERENCES problem_types(id);

ALTER TABLE photo_classifications
  ADD CONSTRAINT photo_classifications_problem_type_ai_fkey
    FOREIGN KEY (problem_type_ai) REFERENCES problem_types(id);

-- 6. Drop the old enum type
DROP TYPE IF EXISTS problem_type;
