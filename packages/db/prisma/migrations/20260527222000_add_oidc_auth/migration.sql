-- AlterEnum
ALTER TYPE "AuthMethod" ADD VALUE 'OIDC';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "oidcIssuer" TEXT,
ADD COLUMN "oidcSubject" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_oidcIssuer_oidcSubject_key" ON "users"("oidcIssuer", "oidcSubject");
