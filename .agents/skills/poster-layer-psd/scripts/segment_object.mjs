import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [inputPath, outputPath, resources, runtime] = process.argv.slice(2);
const ort = await import(
  pathToFileURL(join(runtime, "ort.wasm.bundle.min.mjs")).href
);
ort.env.wasm.wasmPaths = pathToFileURL(runtime + "/").href;
ort.env.wasm.numThreads = 1;
const manifest = JSON.parse(
  await readFile(join(resources, "resources.json"), "utf8"),
);
const chunks = manifest["/models/isnet_fp16"].chunks;
const model = Buffer.concat(
  await Promise.all(
    chunks.map((chunk) => readFile(join(resources, chunk.name))),
  ),
);
const session = await ort.InferenceSession.create(model, {
  executionProviders: ["wasm"],
});
const bytes = await readFile(inputPath);
const floats = new Float32Array(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
);
const predictions = await session.run({
  [session.inputNames[0]]: new ort.Tensor(
    "float32",
    floats,
    [1, 3, 1024, 1024],
  ),
});
const mask = predictions[session.outputNames[0]].data;
await writeFile(
  outputPath,
  Buffer.from(mask.buffer, mask.byteOffset, mask.byteLength),
);
await session.release();
