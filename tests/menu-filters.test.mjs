import test from 'node:test';import assert from 'node:assert/strict';import {filterMenu,matchesDiet} from '../lib/menu-filters.ts';
const p=(id,price,dietary=[])=>({id,name:id,price,dietary,categoryId:'coffee'});const products=[p('latte',25000,['Veg']),p('egg',30000,['Egg']),p('vegan',20000,['Vegan']),p('chicken',50000,['Non Veg']),p('pending',null),p('cheap',10000,['vegetarian'])];const options={category:'all',search:'',diet:'all',sort:'default',priceRange:'all'};const f=(o={})=>filterMenu(products,['coffee'],{...options,...o}).map(p=>p.id);
test('ascending prices with missing prices last',()=>assert.deepEqual(f({sort:'price-up'}),['cheap','vegan','latte','egg','chicken','pending']));
test('descending prices with missing prices last',()=>assert.deepEqual(f({sort:'price-down'}),['chicken','egg','latte','vegan','cheap','pending']));
test('under 250 excludes boundary and unpriced',()=>assert.deepEqual(f({priceRange:'under-250'}),['vegan','cheap']));
test('250 to 500 includes lower boundary only',()=>assert.deepEqual(f({priceRange:'250-500'}),['latte','egg']));
test('500 plus includes boundary',()=>assert.deepEqual(f({priceRange:'500-plus'}),['chicken']));
test('veg excludes egg and meat and includes vegan',()=>assert.deepEqual(f({diet:'Veg'}),['latte','vegan','cheap']));
test('non veg accepts spellings and egg',()=>assert.deepEqual(f({diet:'Non-veg'}),['egg','chicken']));
test('unknown information separate',()=>assert.deepEqual(f({diet:'Unknown'}),['pending']));
test('combined controls and trimmed search',()=>assert.deepEqual(f({diet:'Veg',priceRange:'250-500',search:' LAT ',sort:'price-down'}),['latte']));
test('category and archived exclusions',()=>assert.deepEqual(filterMenu([{...products[0],archived:true}],['coffee'],options),[]));
test('filter leaves source order intact',()=>{f({sort:'price-up'});assert.equal(products[0].id,'latte')});
test('contradictory meat and veg never appears as veg',()=>assert.equal(matchesDiet(p('x',100,['Veg','Non-veg']),'Veg'),false));

import {catalogSeed} from '../lib/catalog.ts';
test('workbook chicken and egg classifications',()=>{assert.deepEqual(catalogSeed.find(p=>p.id==='source-26').dietary,['Non-veg','Egg']);assert.deepEqual(catalogSeed.find(p=>p.id==='source-15').dietary,['Egg']);assert.deepEqual(catalogSeed.find(p=>p.id==='source-28').dietary,[])});
test('all workbook items available and categorised',()=>{assert.equal(catalogSeed.length,110);assert.equal(new Set(catalogSeed.map(p=>p.categoryId)).size,18);assert(catalogSeed.every(p=>p.available&&p.price>0));assert.equal(catalogSeed.filter(p=>p.testPrice).length,89)});
