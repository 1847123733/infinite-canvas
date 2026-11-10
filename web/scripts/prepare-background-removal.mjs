import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKGROUND_REMOVAL_PUBLIC_PATH, BACKGROUND_REMOVAL_VERSION } from "../src/app/(user)/canvas/utils/background-removal-types.ts";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(webDir, "public", BACKGROUND_REMOVAL_PUBLIC_PATH.slice(1));
const dataDir = resolve(outputDir, "data");
const packageDir = resolve(webDir, "node_modules/@imgly/background-removal");
const cdn = `https://staticimgly.com/@imgly/background-removal-data/${BACKGROUND_REMOVAL_VERSION}/dist/`;
const resourceKeys = ["/models/isnet_fp16", "/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm", "/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs", "/onnxruntime-web/ort-wasm-simd-threaded.wasm", "/onnxruntime-web/ort-wasm-simd-threaded.mjs"];

async function download(name) {
    const response = await fetch(new URL(name, cdn), { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`下载抠图资源失败：${name} (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
}

await mkdir(dataDir, { recursive: true });
const pkg = JSON.parse(await readFile(resolve(packageDir, "package.json"), "utf8"));
if (pkg.version !== BACKGROUND_REMOVAL_VERSION) throw new Error("抠图库与离线资源版本不一致");

const manifestPath = resolve(dataDir, "resources.json");
let manifest;
try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
    manifest = JSON.parse((await download("resources.json")).toString());
}
const resources = Object.fromEntries(
    resourceKeys.map((key) => {
        if (!manifest[key]) throw new Error(`缺少抠图资源：${key}`);
        return [key, manifest[key]];
    }),
);
const chunks = [
    ...new Map(
        Object.values(resources)
            .flatMap((resource) => resource.chunks)
            .map((chunk) => [chunk.name, chunk]),
    ).values(),
];
let downloaded = 0;
await Promise.all(
    Array.from({ length: 4 }, async () => {
        while (chunks.length) {
            const chunk = chunks.pop();
            const path = resolve(dataDir, chunk.name);
            if (dirname(path) !== dataDir) throw new Error("无效的抠图资源路径");
            const valid = (data) => data.length === chunk.offsets[1] - chunk.offsets[0] && createHash("sha256").update(data).digest("hex") === chunk.hash;
            try {
                if (valid(await readFile(path))) continue;
            } catch {
                /* 首次准备时资源尚未下载。 */
            }
            const data = await download(chunk.name);
            if (!valid(data)) throw new Error(`抠图资源校验失败：${chunk.name}`);
            await writeFile(path, data);
            downloaded += data.length;
            console.log(`已准备离线抠图资源 ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
        }
    }),
);
await writeFile(manifestPath, JSON.stringify(resources));
await copyFile(resolve(packageDir, "LICENSE.md"), resolve(outputDir, "LICENSE.md"));
await copyFile(resolve(packageDir, "ThirdPartyLicenses.json"), resolve(outputDir, "ThirdPartyLicenses.json"));

// PSD 主体分割通过内置 Node 运行同一份 fp16 模型，离线包一并携带匹配的 CPU 运行时。
const objectRuntime = resolve(outputDir, "object-runtime");
await mkdir(objectRuntime, { recursive: true });
await Promise.all(["ort.wasm.bundle.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"].map((name) => copyFile(resolve(webDir, "node_modules/onnxruntime-web/dist", name), resolve(objectRuntime, name))));

// 独立编译浏览器 Worker，避免 Next.js 将 ONNX 的 Node 入口或大型运行时带入页面。
const result = await Bun.build({
    entrypoints: [resolve(webDir, "src/app/(user)/canvas/workers/background-removal.worker.ts")],
    outdir: outputDir,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    naming: { entry: "[name].js", chunk: "[name]-[hash].js" },
    plugins: [
        {
            name: "clamp-background-removal-alpha",
            setup(build) {
                build.onLoad({ filter: /@imgly[\\/]background-removal[\\/]dist[\\/]index\.mjs$/ }, async ({ path }) => {
                    const source = await readFile(path, "utf8");
                    // 1.7.0 直接写入 Uint8Array，越界透明度会回绕，造成主体破洞和背景杂点。
                    const original = "const uint8Array = new Uint8Array(float32Array.data.length);";
                    if (!source.includes(original)) throw new Error("抠图库透明度补丁未匹配，请检查固定版本的转换实现");
                    return { contents: source.replace(original, "const uint8Array = new Uint8ClampedArray(float32Array.data.length);"), loader: "js" };
                });
            },
        },
    ],
});
if (!result.success) throw new AggregateError(result.logs, "准备抠图 Worker 失败");
console.log("离线抠图资源已就绪");
