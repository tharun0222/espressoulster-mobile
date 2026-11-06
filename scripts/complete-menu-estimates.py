import csv,json,re,copy,hashlib,argparse,zipfile,io
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Generate disclosed recipe estimates using the official SR Legacy CSV archive.')
parser.add_argument('--usda-zip',type=Path,required=True)
args=parser.parse_args()
keys=['fat','fibre','sugar','protein','carbs','kcal']
with zipfile.ZipFile(args.usda_zip) as archive:
 def records(suffix):
  name=next(n for n in archive.namelist() if n.split('/')[-1]==suffix)
  return csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig')))
 foods={r['fdc_id']:r['description'] for r in records('food.csv')}
 nuts={}; nutrient_keys={'1004':'fat','1079':'fibre','2000':'sugar','1003':'protein','1005':'carbs','1008':'kcal'}
 for r in records('food_nutrient.csv'):
  if r['nutrient_id'] in nutrient_keys:nuts.setdefault(r['fdc_id'],{})[nutrient_keys[r['nutrient_id']]]=float(r['amount'])
refs={}; mapping={}
def food(id):
 id=str(id); values=nuts[id]
 overrides={'172241':{'fibre':0},'172751':{'sugar':6.2},'173475':{'sugar':0.85},'175179':{'fibre':0,'sugar':0}}
 if id in overrides:values={**values,**overrides[id]}
 if not set(keys)<=values.keys():raise ValueError((id,foods[id],set(keys)-values.keys()))
 refs[id]={'name':foods[id],'values':{k:values[k] for k in keys},'url':f'https://fdc.nal.usda.gov/food-details/{id}/nutrients'}
 return refs[id]
def add(names,id,density=1,proxy=''):
 ref=food(id)
 for name in names.split('|'):mapping[name]={'ref':str(id),'density':density,'proxy':proxy}
def blend(key,label,parts):
 values={k:sum(food(id)['values'][k]*weight/100 for id,weight in parts) for k in keys}
 refs[key]={'name':label,'values':values,'parts':parts,'url':'https://fdc.nal.usda.gov/download-datasets/'}
 return key
