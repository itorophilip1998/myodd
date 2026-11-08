# MyOdd SEO, Indexing, and Analytics

## Summary

Extend the existing Next.js implementation while preserving code generation, guest settings, public collection browsing, and account privacy. Keep the homepage generator and add useful, server-rendered SEO content below it.

## Implementation

### Public access and authentication

- Remove the global Clerk loading gate from public content. Keep authenticated requests gated until session initialization finishes.
- Preserve guest features; enforce authentication and ownership for personal collections and account operations.
- Audit Clerk middleware, environment handling, and production deployment configuration without exposing secrets.
- Local Clerk credentials are development credentials. Verify deployed credentials before changing them; preserve existing accounts and ownership mappings rather than blindly switching instances.
- Ensure missing or deleted public collections return a genuine HTTP 404, while temporary backend failures remain distinguishable.

### SEO and indexing

- Centralize canonical URLs, page titles, descriptions, robots directives, Open Graph, and Twitter metadata.
- Use `https://myodd.org` as the production canonical origin; retain explicit local origins for development and tests.
- Add homepage sections explaining generation, supported markets, collection management, result checking, FAQs, and responsible gambling. Use one H1 and descriptive internal links.
- Add `/about` and `/faq` with accurate product information and links from public navigation.
- Include Organization, WebSite, and SoftwareApplication JSON-LD backed by visible content. Add a branded social image using existing assets.
- Build the sitemap from durable public routes: `/`, `/about`, `/faq`, `/terms`, and `/privacy`. Exclude temporary collections and data-driven utility pages.
- Apply `noindex` to temporary collections, authentication, personal workspaces, and thin utility pages. Preserve useful social previews for public collections.
- Serve valid robots rules and the canonical sitemap URL. Allow crawlers to read public `noindex` pages; restrict unnecessary API crawling.
- Omit `lastmod` unless a trustworthy modification date exists.

### Google verification

- Add optional `GOOGLE_SITE_VERIFICATION` configuration through Next.js verification metadata and deployment environment examples.
- Use token `c315TbfKdqoaKm_ZCFVUj_UGicyj8QmWpGurIdRyVzM`, excluding the trailing sentence period.
- Document the DNS TXT record `google-site-verification=c315TbfKdqoaKm_ZCFVUj_UGicyj8QmWpGurIdRyVzM` for Domain-property verification. HTML metadata supports URL-prefix verification; DNS verification requires DNS access.
- Provide owner steps to verify ownership, submit the sitemap, inspect the homepage, and review indexing reports. Follow [Google’s Search Console workflow](https://developers.google.com/search/docs/monitor-debug/search-console-start).

### Analytics and consent

- Extend the existing GA4 integration using the real `NEXT_PUBLIC_GA_MEASUREMENT_ID`; leave tracking disabled until configured.
- Retain `NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED` and require Enhanced