# Coffee showcase provenance

Reference: https://x.com/BardhylBytyqi/status/2119564543299059969
Original published template: https://kuro-coffee-template.modulify.website/
Template catalogue: https://modulify.ai/templates (Kuro Coffee, free clone).

The scene images (locally resized to 2048px WebP for delivery) and ingredient key sheet are the original publicly served template artwork downloaded from `/images/scenes/` and `/images/ingredients-key.jpg` on 2026-11-10.
The local React implementation follows the published template's wheel geometry,
scroll smoothstep, 150ms exponential wheel damping, 1.2s pour mask, and 7s ingredient float.
Espressoulster branding and the real application's menu action replace template branding and mock checkout.
Showcase flavour artwork is decorative inspiration, not inventory or a promise of availability; the menu remains authoritative.

2026-11-13 update: Home now renders the exact live menu photo URLs, with local SVG silhouette masks for the six existing menu photos. Floating cards use those same photos. The template's scene JPGs and chroma-key ingredient sheet are no longer rendered. A crossfade keeps the menu photos visible during scrolling; the wheel motion is retained.