add('ESPRESSO',171891);add('MILK|MILK FOAM',171265,1.03);add('COLD BREW',171890)
add('WATER|HOT WATER|ICE CUBE|ICE CUBES|SODA',174158)
add('HONEY',169640,1.42);add('SUGAR',169655);add('LEMON JUICE',167747,1.03);add('ORANGE JUICE',169098,1.04)
add('CONDENSED MILK|CONDENCED MILK',171275,1.3);add('TONIC WATER',171869,1.04);add('SPRITE|SPRIT',173205,1.04)
add('FRESH CREAM',170859);add('COCOA POWDER',169593)
add('BUTTER|BUTTER SALTED|SALTED BUTTER|SALTED BTTER|BUTTER CHIPLET',173410)
add('EGG',171287);add('SOUR DOUGH BREAD|SOURDOUGH BREAD|BAGUETTE BREAD',172675)
add('JUMBO BREAD',174924);add('OATS',173904);add('PUMPKIN SEEDS',169415);add('SUNFLOWER SEEDS',170562)
add('BANANA',173944);add('FRESH BLUEBERRY',171711);add('PEANUT BUTTER',172470)
add('ONION',170000);add('GARLIC',169230);add('BELLPEPPER|BELL PEPPER|BELLBEPPER|BELLPEPER',170108);add('BROCOLLI',170379)
add('TOMATO|CHERRY TOMATO|CHERRY TOMATOES',170457);add('PARMESAN|PARMESAN CHEESE',170848);add('CREAM CHEESE',173418)
add('MOZZERELLA CHEESE|MOZZERELA CHEESE',170845);add('MAYO|PLAIN MAYO',171009);add('MUSHROOM',169251)
add('ENGLISH CUCUMBER|CUCUMBER',168409);add('SPINACH',168462);add('ICEBERG|LETTUCE|ICEBERG LETTUCE|GREEN LETTUCE|LETTUCE GREEN|ICEBERG+GREEN LETTUCE',169248)
add('AVOCADO',171705);add('OLIVE OIL|BASIL OIL|CHILLI OIL',171413,.91,'Infused oils use plain olive oil as the nutrient proxy.')
add('OIL',172336,.92);add('PEPPER|BLACK PEPPR',170931);add('OREGANO|DRIED OREGANO|OREGANO DRIED',171328);add('SALT',173468)
add('CHOCOLATE POWDER',173182,proxy='Sweetened chocolate beverage powder proxy; café powder brand is unspecified.')
add('CHOCOLATE SAUCE|CHOCOLATE SYRUP',174117,1.3,'Generic chocolate syrup proxy.')
add('ICE CREAM',167575,proxy='Generic vanilla ice cream proxy.')
add('COOKIES',172718,proxy='Generic chocolate sandwich cookie proxy.')
add('CHOCO CHIP',169581,proxy='Semisweet chocolate baking pieces proxy.')
add('BLUEBERRY YOGHURT',170889,1.03,'Generic fruit yoghurt proxy.')
add('MUESLI',171646,proxy='Generic granola proxy for unspecified muesli; composition can differ substantially.')
add('WHEY PROTEIN',173180,proxy='Generic whey protein powder proxy; check the café brand.')
add('MINT|MINT LEAVES',173475,proxy='Mint sugar unreported in SR; estimate uses fresh parsley sugar 0.85 g/100g as an explicit herb proxy.');add('LEMON',167746)
add('BAGEL BREAD',174899);add('ROCKET LEAVES',169387)
add('CHICKEN|MARINATED CHICKEN|SMOKE MARINATED CHICKEN',171477,proxy='Cooked chicken breast proxy; marinade not specified in the workbook.')
add('SMOKED CHICKEN HAM|CHICKEN HAM',168092,proxy='Lean turkey deli ham proxy for unspecified chicken ham.')
add('CHEESE SLICE',171290);add('FRENCH FRIES|FRENCH FRIES FROZEN|POTATO WEDGES',169264,proxy='Prepared oven-heated fries proxy; actual frying oil changes totals.')
add('KETCHUP',168556);add('PANINI 5"/WRAP|PANINI 5"',174913,proxy='Estimate selects a bread panini, not a tortilla wrap.')
add('HUMMUS',172454);add('JALEPENO',170080);add('OLIVES|BLACK OLIVES|BLACK SLICED OLIVES',169094)
add('ZUCCIHINI',169291);add('SPANISH PEPRIKA|SWEET PEPRIKA',171329);add('GREEN CHILLI',170106)
add('CHILLI FLAKES|CAYENNE PEPPER POWDER|CAYYENE PEPPER',171319,proxy='Generic ground chilli spice proxy.')
add('GARLIC POWDER',171325);add('ONION POWDER',171327);add('BQRBEQUE SAUCE',174523)
add('BABY CORN|SWEET CORN|CORN',169998,proxy='Generic sweet corn kernels proxy for baby corn where applicable.')
add('CARROT',170393);add('CORN FLOUR|CORNFLOUR',169698);add('FRENCH BEANS',169961);add('GREEN PEAS',168405)
add('MAIDA',168936);add('SEASME SEEDS|TOASTED SEASME SEED',169412)
add('SALAD DRESSING BASE|SALAD DRESSING|MEXICAN DRESSING',171019,1.0,'Generic Italian dressing proxy; actual café dressing is unspecified.')
add('CEASER DRESSING',169055);add('CRUTONS',172751,proxy='Crouton sugar unreported in SR; plain breadcrumbs sugar 6.2 g/100g used as proxy.')
add('CHIKPEA|CHICKPEA',173757);add('RAJMA BEANS',175194);add('CUMIN POWDER',170923);add('DIJON MUSTARD',172234,proxy='Prepared mustard proxy.')
add('PARSLEY|MICRO GREENS',170416,proxy='Fresh parsley proxy for unspecified microgreens.')
add('QUINOA',168917,proxy='Cooked quinoa assumed, rather than dry weight.')
add('HASH BROWN',167604);add('SUNDRIED TOMATO',168567);add('BALSAMIC VINEGAR',172241,1.05,'Fibre assumed zero for filtered balsamic vinegar; not reported in SR.');add('BASIL|BASIL LEAVES',172232)
add('NACHOS',167558);add('SALSA',171824);add('SOUR CREAM|SAOUR CREAM',173440)
add('BAKED BEANS',175182);add('CHICKEN SAUSAGE',173880,proxy='Cooked chicken/turkey sausage proxy.')
add('POTATO',170026);add('LEEK|LEEKS',169246);add('CELERY',169988);add('TURMERIC',172231)
add('BASA FISH LEMON MARIRANTE',175165,proxy='Raw farmed catfish proxy for basa, before unspecified marinade.')
add('PRAWNS',175179,proxy='Sugar and fibre assumed zero for plain raw prawns; not reported in SR.');add('BRIOCHE BREAD',172673,proxy='Generic egg bread proxy for brioche.')
add('CINNAMON POWDER',171320);add('MAPLE SYRUP',169661,1.33);add('VENILLA ESSENCE',173471,1.0,'Vanilla extract proxy for essence.')
add('BAKING POWDER',172803);add('BAKING SODA',175040);add('SPEGHETTI|PENNE PASTA|COOKED PASTA',169737,proxy='Cooked, drained pasta weight assumed.')
add('PESTO PASTE',171579);add('WHITE SAUCE',174525);add('MUSHROOM FOR GARNISH',169251)
add('SITAKE PASTE',169251,proxy='Plain mushroom proxy; unspecified paste can contain extra cream or oil.')
add('WHITE WINE',174837,1.0);add('CHEDDAR CHEESE POWDER',173414,proxy='Cheddar cheese proxy for unspecified cheese powder.')
# Manufacturer/government references supplement the legacy dataset.
refs['paneer']={'name':'Amul Fresh Paneer label, used as a paneer brand proxy','values':dict(fat=24,fibre=0,sugar=4,protein=20,carbs=4,kcal=312),'url':'https://sabardairy.org/product/amul-fresh-paneer/','note':'Fibre assumed zero for plain milk paneer; not listed on manufacturer label.'}
mapping['PANEER']={'ref':'paneer','density':1,'proxy':'Manufacturer paneer label proxy; café brand may differ. Fibre assumed zero for plain milk paneer.'}
refs['matcha']={'name':'MEXT 2023, matcha tea, food 16035','values':dict(fat=5.3,fibre=38.5,sugar=1.5,protein=29.6,carbs=39.5,kcal=237),'url':'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=16_16035_7','note':'Sugar sums measured mono/disaccharides (trace fructose excluded).'}
mapping['MATCHA POWDER']={'ref':'matcha','density':1,'proxy':''}
# Chia uses USDA for measured nutrients; missing legacy sugar supplied from a rounded manufacturer label.
refs['chia']=copy.deepcopy({'name':foods['170554'],'values':{**nuts['170554'],'sugar':0},'url':'https://fdc.nal.usda.gov/food-details/170554/nutrients','note':'Sugar assumed 0 from BareOrganics label, rounded per serving, NIH DSLD label 79829; not an analytical zero.'})
mapping['CHIA SEEDS']={'ref':'chia','density':1,'proxy':'Chia sugar uses a rounded manufacturer label (0 g/serving), not an analytical zero.'}
# Composite estimates make unspecified commercial recipes explicit instead of attributing invented labels to brands.
blends=[
 ('syrup','Standard sugar syrup model: 65% sugar, 35% water',[(169655,65),(174158,35)]),
 ('frappe','Standard frappe premix model: 50% sugar, 50% skimmed milk powder',[(169655,50),(170877,50)]),
 ('chai','Standard sweet chai powder model: 70% sugar, 25% skimmed milk powder, 5% cinnamon',[(169655,70),(170877,25),(171320,5)]),
 ('season','Standard seasoning model: 50% paprika, 25% oregano, 25% salt',[(171329,50),(171328,25),(173468,25)]),
 ('mayo','Standard flavoured mayo model: 95% mayonnaise, 5% paprika',[(171009,95),(171329,5)]),
 ('marinade','Standard marinade model: 80% yoghurt, 10% olive oil, 10% paprika',[(171284,80),(171413,10),(171329,10)]),
 ('herb-butter','Standard herb butter model: 98% butter, 2% parsley',[(173410,98),(170416,2)]),
 ('caramel-onion','Standard caramelised onion model: 85% onion, 10% olive oil, 5% sugar',[(170000,85),(171413,10),(169655,5)]),
 ('salt-pepper','Standard seasoning model: 50% salt, 50% black pepper',[(173468,50),(170931,50)]),
 ('beet-hummus','Standard beet hummus proxy: 80% hummus, 20% cooked beetroot',[(172454,80),(169146,20)]),
 ('leek-celery','Equal parts raw leek and celery',[(169246,50),(169988,50)]),
 ('garlic-bread','Standard garlic bread model: 85% bread, 13% butter, 2% garlic',[(172675,85),(173410,13),(169230,2)]),
 ('croquette','Proposed croquette model: 60% potato, 15% peas, 15% breadcrumbs, 10% retained oil',[(170026,60),(168405,15),(174928,15),(172336,10)])]
