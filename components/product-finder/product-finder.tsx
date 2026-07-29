"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, ShoppingBag, Sparkles, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { AnswerCard } from "./answer-card";
import { DateOfBirthPicker } from "./date-of-birth-picker";
import { ProductFinderProgress } from "./product-finder-progress";
import { Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useDemo } from "@/components/demo-store";
import { ProductVisual } from "@/components/product-visual";
import { products } from "@/lib/data";
import { productBundles } from "@/lib/product-finder/bundles";
import { detailQuestions, goalDescriptions, goalLabels, motivationOptions, productGoals, stepPhase } from "@/lib/product-finder/questions";
import { recommendationMetadata, surveyProductCopy } from "@/lib/product-finder/products";
import { getProductFinderRecommendation } from "@/lib/product-finder/recommendation-engine";
import { recommendationReasonCopy } from "@/lib/product-finder/recommendation-copy";
import { parseSurveySession, resetForPrimaryGoal, serializeSurveySession, surveySessionKey } from "@/lib/product-finder/survey-session";
import { trackProductFinderEvent } from "@/lib/product-finder/analytics";
import type { PersistedSurveyState, PrimaryGoal, ProductFinderAnswers, SurveyStepId } from "@/lib/product-finder/types";

const initialState: PersistedSurveyState = { version: 1, currentStepId: "welcome", secondaryGoals: [], motivations: [], updatedAt: "" };
const history: SurveyStepId[] = ["welcome", "primary-goal", "secondary-goals", "goal-detail", "testimonial-one", "motivation", "eligibility", "testimonial-two", "recommendation-loading", "recommendation"];
const testimonialCopy: Record<PrimaryGoal, [string, string]> = {
  "weight-management": ["A routine that finally felt approachable", "Small, consistent choices helped me feel more confident in my routine."],
  "collagen-skin": ["A more intentional everyday ritual", "I appreciated having a simple routine centered on my appearance goals."],
  "tendon-ligament-recovery": ["Support for getting back into rhythm", "A focused recovery routine helped me feel more consistent day to day."],
  "general-wellness": ["A calmer way to focus on wellness", "The simple routine made it easier to stay connected to my goals."],
  "not-sure": ["A simple place to begin", "Starting broad helped me understand which wellness goals mattered most."],
};

function nextStep(step: SurveyStepId) { return history[Math.min(history.indexOf(step) + 1, history.length - 1)]; }
function previousStep(step: SurveyStepId) { return history[Math.max(history.indexOf(step) - 1, 0)]; }

