import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
const vc = new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push(String(e.message)));
const dom = new JSDOM(fs.readFileSync(process.argv[2],"utf8"), {
  url:"http://localhost/", runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc,
  beforeParse(w){let n=0;w.crypto=w.crypto||{};w.crypto.randomUUID=()=>`u${++n}`;w.print=()=>{};w.confirm=()=>true;w.prompt=()=>null;}
});
const w = dom.window;
await new Promise(r => w.document.readyState==="complete"?r():w.addEventListener("load", r));
// A hand-edited / corrupt JSON import naming a template that does not exist.
try {
  w.load({ version:2, logo:"", zoom:1, columns:[], items:[], sections:{},
           fields:{ template:"does-not-exist", currency:"GBP", invoiceNumber:"INV-9" } });
  console.log("RESULT: rendered without throwing");
  console.log("  invoice class :", w.document.getElementById("invoice").className);
  console.log("  title         :", w.document.getElementById("pInvoiceTitle").textContent);
  console.log("  select value  :", JSON.stringify(w.document.getElementById("template").value));
} catch (e) {
  console.log("RESULT: threw ->", e.name + ": " + e.message);
  console.log("  invoice class :", w.document.getElementById("invoice").className);
}
