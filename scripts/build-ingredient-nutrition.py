"""Build the runtime calculator index from the menu's existing nutrition evidence."""
import ast, json, re
from pathlib import Path
root = Path(__file__).resolve().parents[1]
refs = json.loads((root/'docs/testing/nutrition/complete-ingredient-references.json').read_text())
calculations = json.loads((root/'docs/testing/nutrition/complete-estimate-calculations.json').read_text())
source = ast.parse((root/'scripts/complete-menu-estimates.py').read_text())
weights = {}
for node in ast.walk(source):
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ('pieces','slices','leaves'):
        weights[node.targets[0].id] = ast.literal_eval(node.value)
index = {}
for recipe in calculations.values():
    for component in recipe['components']:
        name = component['ingredient']
        key = re.sub(r'\s+', ' ', name.strip().lower())
        ref = refs[component['reference']]
        density = re.search(r'Assumed density ([\d.]+) g/ml', component['assumption'])
        entry = index.setdefault(key, {'name':name,'reference':component['reference'],'food':ref['name'],'per100g':ref['values'],'url':ref['url'],'proxy':component['proxy'],'density':1})
        if density:
            entry['density'] = float(density[1])
        for field, table in [('pieceGrams','pieces'),('sliceGrams','slices'),('leafGrams','leaves')]:
            if name.upper() in weights[table]:
                entry[field] = weights[table][name.upper()]
# Explicit spelling aliases only: no fuzzy matches for different ingredients or brands.
aliases = {'vanilla essence':'venilla essence','broccoli':'brocolli','mozzarella cheese':'mozzerella cheese','jalapeno':'jalepeno','sesame seeds':'seasme seeds','chilli pepper flakes':'chilli flakes','brewed coffee':'brewed coffee yield'}
for alias, original in aliases.items():
    if original in index:
        index[alias] = {**index[original], 'name':alias.title()}
(root/'lib/ingredient-nutrition.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
print(f'Built {len(index)} ingredient names from existing source evidence')