export function ProductFinder() {
  const [state, setState] = useState<PersistedSurveyState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [exitOpen, setExitOpen] = useState(false);
  const [underage, setUnderage] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const recommendationTracked = useRef(false);
  const router = useRouter();
  const { addToCart, addBundle } = useDemo();
  const { toast } = useToast();
  const sessionId = useRef("");

  useEffect(() => {
    const restored = parseSurveySession(sessionStorage.getItem(surveySessionKey));
    // Hydrate versioned session-only survey progress after the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restored) setState(restored);
    const analyticsKey = `${surveySessionKey}-anonymous-id`;
    sessionId.current = sessionStorage.getItem(analyticsKey) ?? crypto.randomUUID();
    sessionStorage.setItem(analyticsKey, sessionId.current);
    setHydrated(true);
    void trackProductFinderEvent({ name: "product_finder_started", sessionId: sessionId.current, stepId: restored?.currentStepId ?? "welcome", phase: stepPhase[restored?.currentStepId ?? "welcome"] });
  }, []);
  useEffect(() => {
    if (!hydrated || underage) return;
    sessionStorage.setItem(surveySessionKey, serializeSurveySession({ ...state, updatedAt: new Date().toISOString() }));
  }, [hydrated, state, underage]);
  useEffect(() => {
    if (!hydrated) return;
    if (state.currentStepId !== "eligibility") headingRef.current?.focus();
    void trackProductFinderEvent({ name: state.currentStepId.startsWith("testimonial") ? "product_finder_testimonial_viewed" : "product_finder_question_viewed", sessionId: sessionId.current, stepId: state.currentStepId, phase: stepPhase[state.currentStepId], metadata: { stepPosition: history.indexOf(state.currentStepId) } });
  }, [hydrated, state.currentStepId]);
  useEffect(() => {
    if (state.currentStepId !== "recommendation-loading") return;
    const timer = window.setTimeout(() => setState((current) => ({ ...current, currentStepId: "recommendation" })), 1200);
    return () => window.clearTimeout(timer);
  }, [state.currentStepId]);

  const answers: ProductFinderAnswers = useMemo(() => ({
    primaryGoal: state.primaryGoal, secondaryGoals: state.secondaryGoals, goalDetail: state.goalDetail,
    motivations: state.motivations, ageEligible: state.ageEligible, preferredFormat: "injectable",
  }), [state]);
  const recommendation = useMemo(() => getProductFinderRecommendation({ answers, products, recommendationMetadata, bundles: productBundles }), [answers]);
  const phase = stepPhase[state.currentStepId];
  const meaningfulProgress = state.currentStepId !== "welcome" && state.currentStepId !== "primary-goal";
  useEffect(() => {
    if (state.currentStepId !== "recommendation" || recommendationTracked.current) return;
    recommendationTracked.current = true;
    const resultType = recommendation.primaryProductId ? (recommendation.supportingBundleId ? "bundle" : "product") : "no-match";
    void trackProductFinderEvent({ name: "product_finder_completed", sessionId: sessionId.current, stepId: "recommendation", phase: "recommendation", metadata: { completionStatus: "completed", resultType } });
    void trackProductFinderEvent({ name: "product_recommendation_viewed", sessionId: sessionId.current, stepId: "recommendation", phase: "recommendation", metadata: { resultType } });
  }, [recommendation.primaryProductId, recommendation.supportingBundleId, state.currentStepId]);

  const go = (step: SurveyStepId, navDirection: "forward" | "back" = "forward") => {
    setDirection(navDirection);
    setState((current) => ({ ...current, currentStepId: step, updatedAt: new Date().toISOString() }));
  };
  const advance = () => go(nextStep(state.currentStepId));
  const restart = () => {
    sessionStorage.removeItem(surveySessionKey);
    setUnderage(false);
    setDirection("back");
    recommendationTracked.current = false;
    setState(initialState);
    setExitOpen(false);
  };
  const exit = () => {
    void trackProductFinderEvent({ name: "product_finder_abandoned", sessionId: sessionId.current, stepId: state.currentStepId, phase, metadata: { completionStatus: "abandoned" } });
    router.push("/");
  };

  if (!hydrated) return <main className="pf-shell"><div className="pf-loading" aria-live="polite">Preparing your product finder…</div></main>;
  if (underage) return (
    <main className="pf-shell pf-centered"><Card className="pf-ineligible"><Badge tone="warm">Eligibility</Badge><h1>You must be at least 18 years old to continue.</h1><p>No recommendation was created, and your survey progress has been cleared.</p><Button asChild size="lg"><Link href="/">Return home</Link></Button></Card></main>
  );

  const primaryGoal = state.primaryGoal ?? "not-sure";
  const detail = primaryGoal === "not-sure" ? null : detailQuestions[primaryGoal];

  return (
    <main className="pf-shell">
      <header className="pf-header">
        <Link href="/" className="pf-wordmark" aria-label="Velle home">VELLE<span>WELLNESS FINDER</span></Link>
        <ProductFinderProgress phase={phase} />
        <div className="pf-header-actions">
          <button type="button" className="pf-icon-button" aria-label="Go back" disabled={state.currentStepId === "welcome"} onClick={() => { void trackProductFinderEvent({ name: "product_finder_back", sessionId: sessionId.current, stepId: state.currentStepId, phase }); go(previousStep(state.currentStepId), "back"); }}><ArrowLeft /></button>
          <button type="button" className="pf-icon-button" aria-label="Exit product finder" onClick={() => meaningfulProgress ? setExitOpen(true) : exit()}><X /></button>
        </div>
      </header>

      <section className="pf-stage">
        <div className="pf-step" data-direction={direction} key={state.currentStepId}>
          {state.currentStepId === "welcome" ? <div className="pf-welcome">
            <Badge tone="warm">A two-minute product finder</Badge><h1 ref={headingRef} tabIndex={-1}>A more personal way to find your Velle match.</h1>
            <p>Tell us what you want to focus on and we’ll compare the current fictional catalog. This is not medical advice or a diagnosis.</p>
            <Button size="lg" onClick={advance}>Find my match <ArrowRight /></Button><small>All current recommendations use the injectable format. No purchase is required.</small>
          </div> : null}

          {state.currentStepId === "primary-goal" ? <fieldset><legend><span className="pf-kicker">Your goals</span><h1 ref={headingRef} tabIndex={-1}>What would you most like to focus on?</h1></legend><div className="pf-answer-grid">
            {(Object.keys(goalLabels) as PrimaryGoal[]).map((goal) => <AnswerCard key={goal} label={goalLabels[goal]} description={goalDescriptions[goal]} selected={state.primaryGoal === goal} onSelect={() => {
              setState((current) => resetForPrimaryGoal(current, goal));
              void trackProductFinderEvent({ name: "product_finder_answered", sessionId: sessionId.current, stepId: "primary-goal", phase: "goals" });
              window.setTimeout(() => go("secondary-goals"), 210);
            }} />)}
          </div></fieldset> : null}

          {state.currentStepId === "secondary-goals" ? <fieldset><legend><span className="pf-kicker">Your goals</span><h1 ref={headingRef} tabIndex={-1}>Is there anything else you’d like your recommendation to support?</h1><p>Select up to two.</p></legend><div className="pf-answer-grid">
            {productGoals.filter((goal) => goal !== state.primaryGoal).map((goal) => {
              const selected = state.secondaryGoals.includes(goal);
              return <AnswerCard key={goal} multiple label={goalLabels[goal]} selected={selected} disabled={!selected && state.secondaryGoals.length >= 2} onSelect={() => setState((current) => ({ ...current, secondaryGoals: selected ? current.secondaryGoals.filter((item) => item !== goal) : [...current.secondaryGoals, goal].slice(0, 2) }))} />;
            })}
          </div>{state.secondaryGoals.length >= 2 ? <p className="pf-helper" role="status">You’ve selected the maximum of two secondary goals.</p> : null}<div className="pf-actions"><Button variant="ghost" onClick={() => { setState((current) => ({ ...current, secondaryGoals: [] })); advance(); }}>Skip for now</Button><Button onClick={advance}>Continue</Button></div></fieldset> : null}

          {state.currentStepId === "goal-detail" ? detail ? <fieldset><legend><span className="pf-kicker">A little more detail</span><h1 ref={headingRef} tabIndex={-1}>{detail.question}</h1></legend><div className="pf-answer-grid">
            {detail.options.map((option) => <AnswerCard key={option.id} label={option.label} selected={state.goalDetail === option.id} onSelect={() => { setState((current) => ({ ...current, goalDetail: option.id })); window.setTimeout(() => go("testimonial-one"), 210); }} />)}
          </div></fieldset> : <div className="pf-welcome"><h1 ref={headingRef} tabIndex={-1}>We’ll keep your recommendation broad.</h1><p>You can still personalize it with the goals that matter to you.</p><Button onClick={() => go("testimonial-one")}>Continue</Button></div> : null}

          {state.currentStepId === "testimonial-one" || state.currentStepId === "testimonial-two" ? <Testimonial goal={primaryGoal} second={state.currentStepId === "testimonial-two"} headingRef={headingRef} onContinue={advance} /> : null}

          {state.currentStepId === "motivation" ? <fieldset><legend><span className="pf-kicker">What matters to you</span><h1 ref={headingRef} tabIndex={-1}>What would reaching your goal mean for you?</h1><p>Select any that feel relevant.</p></legend><div className="pf-answer-grid pf-answer-grid-compact">
            {motivationOptions.map(([id, label]) => <AnswerCard key={id} multiple label={label} selected={state.motivations.includes(id)} onSelect={() => setState((current) => ({ ...current, motivations: current.motivations.includes(id) ? current.motivations.filter((value) => value !== id) : [...current.motivations, id] }))} />)}
          </div><div className="pf-actions"><Button variant="ghost" onClick={() => { setState((current) => ({ ...current, motivations: [] })); advance(); }}>Skip</Button><Button onClick={advance}>Continue</Button></div></fieldset> : null}

          {state.currentStepId === "eligibility" ? <div><span className="pf-kicker">Eligibility</span><h1 ref={headingRef} tabIndex={-1}>To verify eligibility, tell us your date of birth.</h1><p>Eligibility in this demo means only that you are at least 18 and the recommended product is available.</p><DateOfBirthPicker onVerified={(eligible) => {
            if (!eligible) {
              sessionStorage.removeItem(surveySessionKey); setUnderage(true);
              void trackProductFinderEvent({ name: "product_finder_eligibility_failed", sessionId: sessionId.current, stepId: "eligibility", phase: "eligibility" });
              return;
            }
            setState((current) => ({ ...current, ageEligible: true, currentStepId: "testimonial-two" }));
          }} /></div> : null}

          {state.currentStepId === "recommendation-loading" ? <div className="pf-loading" aria-live="polite"><Sparkles /><h1 ref={headingRef} tabIndex={-1}>Preparing your recommendation</h1><div className="pf-loading-lines"><span>Reviewing your primary goal</span><span>Checking current availability</span><span>Comparing supporting goals</span></div></div> : null}

          {state.currentStepId === "recommendation" ? <RecommendationResult recommendation={recommendation} headingRef={headingRef} onChange={() => { void trackProductFinderEvent({ name: "recommendation_changed", sessionId: sessionId.current, stepId: "recommendation", phase: "recommendation" }); go("primary-goal", "back"); }} onAddProduct={(productId) => {
            const product = products.find((item) => item.id === productId); if (!product) return;
            addToCart(product.id, product.variants[0].id); sessionStorage.removeItem(surveySessionKey);
            toast({ title: "Added to cart", description: `${product.name} · ${product.variants[0].label}` });
          }} onAddBundle={(bundleId) => {
            const bundle = productBundles.find((item) => item.id === bundleId);
            if (addBundle(bundleId) && bundle) { sessionStorage.removeItem(surveySessionKey); toast({ title: "Recommended bundle added", description: bundle.name }); void trackProductFinderEvent({ name: "recommended_bundle_added", sessionId: sessionId.current, stepId: "recommendation", phase: "recommendation", metadata: { resultType: "bundle", bundleAdded: true } }); }
          }} /> : null}
        </div>
      </section>

      <Dialog.Root open={exitOpen} onOpenChange={setExitOpen}><Dialog.Portal><Dialog.Overlay className="pf-dialog-overlay" /><Dialog.Content className="pf-dialog"><Dialog.Title>Leave your product finder?</Dialog.Title><Dialog.Description>Your progress is saved for this browser session.</Dialog.Description><Button onClick={() => setExitOpen(false)}>Continue survey</Button><Button variant="outline" onClick={exit}>Exit to homepage</Button><Button variant="ghost" onClick={restart}><RotateCcw /> Start over</Button></Dialog.Content></Dialog.Portal></Dialog.Root>
    </main>
  );
}

