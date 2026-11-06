# Complete menu recipe estimates

116 current customer-visible items have ingredient measurements and six estimated nutrients per modelled serving. This is a recipe modelling feature, not laboratory analysis or a verified café nutrition declaration.

## Provenance

- 110 recipe tables: supplied `FInal Espressoulster-Beverage-Recipes.xlsx`; original table text and source rows retained in `lib/recipe-measurements.json`.
- Two medium-roast variants reuse their corresponding recorded base recipe, with that assumption stated.
- Four legacy entries without café recipes (The Avocado Social, Chicken Nuggets, Orange Juice, Red Velvet Cookie) use proposed standard recipes. Every portion is marked assumed.
- USDA FoodData Central SR Legacy April 2018 CSV: https://fdc.nal.usda.gov/download-datasets/. Individual food IDs, nutrient values and links are retained in `complete-ingredient-references.json`. The downloaded archive hash is in `complete-estimate-coverage.json`.
- Paneer: manufacturer's Amul Fresh Paneer label published by Sabar Dairy, https://sabardairy.org/product/amul-fresh-paneer/. This is an explicit brand proxy, not a claim about the café supplier. Fibre is assumed zero for plain milk paneer because the label does not report it.
- Matcha: MEXT Standard Tables of Food Composition in Japan, 2023 supplement, item 16035: https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=16_16035_7. Total sugar uses the reported 1.5 g mono/disaccharide sum; trace fructose excluded.
- Chia: USDA values plus rounded sugar value from the BareOrganics manufacturer label in NIH DSLD, https://api.ods.od.nih.gov/dsld/s3/pdf/79829.pdf. A rounded 0 g/serving is not an analytical zero.

## Calculations and assumptions

Each component contributes edible grams × nutrient/100. Totals include listed sides and garnishes. Ranges use midpoints. Millilitres use declared density assumptions. Piece, leaf and slice weights are explicit model assumptions, not verified café portions. Coffee grounds and spent tea leaves are excluded; brewed beverage nutrients are counted. Manual coffee extraction uses an assumed 90% liquid yield, not the nutrient content of dry beans. All listed cooking oil is counted; prepared fries and croquettes use models including their own retained oil. Actual oil absorption, cooking yield and product brands can materially change results.

Commercial syrups, crushes, frappe and chai mixes, marinades and seasonings without supplier labels use explicitly named proposed blends or generic proxies. Those are visible under Calculation & assumptions. A syrup model is not represented as the actual supplier's nutrition label. Crouton and mint sugar values missing from SR use documented breadcrumb/parsley proxies; plain prawn sugar/fibre and filtered balsamic fibre are explicit zero assumptions, not silently treated as measured zeroes.

Conflicting source recipes retain their warning and use the ingredient table for the estimate. Missing quantities use individually marked proposed portions. Pesto, Mac and Cheese and Creamy Alfredo have an assumed 150 g cooked pasta portion added because the source tables omit pasta. Crispy Corn Salad receives proposed quantities for all blank rows and retained cooking oil. A malformed salt source value remains preserved while calculation uses an explicit 2 g correction.

No price, availability, stock, payment, customer or subscription records are modified. Unknown future items receive no arbitrary estimated recipe.

## Regenerate and verify

Run `python3 scripts/complete-menu-estimates.py --usda-zip /absolute/path/to/FoodData_Central_sr_legacy_food_csv_2018-04.zip` from the repository. The script reads the archive with the Python standard library and writes model data plus audit evidence; it does not edit the workbook or apply database migrations.

Run `node --experimental-transform-types --test tests/complete-menu-estimates.test.mjs tests/recipe-measurements.test.mjs` and the TypeScript check. Tests verify coverage, full component arithmetic, source quantity preservation, missing pasta portions, discarded grounds and narrow legacy name matching.
