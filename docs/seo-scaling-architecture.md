# HOODYBOODY SEO Scaling Architecture

Indexing status: disabled. The site keeps `noindex, nofollow, noarchive` in meta tags, server headers and Vercel headers until the owner explicitly enables indexing.

## 1. Sitemap Architecture

- `/`
- `/locations/`
- `/locations/{state}/`
- `/locations/{state}/{city}/`
- `/{product-page}/`, for example `/embroidered-hoodies/`
- Existing checkout, account, admin and live chat pages remain utility pages and should stay noindex.

## 2. URL Structure

Preferred scalable URL pattern for individually created state pages:

- `/locations/indiana/`
- `/locations/indiana/indianapolis/`
- `/locations/indiana/fort-wayne/`

Product landing pages:

- `/embroidered-hoodies/`
- `/embroidered-tshirts/`
- `/embroidered-sweatshirts/`
- `/embroidered-hats/`
- `/embroidered-tote-bags/`

This is more scalable than one-off URLs such as `/indianapolis-custom-embroidery/` because states and cities can be generated from data.

## 3. Folder Structure

- `content/locations.json` stores states, cities, metadata, local text, FAQs and nearby city relationships.
- `content/product-pages.json` stores product landing page metadata and matching keywords.
- `server.js` renders dynamic SEO-ready pages from the content files.
- `docs/seo-scaling-architecture.md` documents the scaling model.

## 4. Routing Structure

Current stack is Express/static, not Next.js. Clean routes are rendered in Express. Public discovery is filtered to the configured location state from `LOCATION_TARGET_STATE` or `HOODYBOODY_LOCATION_STATE`:

- `/locations/`
- `/locations/:state/`
- `/locations/:state/:city/`
- `/:productLanding/`

If the project later moves to Next.js, the matching App Router structure would be:

- `app/locations/page.tsx`
- `app/locations/[state]/page.tsx`
- `app/locations/[state]/[city]/page.tsx`
- `app/[productLanding]/page.tsx`
- use `generateStaticParams()`, Metadata API and static/ISR generation.

## 5. Homepage Structure

Keep the current premium minimal flow:

- Hero
- Shop by category
- Featured product landing links
- Custom embroidery upload flow
- Business and bulk embroidery CTA
- Service coverage preview
- Order/contact block

## 6. Footer Structure

The footer is the place for SEO links, not the main menu:

- Products
- Service areas
- Custom embroidery

Main navigation stays compact.

## 7. Locations Architecture

Each state has:

- state name
- state slug
- state metadata
- cities array

Each city has:

- city name
- city slug
- SEO title
- meta description
- intro
- local text
- nearby cities
- FAQ

## 8. Example City Page

`/locations/indiana/indianapolis/` contains:

- local hero
- embroidery services
- product categories
- custom order CTA
- local SEO text
- FAQ
- nearby city links
- breadcrumbs and JSON-LD

## 9. Example Indiana Structure

Indiana currently includes:

- Indianapolis
- Fort Wayne
- Evansville
- South Bend
- Bloomington

Additional states can remain in `content/locations.json`, but they are not linked in the menu, footer, `/locations/` page, or sitemap unless that state is selected as the active location target.

## 10. Internal Linking Strategy

- Homepage links to product pages and selected service areas.
- Product pages link to the custom upload flow and service areas.
- City pages link to product pages, nearby cities and custom order CTA.
- Footer contains restrained service-area links.

## 11. Scaling To Another State

Add or update states and cities in `content/locations.json`, then set `LOCATION_TARGET_STATE` to the state slug that should be exposed.

Do not add all states to the main menu. The top menu and sitemap should expose only the active state.

## 12. Avoiding Thin Content

Each city page should include:

- unique intro
- unique local text
- at least one city-specific FAQ
- nearby cities
- product/category links
- real service details

Do not generate hundreds of identical city pages with only city names changed.

## 13. Reusable Templates

Reusable blocks:

- SEO hero
- Service cards
- Product category cards
- Custom embroidery CTA
- FAQ list
- Nearby city buttons
- Footer service-area links

## 14. Recommended UI Blocks

- Keep location pages editorial and premium, not directory-like.
- Use restrained cards, thin borders and real product imagery.
- Avoid oversized state/city lists in top navigation.
- Keep upload and quote flow clear and calm.

## 15. Mobile UX Recommendations

- Keep top navigation compact behind the icon menu.
- Use single-column city buttons.
- Keep upload target large and tappable.
- Keep CTAs visible but not repeated aggressively.
- Avoid long dropdown city lists on mobile.