for id,label,parts in blends:blend(id,label,parts)
for names,key,density in [
 ('MANGO SYRUP|STRAWBERRY SYRUP|VANILLA SYRUP|SUGAR SYRUP|HAZELNUT SYRUP|CARAMEL SYRUP|PEACH SYRUP|PASSION SYRUP|MOJITO MINT SYRUP|WATERMELON SYRUP|GREEN APPLE SYRUP|BLUE CURACAO|BLUEBERRY CURSH|GREEN APPLE CRUSH|KIWI CRUSH|PINEAPPLE CRUSH','syrup',1.3),
 ('FRAPPE MIX','frappe',1),('MASALA CHAI','chai',1),('OREGANO SEASONING|CAJUN SPICE|CAJUN SEASONING|PERI PERI SEASONING|PERI PERI','season',1),
 ('PERI PERI MAYO|PRI-PRI MAYO|DIP','mayo',1),('MEXICAN MARINATION|SMOKE MARINATION','marinade',1),('HERB BUTTER|HERBY BUTTER','herb-butter',1),
 ('CAREMELIZED ONION|CAREMELIZED','caramel-onion',1),('SALT PEPPER|SALT + PEPPER','salt-pepper',1),('BEET FETA HUMMUS','beet-hummus',1),('LEEK+CELERY','leek-celery',1),('GARLIC BREAD','garlic-bread',1),('VEG CORQUETTES','croquette',1)]:
 for name in names.split('|'):mapping[name]={'ref':key,'density':density,'proxy':refs[key]['name']+'. Assumed composition; not the café supplier label.'}
