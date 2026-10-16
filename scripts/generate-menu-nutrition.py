import csv,json,glob,re,openpyxl,pathlib
root=pathlib.Path(__file__).resolve().parents[1];base=glob.glob('/tmp/usda-sr/*')[0]
foods={r['fdc_id']:r['description'] for r in csv.DictReader(open(base+'/food.csv'))};nut={}
keys={'1004':'fat','1079':'fibre','2000':'sugar','1003':'protein'}
for r in csv.DictReader(open(base+'/food_nutrient.csv')):
 if r['nutrient_id'] in keys:nut.setdefault(r['fdc_id'],{})[keys[r['nutrient_id']]]=float(r['amount'])
mapping={}
def add(names,id,density=1):
 for name in names.split('|'):mapping[name]=(str(id),density)
add('ESPRESSO',171891);add('MILK|MILK FOAM',171265,1.03);add('COLD BREW',171890)
add('WATER|HOT WATER|ICE CUBE|ICE CUBES|SODA',174158)
add('HONEY',169640,1.42);add('SUGAR',169655);add('LEMON JUICE',167747,1.03);add('ORANGE JUICE',169098,1.04)
add('CONDENSED MILK|CONDENCED MILK',171275,1.3);add('TONIC WATER',171869,1.04);add('SPRITE|SPRIT',173205,1.04)
add('FRESH CREAM',170859,1.0);add('COCOA POWDER',169593)
add('BUTTER|BUTTER SALTED|SALTED BUTTER|SALTED BTTER|BUTTER CHIPLET',173410)
add('EGG',171287);add('SOUR DOUGH BREAD|SOURDOUGH BREAD|BAGUETTE BREAD',172675)
add('JUMBO BREAD',174924);add('OATS',169705);add('CHIA SEEDS',170554);add('PUMPKIN SEEDS',169415);add('SUNFLOWER SEEDS',168594)
add('BANANA',173944);add('FRESH BLUEBERRY',171711);add('PEANUT BUTTER',172470)
add('ONION',170000);add('GARLIC',169230);add('BELLPEPPER|BELL PEPPER|BELLBEPPER|BELLPEPER',170108);add('BROCOLLI',170379)
add('TOMATO|CHERRY TOMATO|CHERRY TOMATOES',170457);add('PARMESAN|PARMESAN CHEESE',170848);add('CREAM CHEESE',173418)
add('MOZZERELLA CHEESE|MOZZERELA CHEESE',170845);add('MAYO|PLAIN MAYO',171009);add('MUSHROOM',169251)
add('ENGLISH CUCUMBER|CUCUMBER',168409);add('SPINACH',168462);add('ICEBERG|LETTUCE|ICEBERG LETTUCE|GREEN LETTUCE|LETTUCE GREEN|ICEBERG+GREEN LETTUCE',169248)
add('AVOCADO',171705);add('OLIVE OIL|BASIL OIL|CHILLI OIL',171413,.91);add('OIL',172336,.92)
add('PEPPER|BLACK PEPPR',170931);add('OREGANO|DRIED OREGANO|OREGANO DRIED',171328);add('SALT',173468)
s=openpyxl.load_workbook('/home/headrun/Downloads/FInal Espressoulster-Beverage-Recipes.xlsx',data_only=True)['Ingredients']
p=root/'lib/outlet-menu.json';data=json.loads(p.read_text());evidence=[]
for product in data['products']:
 a,b=map(int,re.findall(r'\d+',product['recipeSourceRows']));total=dict.fromkeys(keys.values(),0.0);missing=[];parts=[]
 for row in s.iter_rows(min_row=a,max_row=b,values_only=True):
  name=str(row[3] or '').strip().upper();q,q2,unit=row[4:7];unit=str(unit or '').strip().upper()
  if not name:continue
  if name in ['COFFEE GROUND','COFFEE GROUNDS','COFFEE BEANS']:continue # grounds discarded; espresso counted separately
  if name=='GARNISH':
   if row[9] and str(row[9]).strip() not in ['-','NA','N/A']:missing.append('Garnish quantities/composition')
   continue
  if name not in mapping:missing.append(name);continue
  if not isinstance(q,(float,int)):
   if name=='SALT':continue # no contribution to these four nutrients
   missing.append(name+' quantity');continue
  amount=(q+q2)/2 if isinstance(q2,(float,int)) else q
  id,density=mapping[name]
  if unit in ['ML']:amount*=density
  elif unit in ['NO','PC','PCS'] and name=='EGG':amount*=50
  elif unit not in ['GM','GMS','GMS S']:missing.append(name+' portion weight');continue
  values=nut.get(id,{})
  if not all(k in values for k in total):missing.append(name+' nutrient data');continue
  for k in total:total[k]+=amount*values[k]/100
  parts.append({'ingredient':name,'grams':round(amount,3),'fdcId':id,'food':foods[id],'per100g':values})
 if any('COFFEE' in str(r[3]) for r in s.iter_rows(min_row=a,max_row=b,values_only=True)) and not any(c['ingredient'] in ['ESPRESSO','COLD BREW'] for c in parts):missing.append('Brewed coffee yield/extraction')
 status='estimated' if not missing else 'unavailable'
 n={'status':status,'basis':'Per recipe serving, before customisations','note':'Approximate standard-ingredient estimate; brands and preparation vary. Not laboratory tested.' if not missing else 'Fat, fibre, total sugar and protein are not available yet: recipe quantities or ingredient nutrition need confirmation.'}
 if not missing:n['grams']={k:round(v,1) for k,v in total.items()}
 product['nutrition']=n;evidence.append({'id':product['id'],'name':product['name'],'sourceRows':product['recipeSourceRows'],'status':status,'missing':sorted(set(missing)),'components':parts,'nutrition':n})
