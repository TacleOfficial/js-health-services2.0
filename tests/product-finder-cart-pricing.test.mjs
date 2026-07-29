import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("lib/product-finder/cart-pricing.ts",root),"utf8");
const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { calculateCartPricing } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const products=[{id:"p1",variants:[{id:"v1",price:100}]},{id:"p2",variants:[{id:"v2",price:50}]},{id:"p3",variants:[{id:"v3",price:25}]}];
const bundles=[{id:"b1",name:"Bundle",active:true,productIds:["p1","p2"],discountType:"percentage",discountValue:10}];
const bundled=(instance="i1")=>[
  {productId:"p1",variantId:"v1",quantity:1,bundleId:"b1",bundleInstanceId:instance,bundleRequiredQuantity:1},
  {productId:"p2",variantId:"v2",quantity:1,bundleId:"b1",bundleInstanceId:instance,bundleRequiredQuantity:1},
];
test("complete bundle receives a separate discount",()=>{const result=calculateCartPricing(bundled(),products,bundles);assert.equal(result.subtotal,150);assert.equal(result.discountTotal,15);assert.equal(result.discountedSubtotal,135)});
test("missing or reduced bundle item removes discount without removing products",()=>{const changed=bundled();changed[0].quantity=0;const result=calculateCartPricing(changed,products,bundles);assert.equal(result.discountTotal,0);assert.equal(changed.length,2)});
test("unrelated regular items do not affect bundle pricing",()=>{const result=calculateCartPricing([...bundled(),{productId:"p3",variantId:"v3",quantity:2}],products,bundles);assert.equal(result.subtotal,200);assert.equal(result.discountTotal,15)});
test("separate bundle instances price independently",()=>{const result=calculateCartPricing([...bundled("a"),...bundled("b")],products,bundles);assert.equal(result.bundleDiscounts.length,2);assert.equal(result.discountTotal,30)});
test("inactive bundle and regular products receive no discount",()=>{assert.equal(calculateCartPricing(bundled(),products,[{...bundles[0],active:false}]).discountTotal,0);assert.equal(calculateCartPricing([{productId:"p1",variantId:"v1",quantity:2}],products,bundles).discountedSubtotal,200)});
