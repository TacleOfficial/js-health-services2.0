import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
async function loadTs(path) {
  const source = await readFile(new URL(path, root), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}
const { getProductFinderRecommendation } = await loadTs("lib/product-finder/recommendation-engine.ts");

const products = [
  ["p1","atlas","In stock",58],["p2","helix","Low stock",72],["p3","nexus","In stock",64],["p4","aurelia","In stock",81],
  ["p6","lumen","In stock",69],["p7","arc","In stock",48],["p9","meridian","In stock",62],["p10","prism","In stock",84],
].map(([id,slug,status,price]) => ({ id, slug, status, variants:[{id:`${id}-v`,price}], name:id }));
const meta = [
  ["p1","weight-management",10,["31-50"]],["p6","weight-management",20,["1-15","not-sure"]],
  ["p2","collagen-skin",10,["skin"]],["p9","collagen-skin",20,["not-sure"]],
  ["p3","tendon-ligament-recovery",10,["both"]],["p7","tendon-ligament-recovery",20,["not-sure"]],
  ["p4","general-wellness",10,["energy"]],["p10","general-wellness",20,["not-sure"]],
].map(([productId,goal,recommendationRank,goalDetailTags]) => ({ productId, primaryGoals:[goal], secondaryGoals:["general-wellness"], format:"injectable", goalDetailTags, recommendationRank, bundleEligible:true }));
const bundles = [
  {id:"wc",active:true,productIds:["p1","p2"],primaryGoals:["weight-management"],supportedSecondaryGoals:["collagen-skin"],recommendationRank:1},
  {id:"wr",active:true,productIds:["p1","p3"],primaryGoals:["weight-management"],supportedSecondaryGoals:["tendon-ligament-recovery"],recommendationRank:2},
  {id:"cr",active:true,productIds:["p2","p3"],primaryGoals:["collagen-skin"],supportedSecondaryGoals:["tendon-ligament-recovery"],recommendationRank:3},
];
const run = (primaryGoal, secondaryGoals=[], extras={}) => getProductFinderRecommendation({
  answers:{primaryGoal,secondaryGoals,motivations:[],ageEligible:true,preferredFormat:"injectable",...extras},
  products, recommendationMetadata:meta, bundles,
});

test("returns deterministic primary products for each supported goal", () => {
  assert.equal(run("weight-management").primaryProductId,"p1");
  assert.equal(run("collagen-skin").primaryProductId,"p2");
  assert.equal(run("tendon-ligament-recovery").primaryProductId,"p3");
  assert.equal(run("general-wellness").primaryProductId,"p4");
  assert.deepEqual(run("weight-management"),run("weight-management"));
});
test("selects only predefined goal-covering bundles", () => {
  assert.equal(run("weight-management",["collagen-skin"]).supportingBundleId,"wc");
  assert.equal(run("weight-management",["tendon-ligament-recovery"]).supportingBundleId,"wr");
  assert.equal(run("collagen-skin",["tendon-ligament-recovery"]).supportingBundleId,"cr");
  assert.equal(run("weight-management",["general-wellness"]).supportingBundleId,null);
});
test("eligibility gates every recommendation", () => {
  const input={answers:{primaryGoal:"weight-management",secondaryGoals:[],motivations:[],preferredFormat:"injectable"},products,recommendationMetadata:meta,bundles};
  assert.equal(getProductFinderRecommendation(input).primaryProductId,null);
  assert.equal(getProductFinderRecommendation({...input,answers:{...input.answers,ageEligible:false}}).primaryProductId,null);
});
test("availability, low stock, detail, format, and stable IDs are deterministic", () => {
  const unavailable=products.map(p=>p.id==="p1"?{...p,status:"Temporarily unavailable"}:p);
  assert.equal(getProductFinderRecommendation({answers:{primaryGoal:"weight-management",secondaryGoals:[],motivations:[],ageEligible:true,preferredFormat:"injectable"},products:unavailable,recommendationMetadata:meta,bundles}).primaryProductId,"p6");
  assert.equal(run("weight-management",[],{goalDetail:"1-15"}).primaryProductId,"p6");
  const wrongFormat=meta.map(m=>m.productId==="p1"?{...m,format:"oral"}:m);
  assert.equal(getProductFinderRecommendation({answers:{primaryGoal:"weight-management",secondaryGoals:[],motivations:[],ageEligible:true,preferredFormat:"injectable"},products,recommendationMetadata:wrongFormat,bundles}).primaryProductId,"p6");
  const tied=meta.map(m=>m.primaryGoals[0]==="weight-management"?{...m,recommendationRank:10,goalDetailTags:[]}:m);
  assert.equal(getProductFinderRecommendation({answers:{primaryGoal:"weight-management",secondaryGoals:[],motivations:[],ageEligible:true,preferredFormat:"injectable"},products,recommendationMetadata:tied,bundles}).primaryProductId,"p1");
});
test("inactive and unavailable bundles are never returned, broad answer is safe", () => {
  assert.equal(getProductFinderRecommendation({answers:{primaryGoal:"weight-management",secondaryGoals:["collagen-skin"],motivations:[],ageEligible:true,preferredFormat:"injectable"},products,recommendationMetadata:meta,bundles:bundles.map(b=>({...b,active:false}))}).supportingBundleId,null);
  assert.equal(run("not-sure").primaryProductId,"p4");
  assert.ok(run("weight-management").alternativeProductIds.length<=2);
});
