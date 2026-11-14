CREATE TYPE "MessageModerationSource" AS ENUM ('RULE_BASED', 'GEMINI');

ALTER TABLE "Message"
  ADD COLUMN "moderationSource" "MessageModerationSource" NOT NULL DEFAULT 'RULE_BASED';