add('WHIPPED CREAM',170860)
# Explicit piece weights, edible portion (g); these are modelling assumptions, not café standards.
pieces={'EGG':50,'BAGEL BREAD':95,'CHERRY TOMATOES':17,'CHERRY TOMATO':17,'SMOKED CHICKEN HAM':20,'CHICKEN HAM':20,'CHEESE SLICE':20,'PANINI 5"/WRAP':100,'PANINI 5"':100,'AVOCADO':150,'LEMON':58,'LEMON JUICE':30,'MINT':.2,'MINT LEAVES':.2,'COOKIES':11,'GREEN CHILLI':5,'CRUTONS':2,'BUTTER CHIPLET':10,'HASH BROWN':55,'CHICKEN SAUSAGE':50,'TOMATO':123,'PRAWNS':15,'GARLIC BREAD':35,'VEG CORQUETTES':35,'MUSHROOM FOR GARNISH':20}
slices={'SOUR DOUGH BREAD':40,'SOURDOUGH BREAD':40,'JUMBO BREAD':40,'BAGUETTE BREAD':20,'BRIOCHE BREAD':40,'OLIVES':.5,'BLACK OLIVES':.5,'BLACK SLICED OLIVES':.5}
leaves={'BASIL':.5,'BASIL LEAVES':.5,'MINT':.2,'MINT LEAVES':.2}
recipes=json.load(open(root/'lib/recipe-measurements.json')); products=json.load(open(root/'lib/outlet-menu.json'))['products']; names={p['id']:p['name'] for p in products}
# Proposed full recipe additions for blank source rows.
missing_quantities={'recipe-crispy-corn-salad':{'SALAD DRESSING BASE':30,'SWEET CORN':100,'MAIDA':10,'CORN FLOUR':10,'SALT':1,'PEPPER':1,'BABY CORN':30,'FRENCH BEANS':25,'CARROT':25,'BELLPEPPER':30,'GREEN PEAS':20,'ENGLISH CUCUMBER':30,'SEASME SEEDS':3},'recipe-weekend-dominator':{'PANEER':80}}
extras={
 'recipe-pesto':[('Cooked Pasta','150 g')], 'recipe-mac-and-cheese':[('Cooked Pasta','150 g')], 'recipe-creamy-alfredo':[('Cooked Pasta','150 g')],
 'recipe-crispy-corn-salad':[('Oil','8 g')], 'source-28':[('Oil','8 g')],
 'recipe-iced-coffee-lemonade':[('Lemon','10 g')]
}
# A few current menu entries predate the supplied recipe workbook.
legacy={
 'legacy-orange-juice':('Orange Juice',[('Orange Juice','250 ml')]),
 'legacy-avocado-social':('The Avocado Social',[('Sour Dough Bread','80 g'),('Avocado','100 g'),('Cream Cheese','20 g'),('Tomato','30 g'),('Olive Oil','5 g'),('Lemon Juice','10 ml'),('Salt','1 g'),('Pepper','0.5 g')]),
 'legacy-chicken-nuggets':('Chicken Nuggets',[('Chicken','120 g'),('Maida','15 g'),('Egg','15 g'),('Bread Crumbs','25 g'),('Oil','10 g'),('Salt','1 g'),('Pepper','0.5 g'),('Ketchup','30 g')]),
 'legacy-red-velvet-cookie':('Red Velvet Cookie',[('Maida','22 g'),('Butter','12 g'),('Sugar','15 g'),('Egg','5 g'),('Cocoa Powder','2 g'),('Cream Cheese','8 g'),('Venilla Essence','0.5 ml'),('Baking Powder','0.3 g'),('Food Colour','0.1 g')])}
