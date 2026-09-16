import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
const vc = new VirtualConsole();
const dom = new JSDOM(fs.readFileSync(process.argv[2], "utf8"), {
  url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w){ let n=0; w.crypto=w.crypto||{}; w.crypto.randomUUID=()=>`u${++n}`; w.print=()=>{}; w.confirm=()=>true; w.prompt=()=>null; }
});
await new Promise(r => dom.window.document.readyState==="complete"?r():dom.window.addEventListener("load", r));
const w = dom.window;
const blank = new JSDOM("<!doctype html><html></html>", {url:"http://localhost/"}).window;
const known = new Set(Object.getOwnPropertyNames(blank));
const added = Object.getOwnPropertyNames(w)
  .filter(k => !known.has(k))
  .map(k => `${k}:${typeof w[k]}`)
  .sort();
console.log(added.join("\n"));
