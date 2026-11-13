import { proofCreditKarma, proofLongGame, proofShipkit, proofTwilio } from "./proof";
import type { Offering } from "./types";

export const founderApps: Offering = {
  number: 11,
  slug: "build-and-launch-your-app",
  title: "We help founders build and launch their app",
  shortName: "Build and launch your app",
  pillar: true,
  metaTitle: "We Build and Launch Your App for Founders | Build And Serve",
  metaDescription:
    "From idea to a live app with real users. A senior engineering team builds your first version, handles hosting and payments, and hands you the code.",
  intro:
    "For founders who have an idea, a deadline and no engineering team. We build the first version and get it in front of people.",
  painHeading: "What stalls a first app",
  pains: [
    {
      title: "You can't tell if the quote is fair",
      body: "Estimates for the same idea range tenfold. Without a technical person on your side, you can't judge scope, risk or whether you're paying for things you don't need.",
    },
    {
      title: "Freelancers vanish and agencies overbuild",
      body: "One person leaves you with code nobody else can read. A big agency hands you a year-long plan for something you needed in weeks.",
    },
    {
      title: "Launch means more than code",
      body: "Hosting, logins, payments, email, analytics and a way to take feedback all have to exist on day one.",
    },
    {
      title: "You don't know what to cut",
      body: "Every feature feels necessary. Someone has to say which ones can wait until you have users.",
    },
  ],
  outcomes: [
    "A deployed app on your own domain that real people can sign up for and use",
    "Accounts, payments, email and analytics set up and working",
    "The repository and every account transferred to you, with a plain-language handover",
    "A short list of what we left out on purpose and what to build next",
  ],
  processHeading: "From idea to live",
  process: [
    {
      title: "Talk it through",
      body: "A free 30-minute call. We ask who it's for and what the first useful version looks like, and tell you plainly if we aren't the right team.",
    },
    {
      title: "Written scope",
      body: "A proposal with what's in, what's out, the timeline and the cost, before you spend anything on build work.",
    },
    {
      title: "Build in short cycles",
      body: "Working software every week or two. You click through it, tell us what's wrong, and we adjust.",
    },
    {
      title: "Launch and hand over",
      body: "We deploy it, move the accounts into your name and stay available while the first users find the rough edges.",
    },
  ],
  proof: [proofShipkit, proofLongGame, proofCreditKarma],
  faqs: [
    {
      question: "Do you work with non-technical founders?",
      answer:
        "Yes, most of the time. Part of the job is translating between what you want and what it takes to build, and saying so when the two don't match.",
    },
    {
      question: "Who owns the code?",
      answer:
        "You do. The repository, hosting and third-party accounts are set up in your name, and we hand everything over at launch.",
    },
    {
      question: "What does it cost?",
      answer:
        "It depends on scope. After the call you get a written proposal with the price before work starts. Our general rates and minimums are on the pricing page.",
    },
    {
      question: "Can you also help after launch?",
      answer:
        "Yes. We offer monthly care plans for hosting, fixes and small changes, and we take on new feature work as separate projects.",
    },
    {
      question: "Do you build mobile apps?",
      answer:
        "We build web apps and React Native mobile apps. We'll recommend whichever fits your first users, and often that means starting on the web.",
    },
  ],
  related: ["mvp-in-30-days-fixed-price", "take-over-your-codebase", "ai-tools-for-business"],
  publishedAt: "2026-11-13",
};

export const mvp30: Offering = {
  number: 12,
  slug: "mvp-in-30-days-fixed-price",
  title: "MVP in 30 days, fixed price",
  shortName: "MVP in 30 days",
  pillar: false,
  parent: "build-and-launch-your-app",
  metaTitle: "MVP in 30 Days, Fixed Price | Build And Serve",
  metaDescription:
    "A tightly scoped first version of your product, quoted up front at a fixed price and built in about 30 days. Written scope, weekly demos, code handed to you.",
  intro:
    "For founders who want a working product quickly and a number they can plan around. We agree the scope, quote it up front, and build to it.",
  painHeading: "Why open-ended builds hurt",
  pains: [
    {
      title: "Hourly billing with no ceiling",
      body: "An open meter makes it hard to plan a runway. You want to know the cost before you commit, not discover it in month three.",
    },
    {
      title: "Scope creeps in both directions",
      body: "Features get added one at a time until the launch date moves. A fixed scope keeps the deadline honest.",
    },
    {
      title: "A first version that tries to be the whole product",
      body: "An MVP is the smallest thing that tests whether people want this. Everything else waits for evidence.",
    },
    {
      title: "Demos at the end, surprises at the end",
      body: "If you only see the product at delivery, you find the misunderstandings when they are most expensive.",
    },
  ],
  outcomes: [
    "A written scope that lists what is in the first version and what is not",
    "A fixed price, quoted up front, for that scope",
    "A live, usable product on your domain at the end of the build window",
    "Weekly demos so you see progress and can steer before it's late",
  ],
  processHeading: "How the 30 days work",
  process: [
    {
      title: "Scope call and written quote",
      body: "We settle the one user, the one job and the short feature list. You get the scope and a fixed price in writing before any build work starts.",
    },
    {
      title: "Weeks one and two: the core",
      body: "The main flow end to end, on real infrastructure from the start, with accounts and data models in place.",
    },
    {
      title: "Weeks three and four: finish and launch",
      body: "Payments, email and polish, then testing, deployment and moving the accounts into your name.",
    },
    {
      title: "Change control",
      body: "If you want something outside the agreed scope, we tell you what it adds to the price and the date, and you decide.",
    },
  ],
  proof: [proofShipkit, proofLongGame],
  faqs: [
    {
      question: "How much is the fixed price?",
      answer:
        "It depends on the scope, so we quote it in writing after a free call. We don't publish one number because the right first version differs by project.",
    },
    {
      question: "Is 30 days always realistic?",
      answer:
        "For a tightly scoped first version, often yes. If your idea needs more, we say so on the call and either cut scope or give you a longer, honest timeline. You don't pay for that conversation.",
    },
    {
      question: "What counts as an MVP?",
      answer:
        "One type of user, one core job, and only the features that job needs. Admin tools, extra roles and integrations usually come after the first users.",
    },
    {
      question: "What if I need changes mid-build?",
      answer:
        "Small swaps inside the scope are fine. Anything that adds work is quoted separately before we do it, so the price you agreed stays the price.",
    },
    {
      question: "Who owns the code at the end?",
      answer: "You do, along with the hosting and third-party accounts.",
    },
  ],
  related: [
    "build-and-launch-your-app",
    "take-over-your-codebase",
    "add-ai-features-to-your-product",
  ],
  publishedAt: "2026-11-13",
};