function Testimonial({ goal, second, headingRef, onContinue }: { goal: PrimaryGoal; second: boolean; headingRef: React.RefObject<HTMLHeadingElement | null>; onContinue: () => void }) {
  const story = testimonialCopy[goal];
  const poster = goal === "collagen-skin" ? "collagen" : goal === "tendon-ligament-recovery" ? "recovery" : goal === "general-wellness" || goal === "not-sure" ? "wellness" : "weight";
  return <div className="pf-testimonial"><div className="pf-media"><video muted playsInline loop autoPlay={false} preload="none" poster={`/product-finder/testimonials/${poster}-placeholder.svg`} aria-label={`Placeholder customer story about ${goalLabels[goal]}`}>Approved short-form customer video can replace this poster.</video><span>Placeholder customer story</span></div><div><span className="pf-kicker">Customer-reported story</span><h1 ref={headingRef} tabIndex={-1}>{second ? story[1] : story[0]}</h1><p>“{second ? story[0] : story[1]}”</p><small>Individual results vary. Timeline and results are customer-reported. This fictional story does not imply typical or guaranteed results.</small><Button onClick={onContinue}>Continue <ArrowRight /></Button></div></div>;
}

function RecommendationResult({ recommendation, headingRef, onChange, onAddProduct, onAddBundle }: {
  recommendation: ReturnType<typeof getProductFinderRecommendation>;
  headingRef: React.RefObject<HTMLHeadingElement | null>; onChange: () => void; onAddProduct: (id: string) => void; onAddBundle: (id: string) => void;
}) {
  if (!recommendation.primaryProductId) return <div className="pf-no-match"><Badge tone="warm">Your recommendation</Badge><h1 ref={headingRef} tabIndex={-1}>We couldn’t find one clear match based on your answers.</h1><p>Try changing your answers or browse the entire fictional catalog.</p><div className="pf-actions"><Button onClick={onChange}>Change my answers</Button><Button asChild variant="outline"><Link href="/shop">Browse the entire catalog</Link></Button></div></div>;
  const product = products.find((item) => item.id === recommendation.primaryProductId)!;
  const bundle = productBundles.find((item) => item.id === recommendation.supportingBundleId);
  const copy = surveyProductCopy[product.id] ?? { descriptor: product.descriptor, supports: ["General wellness routines"] };
  return <div className="pf-result"><div className="pf-result-hero"><div><Badge tone="warm">Recommended based on your goals</Badge><h1 ref={headingRef} tabIndex={-1}>{product.name}</h1><p>{copy.descriptor}</p><div className="pf-price">{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(product.variants[0].price)} <small>{product.variants[0].label}</small></div><Badge tone={product.status === "In stock" ? "verified" : "warm"}>{product.status}</Badge><Button size="lg" onClick={() => onAddProduct(product.id)}><ShoppingBag /> Add to cart</Button></div><ProductVisual product={product} /></div><div className="pf-result-grid"><Card><h2>Why this was recommended</h2><ul>{recommendation.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}><Check />{recommendationReasonCopy(reason)}</li>)}</ul></Card><Card><h2>What it supports</h2><ul>{copy.supports.map((item) => <li key={item}><Check />{item}</li>)}</ul></Card></div>{bundle ? <Card className="pf-bundle"><div><Badge tone="dark">Optional routine</Badge><h2>{bundle.name}</h2><p>{bundle.description}</p><ul>{bundle.productIds.map((id) => <li key={id}>{products.find((item) => item.id === id)?.name}</li>)}</ul><strong>Save {bundle.discountValue}{bundle.discountType === "percentage" ? "%" : ""}</strong></div><div className="pf-bundle-actions"><Button onClick={() => onAddBundle(bundle.id)}>Add recommended bundle</Button><Link href="/cart">Review cart contents</Link></div></Card> : null}<div className="pf-alternatives"><h2>Other options to explore</h2>{recommendation.alternativeProductIds.map((id) => { const alternative = products.find((item) => item.id === id); return alternative ? <Link href={`/products/${alternative.slug}`} key={id}>{alternative.name}<ArrowRight /></Link> : null; })}</div><div className="pf-result-actions"><Button variant="outline" onClick={onChange}>Change my answers</Button><Button asChild variant="ghost"><Link href="/shop">Browse the entire catalog</Link></Button></div><p className="pf-disclaimer">Fictional demonstration only. This product finder does not provide medical advice, diagnose conditions, determine medical suitability, or guarantee outcomes. All products, prices, stories, and recommendations shown are fictional.</p></div>;
}
