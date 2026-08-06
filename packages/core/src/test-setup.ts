import os from "node:os";
import path from "node:path";
import { configureCoreRuntime } from "./runtime/config.js";

const root = path.join(os.tmpdir(), "contour-core-vitest");
configureCoreRuntime({
  dataDir: path.join(root, "data"),
  projectsDir: path.join(root, "data", "projects"),
  vaultsDir: path.join(root, "vaults"),
  legacyVault: path.join(root, "legacy"),
  isDevelopment: true,
});
