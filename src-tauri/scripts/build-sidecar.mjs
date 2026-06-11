import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const tauriDir = resolve(scriptDir, "..");
const rootDir = resolve(tauriDir, "..");
const target = process.env.TAURI_ENV_TARGET_TRIPLE || process.env.TAURI_TARGET_TRIPLE || process.env.CARGO_BUILD_TARGET || readHostTriple();
const exe = target.includes("windows") ? ".exe" : "";
const output = resolve(tauriDir, "binaries", `infinite-canvas-api-${target}${exe}`);

mkdirSync(resolve(tauriDir, "binaries"), { recursive: true });
execFileSync("go", ["build", "-o", output, "."], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, CGO_ENABLED: process.env.CGO_ENABLED || "0" },
});

function readHostTriple() {
    const version = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
    const match = version.match(/^host:\s*(.+)$/m);
    if (!match) throw new Error("无法读取 rustc host triple");
    return match[1].trim();
}