add('BREAD CRUMBS',174928);add('FOOD COLOUR',174158,proxy='Assumed water-based colouring, 0.1 g; negligible nutrients.')
for id,(name,items) in legacy.items():
 names[id]=name;recipes[id]={'ingredients':[{'name':n,'measurement':q,'detail':'','assumed':True} for n,q in items],'source':'Proposed standard recipe','review':'No café recipe was supplied for this item. All listed portions are proposed estimates, not verified café measurements.','serving':'One proposed serving','standardRecipe':True}
output={};audit={}; failures=[]
def num(s):
 s=s.strip()
 if '/' in s:
  a,b=s.split('/');return float(a)/float(b)
 return float(s)
def quantity(text,name):
 text=text.upper().strip().replace('GMS S','GMS');notes=[]
 if 'EE618' in text:return 2,'Corrected malformed source "2GM+EE618:E619" to 2 g salt for the estimate.'
 if text in ['PINCH','DASH']:
  return (.3 if text=='PINCH' else 1),f'Assumed {text.lower()} = {0.3 if text=="PINCH" else 1} g.'
 m=re.match(r'^(\d+(?:\.\d+)?(?:\s*[/\-]\s*\d+(?:\.\d+)?)?)\s*(.*)$',text)
 if not m:raise ValueError((name,text))
 raw,unit=m.groups();raw=raw.replace(' ','')
 if ('/' in raw and not unit.startswith(('PC','NO','TSP','TPS'))) or '-' in raw:
  lo,hi=re.split('[/\-]',raw);q=(float(lo)+float(hi))/2;notes.append(f'Range {raw} uses midpoint {q:g}.')
 else:q=num(raw)
 if unit in ['GM','GMS','G','GRAM','GRAMS']:return q,' '.join(notes)
 if unit=='ML':
  density=mapping[name]['density'];return q*density,' '.join(notes+([f'Assumed density {density:g} g/ml.'] if density!=1 else []))
 if unit.startswith(('TSP','TPS')):return q*.7,'Assumed dried-herb garnish 0.7 g per teaspoon.'
 if unit.startswith('SLICE'):
  w=slices[name];return q*w,f'Assumed edible weight {w:g} g per slice.'
 if unit.startswith('LEAVE'):
  w=leaves[name];return q*w,f'Assumed {w:g} g per leaf.'
 if unit.startswith(('PC','PCS','NO','BIG PC')):
  w=pieces[name];return q*w,f'Assumed edible weight {w:g} g per piece.'
 if unit=='':
  if name=='LEMON':return q*58,'Assumed whole lemon edible flesh 58 g; source omits unit.'
 raise ValueError((name,text,unit))

