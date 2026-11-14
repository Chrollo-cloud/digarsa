# Public marketing pages — Phase C

## Reference adaptation

The supplied About reference informs the white canvas, large centered heading,
wide editorial photo, asymmetric mission composition, and generous spacing. The
supplied process references inform the original idea → brief → work line drawing,
connected vertical steps, distinct panels, and restrained scroll reveals. No
reference brand, copy, artwork, fictional team, statistics, or partner logos were
reproduced. Text is written for Digarsa's actual Indonesian creative marketplace.

Existing Digarsa logo, navbar, footer, fonts, and tokens remain unchanged. Pages
share a scoped `.marketing` stylesheet, small page/motion wrapper, and closing CTA.
`App.jsx` replaces only the two existing placeholder routes with lazy-loaded pages
and an accessible loading status. Shared marketing code/styles are fetched on demand.

## Content and interactions

- `/about`: hero, story about local creative needs/UMKM, mission and three values,
  customer/creator benefits, demo note, Marketplace and onboarding links.
- `/how-it-works`: original editable inline SVG; six steps each for Customer and
  Creator; native toggle buttons with aria-pressed, aria-controls and live status;
  semantic ordered list, connected decorative path, and existing-route links.
- Audience buttons support native Tab, Enter and Space without requiring a custom
  tab keyboard model. Switching keeps focus and scroll context; full page changes
  reset to the page top, while the `#langkah` anchor targets the process section.
- Booking, messaging, review, account and seller capabilities are explained only.
  Protected CTA destinations rely on existing guards and safe login return paths.
  There are no store writes, new permissions, contracts, or lifecycle changes.
- Public copy discloses local browser storage and absent payments/cross-device
  synchronization. Accepted is not described as Paid or Completed. Reviews require
  an actually Completed booking. Photos illustrate creative environments.

## Assets

Reused in place from `src/assets/home/`: workspace.jpg, design.jpg, digital.jpg.
Their existing [license/attribution record](../../assets/home/README.md) documents
Unsplash licensing. No external runtime image URLs or new third-party downloads.
The SVG in ProcessIllustration.jsx is newly authored code and remains editable.

## Accessibility and motion

One h1 per page, labeled sections, useful image alt text, descriptive links, native
buttons, existing visible focus styling, and responsive single-column content.
The desktop process intro is sticky; it becomes normal flow at narrow widths.
No mobile horizontal scrolling or hover-only interaction is required.

Content is visible by default, including without IntersectionObserver. The
observer adds a one-time 500ms reveal (opacity .6 to 1, movement 14px); it never
adds hidden/pending states. prefers-reduced-motion skips observer setup and removes
animation and transitions in CSS, including when the preference changes at runtime.

## Verification

- Lint, production build, all 160 existing tests, and git diff --check passed.
- Both pages and direct reload checked at 1440, 1024, 768, and 390px; document
  scrollWidth matched viewport width. Customer/Creator switching passed at each.
- Keyboard Tab, Shift+Tab, Enter, Space, visible focus, and six steps per role checked.
- Navbar mobile navigation and footer links passed. Marketplace CTAs reached the
  actual marketplace. Messaging, onboarding, and Seller Center CTAs reached login
  with the correct protected return destinations. The process anchor worked.
- Scroll reveals and loaded imagery checked in the browser; lazy images load on
  approach. Reduced-motion rules were inspected in the browser CSSOM and all six
  steps remained visible without pending states. The browser exposed no media
  emulation control, so an active native reduced-motion preference was not tested.
- Mobile QA found and fixed a joined headline at the hidden line break and image
  attributes overriding the intended aspect ratios. No changes to existing pages
  were needed. Screenshots were captured in /private/tmp for the completion report.

## Exact files

Modified: `src/App.jsx` (two public route imports/definitions only).
Added in `src/pages/marketing/`: AboutPage.jsx, HowItWorksPage.jsx, MarketingPage.jsx,
ProcessIllustration.jsx, processSteps.js, marketing.css, README.md.

No backend, business stores, authentication, Seller/Admin/Customer screens,
Homepage, Marketplace, Reviews, or shared messaging contracts were modified.
