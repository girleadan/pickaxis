import { Pack } from "../contract.js";

export const shopwarePhp: Pack = {
  id: "shopware-php",
  name: "Shopware 6 / PHP",
  detects: (s) =>
    s.hasComposerJson &&
    !!s.composerRequires?.some((r) => r.startsWith("shopware/")),
  questions: [
    {
      id: "shopware.plugin.skeleton",
      axis: "framework",
      difficulty: 1,
      prompt:
        "What are the minimum files a Shopware 6 plugin needs to be installable, and where does `composer.json` fit in?",
      rubric:
        "PluginBase class, composer.json with shopware-platform-plugin type and extra.shopware-plugin-class, services.xml under Resources/config. composer.json is the entry point Shopware reads to find the plugin class.",
    },
    {
      id: "shopware.di.services-xml",
      axis: "framework",
      difficulty: 2,
      prompt:
        "Why does Shopware require you to declare services in `services.xml` instead of just autowiring like vanilla Symfony?",
      rubric:
        "Shopware uses Symfony DI but ships compiled containers and decorates many core services; explicit XML keeps decoration predictable and lets the plugin lifecycle reload services cleanly. Autowiring partial answer is fine.",
    },
    {
      id: "shopware.events.subscriber-vs-listener",
      axis: "framework",
      difficulty: 2,
      prompt:
        "What's the practical difference between an EventSubscriber and an EventListener in Shopware, and which one should a plugin prefer?",
      rubric:
        "Subscriber declares its events in code (getSubscribedEvents); listener declares in XML. Subscriber is more discoverable and is the Shopware convention for plugins.",
    },
    {
      id: "shopware.context.sales-channel",
      axis: "business",
      difficulty: 3,
      prompt:
        "Why does almost every Shopware service take a `SalesChannelContext` or `Context`, and what happens if you pass the wrong one?",
      rubric:
        "Multi-tenant: language, currency, customer group, sales channel scope are all carried via Context. Wrong context = wrong prices, wrong language, possible data leaks across sales channels.",
    },
    {
      id: "shopware.migration.naming",
      axis: "database",
      difficulty: 2,
      prompt:
        "Why does Shopware require migration filenames to be timestamped, and what breaks if two devs commit migrations with the same timestamp?",
      rubric:
        "Migrations run in timestamp order; identical timestamps mean undefined ordering between branches, leading to drift between environments. Composer/CI may also reject duplicates.",
    },
  ],
  codemapHeuristics: [
    {
      label: "plugin entry",
      matches: (p) => /\/src\/[A-Z]\w+\.php$/.test(p) && !p.includes("/Test/"),
      describe: "Plugin base class — the entry point Shopware loads.",
    },
    {
      label: "DI config",
      matches: (p) => /\/Resources\/config\/.*\.xml$/.test(p),
      describe: "Service / route / scheduler definitions.",
    },
    {
      label: "storefront templates",
      matches: (p) => /\/Resources\/views\/storefront\//.test(p),
      describe: "Twig templates for the storefront.",
    },
    {
      label: "admin module",
      matches: (p) => /\/Resources\/app\/administration\//.test(p),
      describe: "Vue-based admin UI extensions.",
    },
    {
      label: "migrations",
      matches: (p) => /\/Migration\/Migration\d+\w+\.php$/.test(p),
      describe: "Schema migrations — read in timestamp order.",
    },
  ],
  antiPatterns: [
    {
      id: "shopware.context-ignored",
      description: "Repository call without passing the current Context.",
      detectHint:
        "Any `$repo->search(...)` or `->upsert(...)` without a Context argument is suspect — Shopware will reject it at runtime but AI tools sometimes write it.",
    },
    {
      id: "shopware.direct-sql",
      description: "Raw SQL where a DAL repository call would do.",
      detectHint:
        "Look for `Connection::executeQuery` in business logic; DAL is preferred so multi-tenant rules apply.",
    },
    {
      id: "shopware.missing-decoration-id",
      description:
        "Service decoration in services.xml without the `decoration-priority` attribute.",
      detectHint: "When multiple plugins decorate the same service, missing priority causes silent overrides.",
    },
  ],
};
