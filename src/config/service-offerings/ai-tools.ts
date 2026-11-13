import { proofJuno, proofLongGame, proofShipkit, proofSwell } from "./proof";
import type { Offering } from "./types";

export const aiTools: Offering = {
  number: 1,
  slug: "ai-tools-for-business",
  title: "We build AI tools for businesses",
  shortName: "AI tools for business",
  pillar: true,
  metaTitle: "Custom AI Tools for Business | Build And Serve",
  metaDescription:
    "We build AI tools that do real work inside your business: assistants, agents, document workflows and product features. Scoped on a free call, built by senior engineers.",
  intro:
    "For owners and operators who know where the hours go and want software that takes some of them back, without a demo that falls apart on real data.",
  painHeading: "What usually goes wrong",
  pains: [
    {
      title: "The pilot worked once, then stopped",
      body: "A prompt in a chat window handles the easy cases and falls over on the messy ones. Nobody owns it, so it quietly gets abandoned.",
    },
    {
      title: "Off-the-shelf tools don't know your business",
      body: "Generic assistants have never seen your pricing rules, your forms or your customers. You end up copying context in by hand every time.",
    },
    {
      title: "Nobody can say what it costs or what it did",
      body: "Usage bills drift, outputs aren't logged, and no one can tell whether a bad answer was a one-off or a pattern.",
    },
    {
      title: "Your team doesn't trust it",
      body: "If a wrong answer can reach a customer unchecked, people route around the tool. Adoption needs a human in the right places.",
    },
  ],
  outcomes: [
    "One AI tool wired into the systems your team already uses, not a separate app to remember",
    "Review steps where a wrong answer would cost you, and automation where it wouldn't",
    "Logs of what the tool did and what it cost, readable by a non-engineer",
    "Source code and accounts in your name, plus a short handover for whoever runs it next",
  ],
  processHeading: "How an AI tool build runs",
  process: [
    {
      title: "Find the one job",
      body: "A call about where time and money leak. We pick a single task with clear inputs and a clear definition of a good result.",
    },
    {
      title: "Prove it on your real data",
      body: "A working prototype against a sample of your actual documents or tickets, so you see the failure cases early and cheaply.",
    },
    {
      title: "Build it into your workflow",
      body: "Connect it to the inbox, CRM, Slack or database where the work already happens. Add review steps, logging and cost limits.",
    },
    {
      title: "Hand it over and watch it",
      body: "Your team uses it for a trial period while we fix what real use turns up. Then we document it and step back, or stay on a care plan.",
    },
  ],
  proof: [proofJuno, proofShipkit, proofSwell],
  faqs: [
    {
      question: "What kinds of AI tools do you build?",
      answer:
        "Assistants that answer from your own documents, agents that handle a repeating back-office task, document and intake workflows, and AI features inside an existing product. We pick the narrowest tool that does the job.",
    },
    {
      question: "Do we need clean data before we start?",
      answer:
        "No. Most business data is messy. The prototype step is there to find out how messy, and what it takes to make the tool useful anyway.",
    },
    {
      question: "Will our data be used to train someone else's model?",
      answer:
        "We choose providers and settings that don't train on your data, and we write down which ones. If your contracts require a specific vendor or region, tell us up front and we'll build around it.",
    },
    {
      question: "How much does it cost?",
      answer:
        "It depends on the job. We scope it on a free 30-minute call and send a written proposal before any work starts. Our general rates are on the pricing page.",
    },
    {
      question: "Can you improve a tool someone else already built?",
      answer:
        "Yes. We'll review what's there first and tell you honestly whether to fix it or rebuild it.",
    },
  ],
  related: [
    "add-ai-features-to-your-product",
    "mvp-in-30-days-fixed-price",
    "websites-and-digital-presence",
  ],
  publishedAt: "2026-11-13",
};

export const aiFeatures: Offering = {
  number: 2,
  slug: "add-ai-features-to-your-product",
  title: "We add AI features to your existing product",
  shortName: "AI features for your product",
  pillar: false,
  parent: "ai-tools-for-business",
  metaTitle: "Add AI Features to Your Existing Product | Build And Serve",
  metaDescription:
    "Search, summaries, drafting and assistants built into the app you already run. Senior engineers, no rewrite, no new platform for your users to learn.",
  intro:
    "For teams with a live product and a roadmap full of AI ideas. We build the feature inside your codebase and your design, and your users never leave the app.",
  painHeading: "Where AI features stall",
  pains: [
    {
      title: "Your team is busy shipping the roadmap",
      body: "The AI feature keeps losing to the next release. A short, focused engagement gets it built without pulling your engineers off core work.",
    },
    {
      title: "A chatbot bolted to the side isn't a feature",
      body: "Users want the product to be smarter where they already are: search that understands them, drafts they can edit, summaries of their own data.",
    },
    {
      title: "Latency, cost and failures are product problems",
      body: "A slow or flaky model call is a broken button. Streaming, fallbacks, caching and spend limits need design from the start.",
    },
    {
      title: "Nobody knows if it's any good",
      body: "Without a small set of test cases and a way to review outputs, every prompt change is a guess.",
    },
  ],
  outcomes: [
    "The feature shipped inside your existing app, matching your stack and your design system",
    "Streaming responses, sensible failure states and per-user or per-account spend limits",
    "A small evaluation set so you can change prompts or models without guessing",
    "Documentation your own engineers can pick up and extend",
  ],
  processHeading: "How we add a feature",
  process: [
    {
      title: "Read your codebase",
      body: "We start in your repo and your architecture, so the feature fits what exists instead of fighting it.",
    },
    {
      title: "Pick the smallest useful version",
      body: "One feature, one user job. We agree what good output looks like before writing any model code.",
    },
    {
      title: "Build behind a flag",
      body: "Ship it dark, test with your own team and a few real accounts, and watch quality and cost before everyone sees it.",
    },
    {
      title: "Release and hand off",
      body: "Roll it out, document how it works, and walk your engineers through where to change prompts, models and limits.",
    },
  ],
  proof: [proofSwell, proofShipkit, proofLongGame],
  faqs: [
    {
      question: "What stack do you work in?",
      answer:
        "Mostly Next.js, React, Node and TypeScript, with React Native for mobile. If your product is on something else, say so on the call and we'll tell you whether we're a fit.",
    },
    {
      question: "Do we have to use a specific AI provider?",
      answer:
        "No. We build so the model can be swapped, and we'll recommend a provider based on quality, cost and your data requirements.",
    },
    {
      question: "How do you keep users' data private?",
      answer:
        "We send the model only what the feature needs, use providers that don't train on API data, and keep prompts and logs inside your own infrastructure where we can.",
    },
    {
      question: "How long does a single feature take?",
      answer:
        "We won't quote a number before seeing your codebase. After a short review we put a timeline and scope in writing.",
    },
  ],
  related: ["ai-tools-for-business", "mvp-in-30-days-fixed-price", "take-over-your-codebase"],
  publishedAt: "2026-11-13",
};