def make_component(name,grams,note='',source=None):
 key=name.upper();m=mapping[key];ref=refs[m['ref']]
 return {'ingredient':name,'grams':round(grams,3),'reference':m['ref'],'food':ref['name'],'url':ref['url'],'values':{k:round(ref['values'][k]*grams/100,5) for k in keys},'assumption':note,'proxy':m['proxy'],'sourceRow':source}
for id,recipe in recipes.items():
 result=copy.deepcopy(recipe);result['name']=names[id];result['estimateVersion']='2026-10-22';parts=[];rows=[];assumptions=[]
 for item in recipe['ingredients']:
  item=copy.deepcopy(item);name=item['name'].upper();text=item['measurement'];row=item.get('sourceRow')
  if name in ['COFFEE GROUND','COFFEE GROUNDS','COFFEE BEANS']:
   item['calculationNote']='Grounds are discarded; nutrition counts the brewed drink, not dry beans.';rows.append(item);continue
  if name=='TEA POWDER':
   item['calculationNote']='Tea leaves are strained out. Nutrition counts the brewed water portion as plain black tea.';rows.append(item);continue
  if name=='GARNISH':
   detail=(item.get('detail') or text).upper(); garnish=[]
   if 'WHIPPED' in detail:garnish=[('Whipped Cream',15),('Chocolate Syrup',5)]
   elif 'CINNAMON' in detail:garnish=[('Cinnamon Powder',.3)]
   elif 'CHIA' in detail:garnish=[('Chia Seeds',2),('Fresh Blueberry',10)]
   elif 'STRAWBERRY' in detail:garnish=[('Strawberry Syrup',5)]
   elif any(s in detail for s in ['LEMON','ORANGE','MINT']):
    if 'LEMON' in detail:garnish.append(('Lemon',10))
    if 'ORANGE' in detail:garnish.append(('Orange Juice',10))
    if 'MINT' in detail:garnish.append(('Mint',1))
   else:garnish=[('Parsley',.175 if '1/4' in text else .25)]
   note='Assumed garnish: '+', '.join(f'{n} {g:g} g' for n,g in garnish)+'.'
   item['assumedMeasurement']=' + '.join(f'{n} {g:g} g' for n,g in garnish);item['assumed']=True;item['calculationNote']=note;rows.append(item);assumptions.append(note)
   for n,g in garnish:parts.append(make_component(n,g,note,row))
   continue
  try:
   if 'not specified' in text.lower():
    grams=missing_quantities[id][name];note=f'Assumed {grams:g} g because the source quantity is missing.';item['assumedMeasurement']=f'{grams:g} g';item['assumed']=True
   else:grams,note=quantity(text,name)
   if item.get('assumed'):note='Proposed standard recipe portion. '+note
   item['estimatedGrams']=round(grams,3);item['calculationNote']=note
   parts.append(make_component(item['name'],grams,note,row));rows.append(item)
   if note:assumptions.append(item['name']+': '+note)
  except Exception as e:failures.append((id,name,text,str(e)))
 # Tea/coffee yields represent consumed liquid, never dry leaves/grounds.
 if any(i['name'].upper()=='TEA POWDER' for i in recipe['ingredients']):
  for part in parts:
   if part['ingredient'].upper()=='WATER':
    tea=food(173227);g=part['grams'];part.update(reference='173227',food=tea['name'],url=tea['url'],values={k:tea['values'][k]*g/100 for k in keys},assumption='Assumed brewed black tea yield equals listed water; spent leaves excluded.')
 if id in ['recipe-pour-over','recipe-aero-press','recipe-french-press','recipe-syphon','recipe-moka-pot','recipe-chemex']:
  water=next(p for p in parts if p['ingredient'].upper()=='WATER');g=water['grams']*.9;coffee=food(171890)
  water.update(ingredient='Brewed coffee yield',grams=round(g,3),reference='171890',food=coffee['name'],url=coffee['url'],values={k:coffee['values'][k]*g/100 for k in keys},assumption='Assumed brewed yield 90% of water input; generic brewed coffee composition, not dry beans.')
  assumptions.append(water['assumption'])
 for n,q in extras.get(id,[]):
  g,note=quantity(q,n.upper());note='Added standard estimate: '+q+' '+n+'. Café quantity was not supplied.'
  rows.append({'name':n,'measurement':q,'assumed':True,'estimatedGrams':round(g,3),'calculationNote':note});parts.append(make_component(n,g,note));assumptions.append(note)
 total={k:sum(p['values'][k] for p in parts) for k in keys};unique_proxies=sorted(set(p['proxy'] for p in parts if p['proxy']))
 result['ingredients']=rows;result['nutrition']={'status':'estimated','basis':'Per modelled serving, before customisations','grams':{k:round(total[k],1) for k in keys if k!='kcal'},'kcal':round(total['kcal']),'servingGrams':round(sum(p['grams'] for p in parts)),'hasAssumptions':bool(assumptions or unique_proxies or recipe.get('needsConfirmation'))}
 result['assumptions']=list(dict.fromkeys(assumptions));result['substitutions']=unique_proxies
 result['references']=list({p['reference']:{'name':p['food'],'url':p['url']} for p in parts}.values())
 if recipe.get('needsConfirmation'):result['assumptions'].insert(0,'Where preparation instructions conflict, this estimate follows the ingredient table. The café must confirm the final recipe.')
 result.pop('missing',None);output[id]=result;audit[id]={'name':names[id],'components':parts,'totals':total}
