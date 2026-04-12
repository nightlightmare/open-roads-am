-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'moderator', 'gov_agency', 'admin');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('pending_review', 'under_review', 'approved', 'in_progress', 'resolved', 'rejected', 'archived');

-- CreateEnum
CREATE TYPE "problem_type" AS ENUM ('pothole', 'damaged_barrier', 'missing_marking', 'damaged_sign', 'hazard', 'broken_light', 'missing_ramp', 'other');

-- CreateEnum
CREATE TYPE "region_type" AS ENUM ('marz', 'city', 'district');

-- CreateEnum
CREATE TYPE "photo_classification_status" AS ENUM ('pending', 'completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_id" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'user',
    "display_name" TEXT,
    "reports_today" INTEGER NOT NULL DEFAULT 0,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name_hy" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "boundary" geometry(MultiPolygon, 4326) NOT NULL,
    "type" "region_type" NOT NULL,
    "parent_id" UUID,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'pending_review',
    "problem_type_ai" "problem_type",
    "ai_confidence" REAL,
    "problem_type_user" "problem_type",
    "problem_type_final" "problem_type",
    "description" TEXT,
    "location" geometry(Point, 4326) NOT NULL,
    "address_raw" TEXT,
    "region_id" UUID,
    "photo_original_key" TEXT NOT NULL,
    "photo_optimized_key" TEXT,
    "ai_classify_job_id" TEXT,
    "ai_raw_response" JSONB,
    "moderated_by" UUID,
    "moderated_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "confirmation_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "from_status" "report_status",
    "to_status" "report_status" NOT NULL,
    "changed_by" UUID,
    "changed_by_role" "user_role",
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_confirmations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_classifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "photo_temp_key" TEXT NOT NULL,
    "status" "photo_classification_status" NOT NULL DEFAULT 'pending',
    "problem_type_ai" "problem_type",
    "ai_confidence" REAL,
    "ai_raw_response" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" TEXT[],
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");

-- CreateIndex
CREATE INDEX "reports_user_id_idx" ON "reports"("user_id");

-- CreateIndex
CREATE INDEX "reports_region_id_idx" ON "reports"("region_id");

-- CreateIndex
CREATE INDEX "reports_created_at_idx" ON "reports"("created_at" DESC);

-- CreateIndex
CREATE INDEX "report_status_history_report_id_idx" ON "report_status_history"("report_id");

-- CreateIndex
CREATE INDEX "report_confirmations_report_id_idx" ON "report_confirmations"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_confirmations_report_id_user_id_key" ON "report_confirmations"("report_id", "user_id");

-- CreateIndex
CREATE INDEX "photo_classifications_user_id_idx" ON "photo_classifications"("user_id");

-- CreateIndex
CREATE INDEX "photo_classifications_expires_at_idx" ON "photo_classifications"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_confirmations" ADD CONSTRAINT "report_confirmations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_confirmations" ADD CONSTRAINT "report_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_classifications" ADD CONSTRAINT "photo_classifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostGIS GIST indexes (spatial queries — Prisma cannot generate these)
CREATE INDEX reports_location_idx ON reports USING GIST (location);
CREATE INDEX regions_boundary_idx ON regions USING GIST (boundary);

-- Partial indexes (Prisma cannot generate WHERE clause indexes)
CREATE INDEX reports_status_idx ON reports (status) WHERE deleted_at IS NULL;
CREATE INDEX reports_status_location_idx ON reports USING GIST (location)
  WHERE status = 'approved' AND deleted_at IS NULL;
