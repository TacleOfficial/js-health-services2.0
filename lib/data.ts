import type { BatchRecord, Product, ResearchArticle } from "./types";

const makeVariants = (code: string, price: number) => [
  { id: `${code}-5`, label: "5 mg vial", amount: "5 mg", price },
  { id: `${code}-10`, label: "10 mg vial", amount: "10 mg", price: price + 34 },
];

export const products: Product[] = [
  { id:"p1", slug:"atlas-10", name:"Atlas 10", code:"ATL", descriptor:"Reference peptide standard", category:"Reference standards", researchArea:"Metabolic pathways", form:"Lyophilized research material", status:"In stock", documentStatus:"Batch verified", batchId:"DEMO-ATL-2607", tone:"#dce7e6", featured:true, variants:makeVariants("atl",58) },
  { id:"p2", slug:"helix-b7", name:"Helix B7", code:"HLX", descriptor:"Sequence-calibrated research material", category:"Peptides", researchArea:"Cell signaling", form:"Lyophilized research material", status:"Low stock", documentStatus:"CoA available", batchId:"DEMO-HLX-2604", tone:"#e7e1d7", featured:true, variants:makeVariants("hlx",72) },
  { id:"p3", slug:"nexus-29", name:"Nexus 29", code:"NXS", descriptor:"Analytical peptide reference", category:"Reference standards", researchArea:"Tissue models", form:"Lyophilized research material", status:"In stock", documentStatus:"Batch verified", batchId:"DEMO-NXS-2606", tone:"#d9e0e8", featured:true, variants:makeVariants("nxs",64) },
  { id:"p4", slug:"aurelia-c", name:"Aurelia C", code:"AUR", descriptor:"Controlled research sequence", category:"Peptides", researchArea:"Cell signaling", form:"Lyophilized research material", status:"In stock", documentStatus:"Batch verified", batchId:"DEMO-AUR-2603", tone:"#e8e2d3", variants:makeVariants("aur",81) },
  { id:"p5", slug:"vector-6", name:"Vector 6", code:"VEC", descriptor:"High-resolution reference material", category:"Analytical", researchArea:"Receptor studies", form:"Lyophilized research material", status:"Temporarily unavailable", documentStatus:"Testing pending", batchId:"DEMO-VEC-PENDING", tone:"#dfe4df", variants:makeVariants("vec",55) },
  { id:"p6", slug:"lumen-12", name:"Lumen 12", code:"LMN", descriptor:"Research-grade calibration sequence", category:"Analytical", researchArea:"Metabolic pathways", form:"Lyophilized research material", status:"In stock", documentStatus:"CoA available", batchId:"DEMO-LMN-2512", tone:"#e3e7e2", variants:makeVariants("lmn",69) },
  { id:"p7", slug:"arc-5", name:"Arc 5", code:"ARC", descriptor:"Short-chain reference peptide", category:"Peptides", researchArea:"Tissue models", form:"Lyophilized research material", status:"In stock", documentStatus:"Batch verified", batchId:"DEMO-ARC-2605", tone:"#d8e5e8", variants:makeVariants("arc",48) },
  { id:"p8", slug:"kinetic-21", name:"Kinetic 21", code:"KIN", descriptor:"Documented research sequence", category:"Reference standards", researchArea:"Receptor studies", form:"Lyophilized research material", status:"Low stock", documentStatus:"CoA available", batchId:"DEMO-KIN-2602", tone:"#e9e3db", variants:makeVariants("kin",76) },
  { id:"p9", slug:"meridian-8", name:"Meridian 8", code:"MRD", descriptor:"Batch-traceable peptide material", category:"Peptides", researchArea:"Cell signaling", form:"Lyophilized research material", status:"In stock", documentStatus:"Batch verified", batchId:"DEMO-MRD-2607", tone:"#dce3dc", variants:makeVariants("mrd",62) },
  { id:"p10", slug:"prism-14", name:"Prism 14", code:"PRS", descriptor:"Assay development reference", category:"Analytical", researchArea:"Assay development", form:"Lyophilized research material", status:"In stock", documentStatus:"CoA available", batchId:"DEMO-PRS-2601", tone:"#e0e5ea", variants:makeVariants("prs",84) },
  { id:"p11", slug:"solace-3", name:"Solace 3", code:"SLC", descriptor:"Compact sequence reference", category:"Reference standards", researchArea:"Assay development", form:"Lyophilized research material", status:"In stock", documentStatus:"Batch verified", batchId:"DEMO-SLC-2606", tone:"#ebe5da", variants:makeVariants("slc",44) },
  { id:"p12", slug:"axis-18", name:"Axis 18", code:"AXS", descriptor:"Identity-controlled research material", category:"Peptides", researchArea:"Tissue models", form:"Lyophilized research material", status:"Low stock", documentStatus:"CoA available", batchId:"DEMO-AXS-2604", tone:"#d9e4e1", variants:makeVariants("axs",73) },
];

export const batches: BatchRecord[] = [
  { id:"DEMO-ATL-2607", productSlug:"atlas-10", status:"Verified", reportDate:"July 18, 2026", laboratory:"Fictional Northline Analytical — DEMO", purity:"99.2% — fictional", method:"RP-HPLC / MS (demo)", storage:"Store as labeled for laboratory use" },
  { id:"DEMO-HLX-2604", productSlug:"helix-b7", status:"Verified", reportDate:"April 24, 2026", laboratory:"Fictional Meridian Labs — DEMO", purity:"98.9% — fictional", method:"RP-HPLC (demo)", storage:"Store as labeled for laboratory use" },
  { id:"DEMO-VEC-PENDING", productSlug:"vector-6", status:"Pending", reportDate:"Pending", laboratory:"Fictional Northline Analytical — DEMO", purity:"Pending", method:"Identity and purity review", storage:"Not released" },
  { id:"DEMO-LMN-2512", productSlug:"lumen-12", status:"Archived", reportDate:"December 11, 2025", laboratory:"Fictional Meridian Labs — DEMO", purity:"98.7% — fictional", method:"RP-HPLC / MS (demo)", storage:"Archived batch" },
];

export const articles: ResearchArticle[] = [
  { slug:"reading-a-chromatogram", title:"Reading an analytical chromatogram", summary:"A plain-language guide to peaks, retention time, integration, and the limits of a single analytical view.", topic:"Testing methods", evidence:"Educational overview", readTime:"7 min", updated:"July 2026" },
  { slug:"identity-purity-assay", title:"Identity, purity, and assay are not interchangeable", summary:"Why three common quality terms answer different questions about a research material.", topic:"Quality systems", evidence:"Methods primer", readTime:"6 min", updated:"July 2026" },
  { slug:"batch-traceability", title:"What complete batch traceability looks like", summary:"From incoming material to release record, a useful chain of custody keeps evidence connected.", topic:"Documentation", evidence:"Process overview", readTime:"5 min", updated:"June 2026" },
  { slug:"storage-labels", title:"Interpreting storage and handling labels", summary:"How to read documented conditions without extending them into unsupported use instructions.", topic:"Handling", evidence:"Educational overview", readTime:"4 min", updated:"June 2026" },
];

export const categories = ["All", "Peptides", "Reference standards", "Analytical"];