if failures:
 print(json.dumps(failures,indent=2));raise SystemExit(1)
# Additional visible roast variants share their corresponding documented base recipe.
for id,name,parent in [('legacy-hazelnut-medium','Hazelnut Cold Coffee (Medium Roast)','source-02'),('legacy-latte-medium','Latte (Medium Roast)','source-03')]:
 output[id]=copy.deepcopy(output[parent]);output[id]['name']=name;output[id]['assumptions'].append('Uses the base recipe for the medium-roast variant; roast-specific nutrient differences are not modelled.');audit[id]=copy.deepcopy(audit[parent]);audit[id]['name']=name
(root/'lib/recipe-estimates.json').write_text(json.dumps(output,indent=2,ensure_ascii=False)+'\n')
(root/'docs/testing/nutrition/complete-estimate-calculations.json').write_text(json.dumps(audit,indent=2)+'\n')
(root/'docs/testing/nutrition/complete-ingredient-references.json').write_text(json.dumps(refs,indent=2)+'\n')
report={'items':len(output),'allHaveMeasurements':all(r['ingredients'] for r in output.values()),'allHaveSixNutrients':all(all(k in r['nutrition']['grams'] for k in keys if k!='kcal') and 'kcal' in r['nutrition'] for r in output.values()),'sourceRecipeItems':110,'legacyProposedRecipes':4,'roastVariants':2,'nutritionBasis':'Estimates with explicitly disclosed assumptions; not verified café recipes or laboratory labels.','usdaDatasetSha256':hashlib.sha256(args.usda_zip.read_bytes()).hexdigest()}
(root/'docs/testing/nutrition/complete-estimate-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report));print('largest servings',sorted([(r['nutrition']['kcal'],r['name']) for r in output.values()],reverse=True)[:5])
