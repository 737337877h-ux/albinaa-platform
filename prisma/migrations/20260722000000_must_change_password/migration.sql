-- AlterTable: Add mustChangePassword to users
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- Set mustChangePassword=true for admin user (default password scenario)
UPDATE "users" SET "must_change_password" = true WHERE "username" = 'admin';
