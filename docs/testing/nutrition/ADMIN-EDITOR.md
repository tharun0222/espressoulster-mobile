# Admin ingredient and nutrition editing

Open Admin → Products → Edit an item → Ingredients & nutrition. Enable Use custom recipe details to edit the prefilled recipe. Each ingredient has a name, quantity/unit, optional note, and an Assumed portion label. Ingredients can be added or removed. Serving description and recipe/calculation notes are editable.

Enter per-serving fat, fibre, total sugar, protein and carbohydrate values in grams, plus energy in kcal. Unknown values remain blank; numeric zero remains zero. Choose Estimated from recipe or Café supplied values. Editing ingredient quantities, serving size or nutrient values clears the nutrition review checkbox. Save can publish ingredients while nutrition remains unavailable until reviewed. This editor does not automatically recalculate nutrition from ingredient quantities.

Select I have reviewed nutrition for this recipe and serving before publishing the numeric nutrition panel, then Save product. The customer catalog uses the persisted per-item override ahead of the original generated recipe. Overrides also work on newly created menu items. Restore suggested recipe and Save product removes the override and returns to the original recipe. Products without an original recipe return to unavailable measurements when their override is removed.

Persistence uses the existing product JSON field; no migration, menu replacement or customer-data changes are needed. Backend validation applies to normal saves, suggestions and imports, rejects malformed or negative/nonfinite values, bounds array/text/numeric sizes, and strips derived recipe payloads from ordinary product saves. Saving unrelated product changes without a recipeOverride field preserves an existing custom recipe. An explicit null restores the suggestion.

Automated verification covers validation, zero/blank distinction, JSON persistence, override priority, original recipe restoration and the built Worker API. The integration script runs against an isolated loopback Worker database on port 8797. It must never target the hosted store. Results are written to admin-recipe-integration.json when all checks pass.
