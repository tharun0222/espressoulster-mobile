"""Read the supplied workbook without changing it; preserve source quantities and ranges."""
import hashlib,json,re,zipfile,xml.etree.ElementTree as ET
from pathlib import Path

root=Path(__file__).resolve().parents[1]
source=Path('/home/headrun/FInal Espressoulster-Beverage-Recipes.xlsx')
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(source) as book:
    strings=[''.join(si.itertext()) for si in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('m:si',ns)]
    def rows(sheet):
        result={}
        for row in ET.fromstring(book.read(f'xl/worksheets/sheet{sheet}.xml')).findall('.//m:row',ns):
            values={}
            for cell in row.findall('m:c',ns):
                value=cell.find('m:v',ns)
                value=value.text if value is not None else ''
                if cell.attrib.get('t')=='s' and value:value=strings[int(value)]
                values[re.sub(r'\d','',cell.attrib['r'])]=value
            result[int(row.attrib['r'])]=values
        return result
    ingredients,guide=rows(1),rows(3)

products=json.loads((root/'lib/outlet-menu.json').read_text())['products']
calculations={p['id']:p for p in json.loads((root/'docs/testing/nutrition/recipe-calculations.json').read_text())}
guides={r.get('B','').strip():r for r in guide.values() if r.get('B')}
records={}
for product in products:
    start,end=map(int,re.findall(r'\d+',product['recipeSourceRows']))
    parts=[]
    for index in range(start,end+1):
        row=ingredients.get(index,{})
        if not row.get('D'):continue
        exact=row.get('H','').strip()
        low,high=row.get('E','').strip(),row.get('F','').strip()
        if not exact and low:exact=(low+'–'+high if high and high!=low else low)+' '+row.get('G','').strip()
        parts.append({'name':row['D'].strip().title(),'measurement':exact or 'Quantity not specified','detail':row.get('J','').strip(),'sourceRow':index})
    guide=guides.get(product['recipeSourceName'],{})
    calculation=calculations.get(product['id'],{})
    review=guide.get('F','').strip()
    nutrition=calculation.get('nutrition',{'status':'unavailable'})
    needs_confirmation=bool(re.search(r'table.*method|not listed in the table|omitted from (?:the )?table|missing.*quantit|quantit.*missing',review,re.I))
    if needs_confirmation:nutrition={'status':'unavailable','note':'Recipe measurements need café confirmation before nutrition can be calculated.'}
    records[product['id']]={'source':'Café recipe workbook','rows':product['recipeSourceRows'],'ingredients':parts,'serving':guide.get('E','').strip(),'review':review,'needsConfirmation':needs_confirmation,'nutrition':nutrition,'missing':calculation.get('missing',[])}

(root/'lib/recipe-measurements.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
report={'sourceFile':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'recipes':len(records),'withSourceNotes':sum(bool(r['review']) for r in records.values()),'withCompleteNutritionEstimates':sum(r['nutrition'].get('status')=='estimated' for r in records.values()),'withNutritionInputsMissing':sum(r['nutrition'].get('status')!='estimated' for r in records.values()),'note':'Recorded ingredient measurements are copied from the source; nutrition estimates are not exact or laboratory verified. Ranges and discrepancies are preserved.'}
(root/'docs/testing/nutrition/measurement-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['sourceFile','sha256']}))
