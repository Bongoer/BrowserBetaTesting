import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "bare-mux-fork/node";

const output = resolve(".proxy-runtime");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all([
  cp(scramjetPath, resolve(output, "scram"), { recursive: true }),
  cp(baremuxPath, resolve(output, "baremux"), { recursive: true }),
  cp(libcurlPath, resolve(output, "libcurl"), { recursive: true }),
]);

console.log("Proxy runtime prepared");
