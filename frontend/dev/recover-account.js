import process from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { recoverLocalDemo } from "./recovery.js";

// Run manually using Node, not a browser route or server endpoint. New secrets
// arrive through stdin, never command arguments, source, or generated reports.
try {
  const { values } = parseArgs({ options: {
    input: { type: "string" }, output: { type: "string" }, account: { type: "string" },
    email: { type: "string" }, "confirm-local-demo-recovery": { type: "boolean" },
  } });
  if (!values.input || !values.output || !values.account || !values.email || !values["confirm-local-demo-recovery"])
    throw new Error("Supply --input BACKUP --output NEW_FILE --account ID --email EMAIL --confirm-local-demo-recovery. Password and confirmation JSON must be supplied on stdin.");
  const credentials = JSON.parse(readFileSync(0, "utf8"));
  const recovered = recoverLocalDemo(readFileSync(values.input, "utf8"), {
    accountId: values.account, email: values.email, approved: true,
    newPassword: credentials.newPassword, confirmation: credentials.confirmation,
  });
  // Exclusive creation: never overwrite the original backup or an existing file.
  writeFileSync(values.output, recovered, { flag: "wx", mode: 0o600 });
  process.stdout.write("Recovery copy created. Original backup unchanged. Follow HANDOFF.md for guarded local import.\n");
} catch {
  process.stderr.write("Recovery not completed. Check arguments, identity, password validation, backup format and a new output path. No existing file was overwritten.\n");
  process.exitCode = 1;
}
