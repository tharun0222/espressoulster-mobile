# Menu descriptions and ingredients

110 outlet items now have customer-facing descriptions and ingredient lists derived from the supplied recipe workbook. Customer item sheets show the complete list; menu cards show a short description.

Recipe evidence, raw labels and worksheet ranges are in recipe-evidence.json. Obvious spelling errors are cleaned for display; repeated ingredients are consolidated. Specified edible garnishes are included. Unspecified garnishes and ingredient quantities are omitted. Composite ingredients such as sauces and mixes retain their recipe names; no unsupported allergen-free claims are made.

The database migration changes only description and ingredients JSON fields. Prices, dietary labels, images, stock and order records are preserved.

Validation: import coverage 110/110. Build, backend checks and mobile browser results recorded after verification below.

Production build passed. Backend regression checks: 59/59 passed, including all 110 descriptions and ingredient lists plus recipe spot checks for Mocha and Smoke Chicken.

Browser preview passed at 390 × 844: Mocha description and all five ingredient chips visible; item controls remain usable. Smoke Chicken search/card and detail sheet show the recipe-based description and all 12 named ingredients. No orders were created during this UI check. Evidence: mobile.png.
