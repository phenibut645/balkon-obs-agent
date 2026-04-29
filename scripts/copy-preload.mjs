import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("dist/main");

await mkdir(outputDir, { recursive: true });
await rm(path.join(outputDir, "preload.js"), { force: true });
await copyFile(path.resolve("src/preload.cjs"), path.join(outputDir, "preload.cjs"));