p.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
d=root/'docs/testing/nutrition';d.mkdir(parents=True,exist_ok=True)
(d/'recipe-calculations.json').write_text(json.dumps(evidence,indent=2)+'\n')
(d/'ingredient-reference.json').write_text(json.dumps({name:{'fdcId':id,'food':foods[id],'density':density,'gramsPer100g':nut[id]} for name,(id,density) in mapping.items()},indent=2)+'\n')
(d/'RESULTS.md').write_text('''# Nutrition description update\n\nSource: USDA FoodData Central SR Legacy April 2018, https://fdc.nal.usda.gov/download-datasets/ . Values are per 100 g; calculation sums ingredient grams × reference nutrient / 100. Numeric recipe ranges use their midpoint. ML conversions use the densities recorded in ingredient-reference.json. Whole milk 3.25% fat and heavy cream are generic proxies; actual brands can differ. Egg portions assume 50 g edible egg. Water includes plain soda water and ice. Coffee grounds are discarded and excluded; espresso is counted. Basil/chilli oils use olive oil as a proxy. No health claims are made. These are estimates, not certified nutrition labels.\n\nNo incomplete recipe receives an invented total. Unknown premixes, unspecified portions, nutrient omissions and named garnishes without complete amounts block the estimate. Each outlet item displays all four requested nutrient labels or an explicit unavailable notice. Details, assumptions and missing inputs are in recipe-calculations.json. Customisations are excluded. Prices, availability, images and order history are untouched.\n''')
sql=['-- Add nutrition metadata only. Preserve all commercial and order fields.']
for x in data['products']:
 v=json.dumps(x['nutrition'],ensure_ascii=False).replace("'","''")
 sql.append("UPDATE products SET data=json_set(data,'$.nutrition',json('"+v+"')),updated_at=CURRENT_TIMESTAMP WHERE id='"+x['id']+"';")
(root/'drizzle/0015_menu_nutrition.sql').write_text('\n'.join(sql)+'\n')
print('Estimated',sum(e['status']=='estimated' for e in evidence),'Unavailable',sum(e['status']=='unavailable' for e in evidence))
print([e['name'] for e in evidence if e['status']=='estimated'])
