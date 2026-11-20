import { proofCreditKarma, proofLongGame, proofShipkit, proofTwilio } from "./proof";
import type { Offering } from "./types";

export const founderApps: Offering = {
  number: 11,
  slug: "build-and-launch-your-app",
  title: "We help founders build and launch their app",
  shortName: "Build and launch your app",
  pillar: true,
  metaTitle: "App Development for Founders | Build And Serve",
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

export const figmaToProduct: Offering = {
  number: 13,
  slug: "figma-to-working-product",
  title: "We turn your Figma into a working product",
  shortName: "Figma to working product",
  pillar: false,
  parent: "build-and-launch-your-app",
  metaTitle: "Figma to Working Product: Design to Code | Build And Serve",
  metaDescription:
    "You have the designs. We build them into a real, deployed app with logins, data and payments. Senior engineers, weekly demos, and the code handed to you.",
  intro:
    "For founders and teams with finished or nearly finished designs and nobody to build them. We turn the screens into software people can use.",
  painHeading: "Where design-to-build goes wrong",
  pains: [
    {
      title: "A prototype is not a product",
      body: "Clickable screens show what the app looks like. They don't say where the data lives, who can see what, or what happens when a payment fails. Someone has to decide all of that.",
    },
    {
      title: "The build drifts from the design",
      body: "Spacing, states and small interactions get lost between the file and the browser. By launch it looks like a cousin of what you approved.",
    },
    {
      title: "Designs skip the hard screens",
      body: "Empty states, errors, loading, settings, and the mobile layout are often missing from the file. We flag the gaps early so they don't become surprises.",
    },
    {
      title: "Your designer and a developer don't speak the same language",
      body: "Handoffs stall when nobody translates between the two. We work from your file directly and ask questions before guessing.",
    },
  ],
  outcomes: [
    "Your Figma screens built as a responsive, deployed app on your domain",
    "The parts the design never covered, such as logins, data, email and payments, built and working",
    "A short list of design gaps we found and how we resolved each one",
    "The repository and accounts in your name, with a plain-language handover",
  ],
  processHeading: "From file to live app",
  process: [
    {
      title: "Review the file",
      body: "We go through every screen and flow, list what is missing, and tell you what the build needs beyond the pictures. This is part of the free scoping call.",
    },
    {
      title: "Written scope and quote",
      body: "What gets built, what waits, the timeline and the price, in writing before any build work starts.",
    },
    {
      title: "Build against the design",
      body: "We build in short cycles and show you working software every week or two, checked against your file, so drift gets caught early.",
    },
    {
      title: "Launch and hand over",
      body: "We deploy it, move the accounts into your name, and stay available while the first users find the rough edges.",
    },
  ],
  proof: [proofShipkit, proofLongGame, proofCreditKarma],
  faqs: [
    {
      question: "Do I need a finished design?",
      answer:
        "No. Finished screens are the easiest to build from, but we can start from a partial file and tell you which screens still need drawing. If you have no designs yet, we can talk through options.",
    },
    {
      question: "Will it look exactly like the Figma file?",
      answer:
        "That's the goal, and we review each build against the file. Where the browser forces a compromise, such as a font, an animation or a screen size the file never showed, we tell you rather than quietly change it.",
    },
    {
      question: "Can you also build the backend?",
      answer:
        "Yes. Most projects need accounts, a database and integrations behind the screens, and we build those as part of the same project.",
    },
    {
      question: "Do you build mobile apps from Figma too?",
      answer:
        "We build web apps and React Native mobile apps. We'll recommend whichever fits your first users, and often that means starting on the web.",
    },
    {
      question: "What does it cost?",
      answer:
        "It depends on how many screens and how much logic sits behind them. You get a written proposal with the price before work starts. General rates and minimums are on the pricing page.",
    },
  ],
  related: ["mvp-in-30-days-fixed-price", "rescue-stalled-projects", "build-and-launch-your-app"],
  publishedAt: "2026-11-17",
};

export const rescueProjects: Offering = {
  number: 18,
  slug: "rescue-stalled-projects",
  title: "We rescue stalled or half-built projects",
  shortName: "Rescue stalled projects",
  pillar: false,
  parent: "build-and-launch-your-app",
  metaTitle: "Rescue a Stalled or Half-Built Software Project | Build And Serve",
  metaDescription:
    "Your app is late, over budget or stuck at 80 percent. We audit what exists, tell you plainly whether to keep or rebuild it, and get it to launch.",
  intro:
    "For founders and business owners whose project has stopped moving. We look at what exists, tell you the truth about it, and finish the job.",
  painHeading: "How projects stall",
  pains: [
    {
      title: "It's always almost done",
      body: "The last 20 percent keeps taking longer than the first 80. Dates slip, updates get vague and you can't tell how far along it really is.",
    },
    {
      title: "The budget is gone and so is the confidence",
      body: "You've paid for months of work and can't tell whether it's worth building on. You need an independent read from people who don't profit from the answer.",
    },
    {
      title: "The team changed or disappeared",
      body: "The agency moved on or the freelancer went quiet, and the knowledge left with them. What remains is code nobody can explain.",
    },
    {
      title: "Nobody will say it's broken",
      body: "Each person you ask either defends the work or recommends starting over. You want a straight answer about what is sound and what isn't.",
    },
  ],
  outcomes: [
    "A written, plain-English audit of the code, the infrastructure and where the project really stands",
    "A clear recommendation to continue, repair or rebuild, with the reasoning",
    "A short list of what must be fixed before launch and what can wait",
    "The project finished and deployed, with the repository and accounts in your name",
  ],
  processHeading: "How a rescue works",
  process: [
    {
      title: "Get access and see what exists",
      body: "We sort out the repository, hosting, domain and third-party accounts, and read the project as it stands today.",
    },
    {
      title: "Audit and honest report",
      body: "What works, what is risky, what is missing and what each path would cost. Most half-built projects are worth saving, and we say so when they aren't.",
    },
    {
      title: "Reset the scope",
      body: "We agree the shortest route to a launch you can stand behind, in writing, with a timeline and a price.",
    },
    {
      title: "Finish and launch",
      body: "Working software every week or two until it ships, then a handover so the project has an owner again.",
    },
  ],
  proof: [proofCreditKarma, proofTwilio, proofShipkit],
  faqs: [
    {
      question: "Should I keep the existing code or start over?",
      answer:
        "Most of the time keep it, but it depends on what we find. After the audit you get a recommendation with the reasons. A rebuild is the last option, not the first.",
    },
    {
      question: "What if the original developer won't hand things over?",
      answer:
        "Check first whether you own the repository, hosting and domain accounts, since they often sit under your company's email. We help trace what exists. We can't promise access to code that was never stored anywhere you control, and we'll tell you early if that's the situation.",
    },
    {
      question: "How long does a rescue take?",
      answer:
        "The audit is short. The finish depends on how much is left, and you get a timeline in writing before work starts.",
    },
    {
      question: "What does it cost?",
      answer:
        "We scope it on a free call and quote in writing before we begin. Pricing basics are on the pricing page.",
    },
    {
      question: "What stacks can you work in?",
      answer:
        "We're strongest in JavaScript and TypeScript, React, Next.js and Node. For anything else we'll look at the code first and tell you whether we're the right people.",
    },
  ],
  related: ["take-over-your-codebase", "mvp-in-30-days-fixed-price", "figma-to-working-product"],
  publishedAt: "2026-11-17",
};
