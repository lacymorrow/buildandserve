import { proofCreditKarma, proofShipkit, proofSwell } from "./proof";
import type { Offering } from "./types";

export const websites: Offering = {
  number: 21,
  slug: "websites-and-digital-presence",
  title: "We build websites and digital presence",
  shortName: "Websites and digital presence",
  pillar: true,
  metaTitle: "Website Design and Development | Build And Serve",
  metaDescription:
    "Fast, well-built websites for businesses that want to be found and trusted. Next.js sites with solid SEO foundations, booking, payments and ongoing care. Based in Charlotte.",
  intro:
    "For businesses whose website is the first thing customers see. We build it fast, make it easy to find, and keep it running.",
  painHeading: "What a weak site costs you",
  pains: [
    {
      title: "It looks dated or loads slowly",
      body: "People decide in seconds. A slow, clumsy site on a phone sends them to a competitor before they read a word.",
    },
    {
      title: "Google can't tell what you do",
      body: "Missing titles, thin pages and no structured data mean search engines guess. You lose the searches you should win.",
    },
    {
      title: "It's hard for you to change",
      body: "Every edit needs a developer, or the template fights you. Simple updates turn into a project.",
    },
    {
      title: "Nobody is looking after it",
      body: "Updates pile up, backups are unclear and a plugin breaks the site on a Friday night.",
    },
  ],
  outcomes: [
    "A fast, mobile-first site on your domain, built on Next.js",
    "Technical SEO foundations: page titles, descriptions, sitemap, structured data and clean URLs",
    "Contact, booking or payment flows that work and send you the lead",
    "Hosting, backups and updates handled, with optional monthly care",
  ],
  processHeading: "How a website project runs",
  process: [
    {
      title: "Goals and content",
      body: "What the site must do for you, who it speaks to and what pages it needs. We help with structure and wording where you're stuck.",
    },
    {
      title: "Design and build",
      body: "A clear design in your brand, built for speed and for phones first. You review it on a live preview, not a static mockup.",
    },
    {
      title: "Launch properly",
      body: "Redirects from old URLs, analytics, search engine setup and a check across devices before the switch.",
    },
    {
      title: "Care and growth",
      body: "Hosting and updates on a monthly plan, plus new pages and improvements as the business grows.",
    },
  ],
  proof: [proofShipkit, proofCreditKarma, proofSwell],
  faqs: [
    {
      question: "What does a website cost?",
      answer:
        "Our pricing page lists starting points for different sizes of site, and the minimum engagement. We confirm the exact price in writing after a free call.",
    },
    {
      question: "Will I be able to edit the site myself?",
      answer:
        "If you want that, we can add a content editor so you can change text and images without a developer. Tell us how often you expect to edit and we'll pick the right setup.",
    },
    {
      question: "Do you handle SEO?",
      answer:
        "We build the technical foundation: structure, speed, metadata and schema. Ongoing content strategy is a separate conversation, and we'll say plainly what SEO can and can't promise.",
    },
    {
      question: "Can you move us off WordPress, Wix or Squarespace?",
      answer:
        "Yes. We keep your URLs and content so you don't lose the search traffic you have, and we plan the switch to avoid downtime.",
    },
    {
      question: "Do you work with local businesses?",
      answer:
        "Yes. We're based in Charlotte and work with local businesses as well as companies elsewhere.",
    },
  ],
  related: ["build-and-launch-your-app", "ai-tools-for-business", "take-over-your-codebase"],
  publishedAt: "2026-11-13",
};
