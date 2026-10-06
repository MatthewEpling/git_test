// Copies the Flycast libretro core into public/core and patches its Emscripten glue so
// it runs in a browser.
//
// romdev-core-flycast is built with NODERAWFS (the core reads Node's real disk). The
// glue throws outside Node and swaps every FS method for the Node-backed one. The
// in-memory MEMFS is still compiled in, so we drop the throw and only install the
// Node FS overrides when actually running under Node. The patch is exact-match: if a
// future core version changes this code the build fails instead of shipping a broken
// core.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "node_modules/romdev-core-flycast/wasm");
const out = path.join(root, "public/core");

const PATCHES = [
  [
    'if(!ENVIRONMENT_IS_NODE){throw new Error("NODERAWFS is currently only supported on Node.js environment.")}',
    "",
  ],
  [
    "for(var _key in NODERAWFS){FS[_key]=_wrapNodeError(NODERAWFS[_key])}",
    "if(ENVIRONMENT_IS_NODE)for(var _key in NODERAWFS){FS[_key]=_wrapNodeError(NODERAWFS[_key])}",
  ],
  // NODERAWFS builds wire PATH/PATH_FS to Node's `path` module. Swap in Emscripten's
  // standard pure-JS implementations (as emitted for ordinary browser builds).
  [
    'var nodePath=require("path");var PATH={isAbs:nodePath.isAbsolute,normalize:nodePath.normalize,dirname:nodePath.dirname,basename:nodePath.basename,join:nodePath.join,join2:nodePath.join};',
    'var PATH={isAbs:path=>path.charAt(0)==="/",splitPath:filename=>{var splitPathRe=/^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last==="."){parts.splice(i,1)}else if(last===".."){parts.splice(i,1);up++}else if(up){parts.splice(i,1);up--}}if(allowAboveRoot){for(;up;up--){parts.unshift("..")}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.slice(-1)==="/";path=PATH.normalizeArray(path.split("/").filter(p=>!!p),!isAbsolute).join("/");if(!path&&!isAbsolute){path="."}if(path&&trailingSlash){path+="/"}return(isAbsolute?"/":"")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return"."}if(dir){dir=dir.slice(0,-1)}return root+dir},basename:path=>path&&path.match(/([^\\/]+|\\/)\\/*$/)[1],join:(...paths)=>PATH.normalize(paths.join("/")),join2:(l,r)=>PATH.normalize(l+"/"+r)};',
  ],
  [
    "var PATH_FS={resolve:(...paths)=>{paths.unshift(FS.cwd());return nodePath.posix.resolve(...paths)},relative:(from,to)=>nodePath.posix.relative(from||FS.cwd(),to||FS.cwd())};",
    'var PATH_FS={resolve:(...args)=>{var resolvedPath="",resolvedAbsolute=false;for(var i=args.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?args[i]:FS.cwd();if(typeof path!="string"){throw new TypeError("Arguments to path.resolve must be strings")}else if(!path){return""}resolvedPath=path+"/"+resolvedPath;resolvedAbsolute=PATH.isAbs(path)}resolvedPath=PATH.normalizeArray(resolvedPath.split("/").filter(p=>!!p),!resolvedAbsolute).join("/");return(resolvedAbsolute?"/":"")+resolvedPath||"."},relative:(from,to)=>{from=PATH_FS.resolve(from).slice(1);to=PATH_FS.resolve(to).slice(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!=="")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!=="")break}if(start>end)return[];return arr.slice(start,end-start+1)}var fromParts=trim(from.split("/"));var toParts=trim(to.split("/"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push("..")}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join("/")}};',
  ],
];

let js = await readFile(path.join(src, "flycast_libretro.js"), "utf8");
for (const [from, to] of PATCHES) {
  const count = js.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`prepare-core: expected exactly one match for patch, found ${count}:\n${from}`);
  }
  js = js.replace(from, to);
}

await mkdir(out, { recursive: true });
await writeFile(path.join(out, "flycast_libretro.js"), js);
await copyFile(path.join(src, "flycast_libretro.wasm"), path.join(out, "flycast_libretro.wasm"));
const wasm = await readFile(path.join(out, "flycast_libretro.wasm"));
const hash = createHash("sha256").update(wasm).digest("hex").slice(0, 16);
console.log(`prepare-core: Flycast core ready in public/core (wasm ${(wasm.length / 1e6).toFixed(1)} MB, sha256 ${hash}…)`);
