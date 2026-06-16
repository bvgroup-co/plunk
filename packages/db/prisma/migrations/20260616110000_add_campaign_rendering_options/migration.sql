-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "mode" "TemplateMode" NOT NULL DEFAULT 'HTML',
ADD COLUMN "cssMode" "TemplateCssMode" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN "customCss" TEXT;
