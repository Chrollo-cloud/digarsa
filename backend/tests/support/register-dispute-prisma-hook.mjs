import { registerHooks } from "node:module";

const approvedPrismaModule = new URL("./direct-prisma-shim.mjs", import.meta.url).href;
let reported = false;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isPrismaConfig = specifier.endsWith("/config/prisma.js") || specifier.endsWith("/config/prisma.ts") || specifier === "../../config/prisma.js";
    const resolved = isPrismaConfig ? null : nextResolve(specifier, context);
    if (isPrismaConfig || resolved?.url.replaceAll("\\", "/").endsWith("/src/config/prisma.ts")) {
      if (!reported) {
        reported = true;
        process.stderr.write("ISOLATED_DIRECT_PRISMA_SHIM_ACTIVE\n");
      }
      return { url: approvedPrismaModule, shortCircuit: true };
    }
    return resolved;
  },
});