export const codebaseTakeover: Offering = {
  number: 19,
  slug: "take-over-your-codebase",
  title: "We take over your codebase when your developer disappears",
  shortName: "Take over your codebase",
  pillar: false,
  parent: "build-and-launch-your-app",
  metaTitle: "Developer Disappeared? We Take Over Your Codebase | Build And Serve",
  metaDescription:
    "Your developer is gone and your app still has to run. We get access, audit the code, fix what's urgent and keep your product moving. Senior engineers, plain-English report.",
  intro:
    "For business owners whose app works today but depends on someone who stopped answering. We take it over, make it safe, and keep it running.",
  painHeading: "What this feels like",
  pains: [
    {
      title: "You don't have the keys",
      body: "The code sits in someone else's repository, the hosting is on their card and the domain is in their name. First we sort out access.",
    },
    {
      title: "Nobody knows how it works",
      body: "There is no documentation and no one to ask. The risk isn't only bugs. It's that you can't tell which ones exist.",
    },
    {
      title: "Something is about to expire",
      body: "Certificates, API keys, a framework version, a payment integration. Small things that quietly break a live app.",
    },
    {
      title: "You can't tell good code from bad",
      body: "You need an independent read on whether to keep building on it or replace it, from someone with no stake in selling you a rewrite.",
    },
  ],
  outcomes: [
    "Repository, hosting, domain and third-party accounts moved into your name",
    "A written audit of the code, the infrastructure and the risks, in plain English",
    "Urgent fixes done first: backups, expiring credentials, security holes, anything about to break",
    "An honest recommendation to keep, repair or rebuild, and a plan for the next steps",
  ],
  processHeading: "How a takeover works",
  process: [
    {
      title: "Get access safely",
      body: "We work out where everything lives and how to recover each account. Where the former developer is reachable, we ask for a clean handover. Where they aren't, we use the registrar and provider recovery routes.",
    },
    {
      title: "Stabilize",
      body: "Set up backups, monitoring and a separate staging copy. Fix what could take the app down this month.",
    },
    {
      title: "Audit and report",
      body: "We read the code, the dependencies and the deployment, then write up what's sound, what's risky and what it would cost to fix.",
    },
    {
      title: "Keep it moving",
      body: "Continue with fixes and new features, or move to a monthly care plan so the app has an owner again.",
    },
  ],
  proof: [proofCreditKarma, proofTwilio, proofShipkit],
  faqs: [
    {
      question: "What if I can't get the code from my developer?",
      answer:
        "Start by checking whether you own the repository, hosting and domain accounts, since those often sit under your company's email. We help trace what exists and recover access through the providers. We can't promise access to code that was never stored anywhere you control, and we'll tell you early if that's the situation.",
    },
    {
      question: "Do you rewrite everything?",
      answer:
        "Not by default. Most inherited apps are worth keeping. We give you an honest recommendation after the audit, and a rewrite is the last option, not the first.",
    },
    {
      question: "What does the audit cost?",
      answer:
        "We scope it on a free call and quote it in writing before we start. Pricing basics are on the pricing page.",
    },
    {
      question: "What stacks can you take over?",
      answer:
        "We're strongest in JavaScript and TypeScript, React, Next.js and Node. For other stacks we'll look at the code first and tell you whether we're the right people.",
    },
    {
      question: "Can you keep the app running day to day?",
      answer: "Yes. Our monthly care plans cover hosting, updates, monitoring and small changes.",
    },
  ],
  related: [
    "build-and-launch-your-app",
    "mvp-in-30-days-fixed-price",
    "websites-and-digital-presence",
  ],
  publishedAt: "2026-11-13",
};
