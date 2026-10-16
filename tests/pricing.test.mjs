import test from "node:test";
import assert from "node:assert/strict";
import { priceCart, validateProduct, validTransition, whole, text, BusinessError } from "../lib/pricing.ts";
import { catalogSeed, categorySeed } from "../lib/catalog.ts";
const product = {
  id: "test",
  name: "Test coffee",
  categoryId: "coffee",
  price: 10000,
  inventory: 5,
  available: true,
  archived: false,
  description: "",
  image: "",
  variants: [
    { id: "regular", name: "Regular", price: 0 },
    { id: "large", name: "Large", price: 2000 },
  ],
  addons: [{ id: "shot", name: "Extra shot", price: 1500 }],
  dietary: [],
};
const categories = [{ id: "coffee", enabled: true }];
const settings = {
  currency: "INR",
  taxBps: 500,
  deliveryFee: 4000,
  pickupEnabled: true,
  deliveryEnabled: true,
  offers: [
    {
      code: "TEN",
      enabled: true,
      type: "percent",
      value: 1000,
      minimum: 10000,
    },
    { code: "FLAT", enabled: true, type: "fixed", value: 15000, minimum: 0 },
  ],
};
const line = {
  productId: "test",
  variantId: "regular",
  addonIds: [],
  quantity: 1,
  instructions: "",
};
const price = (
  items = [line],
  p = product,
  categoriesArg = categories,
  s = settings,
  code = "",
  method = "pickup",
) => priceCart(items, [p], categoriesArg, s, code, method);
test("workbook import preserves 110 recipes and 21 matched prices", () => {
 assert.equal(catalogSeed.length,110);assert.equal(categorySeed.length,21);
 assert.equal(catalogSeed.filter(p=>p.testPrice).length,89);
 assert.equal(catalogSeed.find(p=>p.id==="source-01").price,26500);
 assert.ok(catalogSeed.every(p=>p.available && Number.isSafeInteger(p.price) && p.price>0));
});
test("temporary prices blocked outside test mode",()=>{
 assert.throws(()=>priceCart([line],[{...product,testPrice:true}],categories,settings),BusinessError);
 assert.equal(priceCart([line],[{...product,testPrice:true}],categories,{...settings,testMode:true}).total,10500);
});
test("minor-unit subtotal and tax", () => {
  assert.deepEqual(
    [price().subtotal, price().tax, price().total],
    [10000, 500, 10500],
  );
});
test("variant, add-on, and quantity pricing", () => {
  const q = price([
    { ...line, variantId: "large", addonIds: ["shot"], quantity: 2 },
  ]);
  assert.equal(q.subtotal, 27000);
  assert.equal(q.total, 28350);
});
test("client-supplied price is ignored", () =>
  assert.equal(
    price([{ ...line, price: 1, unitPrice: 1, total: 1 }]).subtotal,
    10000,
  ));
test("percentage discount is applied before tax", () => {
  const q = price([line], product, categories, settings, "TEN");
  assert.equal(q.discount, 1000);
  assert.equal(q.tax, 450);
  assert.equal(q.total, 9450);
});
test("fixed discount cannot exceed subtotal", () =>
  assert.equal(price([line], product, categories, settings, "FLAT").total, 0));
test("delivery fee is server-configured", () =>
  assert.equal(
    price([line], product, categories, settings, "", "delivery").total,
    14500,
  ));
test("disabled fulfillment is rejected", () =>
  assert.throws(() =>
    price([line], product, categories, { ...settings, pickupEnabled: false }),
  ));
test("empty cart rejected", () => assert.throws(() => price([])));
test("unpriced item rejected", () =>
  assert.throws(() => price([line], { ...product, price: null })));
test("unavailable and archived items rejected", () => {
  assert.throws(() => price([line], { ...product, available: false }));
  assert.throws(() => price([line], { ...product, archived: true }));
});
test("disabled category rejected", () =>
  assert.throws(() =>
    price([line], product, [{ id: "coffee", enabled: false }]),
  ));
test("invalid and missing variants rejected", () => {
  assert.throws(() => price([{ ...line, variantId: "fake" }]));
  assert.throws(() => price([{ ...line, variantId: "" }]));
});
test("unknown and duplicate add-ons rejected", () => {
  assert.throws(() => price([{ ...line, addonIds: ["fake"] }]));
  assert.throws(() => price([{ ...line, addonIds: ["shot", "shot"] }]));
});
test("fractional, negative, zero, and excessive quantities rejected", () => {
  for (const quantity of [1.5, -1, 0, 100])
    assert.throws(() => price([{ ...line, quantity }]));
});
test("aggregate stock checks across variants", () =>
  assert.throws(() =>
    price([
      { ...line, quantity: 3 },
      { ...line, variantId: "large", quantity: 3 },
    ]),
  ));
test("duplicate cart lines rejected", () =>
  assert.throws(() => price([line, line])));
test("unknown, expired, and below-minimum offers rejected", () => {
  assert.throws(() => price([line], product, categories, settings, "fake"));
  assert.throws(() =>
    price(
      [line],
      product,
      categories,
      {
        ...settings,
        offers: [{ ...settings.offers[0], expires: "2000-01-01" }],
      },
      "TEN",
    ),
  );
  assert.throws(() =>
    price(
      [line],
      product,
      categories,
      { ...settings, offers: [{ ...settings.offers[0], minimum: 20000 }] },
      "TEN",
    ),
  );
});
test("product validation protects money and option identifiers", () => {
  assert.equal(validateProduct(product), product);
  assert.throws(() => validateProduct({ ...product, price: -1 }));
  assert.throws(() => validateProduct({ ...product, price: 1.5 }));
  assert.throws(() => validateProduct({ ...product, price: null }));
  assert.throws(() =>
    validateProduct({
      ...product,
      addons: [product.addons[0], product.addons[0]],
    }),
  );
});
test("safe image URLs and verified dietary label vocabulary", () => {
  assert.throws(() =>
    validateProduct({ ...product, image: "javascript:alert(1)" }),
  );
  assert.throws(() => validateProduct({ ...product, dietary: ["Made up"] }));
});
test("valid order transitions match fulfillment", () => {
  validTransition("pending", "confirmed", "pickup");
  validTransition("preparing", "ready", "pickup");
  validTransition("preparing", "out_for_delivery", "delivery");
  assert.throws(() => validTransition("pending", "completed", "pickup"));
  assert.throws(() =>
    validTransition("preparing", "out_for_delivery", "pickup"),
  );
  assert.throws(() => validTransition("preparing", "ready", "delivery"));
  assert.throws(() => validTransition("completed", "cancelled", "pickup"));
});

// Expanded boundary and security regression coverage; synthetic fixtures only.
for (const value of [NaN, Infinity, -Infinity, "1", null, undefined, {}, 1.01, -1, 100000001, Number.MAX_SAFE_INTEGER + 1]) {
  test(`numeric validator rejects ${String(value)} (${typeof value})`, () => assert.throws(() => whole(value), BusinessError));
}
test("numeric validator accepts inclusive bounds", () => {
  assert.equal(whole(0), 0); assert.equal(whole(100000000), 100000000);
});
test("text validator trims, checks required whitespace and maximum", () => {
  assert.equal(text(" coffee ", 20, true), "coffee");
  for (const v of ["   ", null, 2, "x".repeat(21)]) assert.throws(() => text(v, 20, true), BusinessError);
});
test("minor-unit rounding uses half-up for discount and tax", () => {
  const q = price([line], {...product, price: 101}, categories, {...settings, taxBps: 5000, offers:[{code:"HALF",enabled:true,type:"percent",value:5000}]}, "HALF");
  assert.deepEqual([q.subtotal,q.discount,q.tax,q.total],[101,51,25,75]);
});
test("100 percent discount leaves only delivery fee", () => {
  const q=price([line],product,categories,{...settings,offers:[{code:"FREE",enabled:true,type:"percent",value:10000}]},"FREE","delivery");
  assert.deepEqual([q.discount,q.tax,q.fee,q.total],[10000,0,4000,4000]);
});
test("offer minimum is inclusive and disabled offers rejected", () => {
  assert.equal(price([line],product,categories,settings,"TEN").discount,1000);
  assert.throws(()=>price([line],product,categories,{...settings,offers:[{...settings.offers[0],enabled:false}]},"TEN"),BusinessError);
});
test("future expiry accepted and invalid expiry rejected", () => {
  for(const expires of ["2999-01-01","invalid"]){
    const run=()=>price([line],product,categories,{...settings,offers:[{...settings.offers[0],expires}]},"TEN");
    if(expires==="invalid") assert.throws(run,BusinessError); else assert.equal(run().discount,1000);
  }
});
test("unlimited stock accepts maximum line quantity; exact stock accepted", () => {
  assert.equal(price([{...line,quantity:99}],{...product,inventory:null}).items[0].quantity,99);
  assert.equal(price([{...line,quantity:5}]).subtotal,50000);
  assert.throws(()=>price([{...line,quantity:1}],{...product,inventory:0}),BusinessError);
});
test("duplicate selections rejected regardless of add-on order", () => {
  const p={...product,addons:[...product.addons,{id:"milk",name:"Milk",price:100}]};
  assert.throws(()=>price([{...line,addonIds:["shot","milk"]},{...line,addonIds:["milk","shot"]}],p),BusinessError);
});
test("twenty add-ons allowed; twenty-one rejected", () => {
  const addons=Array.from({length:21},(_,i)=>({id:`a${i}`,name:`A${i}`,price:1}));
  const p={...product,addons};
  assert.equal(price([{...line,addonIds:addons.slice(0,20).map(a=>a.id)}],p).subtotal,10020);
  assert.throws(()=>price([{...line,addonIds:addons.map(a=>a.id)}],p),BusinessError);
});
test("maximum unit price inclusive; option price cannot exceed maximum", () => {
  assert.equal(price([line],{...product,price:100000000}).subtotal,100000000);
  assert.throws(()=>price([{...line,variantId:"large"}],{...product,price:100000000}),BusinessError);
});
test("unknown fulfillment and disabled delivery rejected", () => {
  for(const method of ["dine-in","", "__proto__"]) assert.throws(()=>price([line],product,categories,settings,"",method),BusinessError);
  assert.throws(()=>price([line],product,categories,{...settings,deliveryEnabled:false},"","delivery"),BusinessError);
});
test("instructions limited to 300 characters", () => {
  assert.equal(price([{...line,instructions:"x".repeat(300)}]).items[0].instructions.length,300);
  assert.throws(()=>price([{...line,instructions:"x".repeat(301)}]),BusinessError);
});
test("cart caps 100 distinct lines and rejects 101", () => {
  const ps=Array.from({length:101},(_,i)=>({...product,id:`p${i}`,inventory:null}));
  const lines=ps.map(p=>({...line,productId:p.id}));
  assert.equal(priceCart(lines.slice(0,100),ps,categories,settings).items.length,100);
  assert.throws(()=>priceCart(lines,ps,categories,settings),BusinessError);
});
test("product validation permits unavailable unpriced items", () => assert.equal(validateProduct({...product,available:false,price:null}).price,null));
test("product validation enforces option and inventory boundaries", () => {
  assert.equal(validateProduct({...product,inventory:1000000}).inventory,1000000);
  for(const inventory of [-1,1000001,1.5]) assert.throws(()=>validateProduct({...product,inventory}),BusinessError);
  const addons=Array.from({length:21},(_,i)=>({id:`a${i}`,name:`A${i}`,price:0}));
  validateProduct({...product,addons:addons.slice(0,20)});
  assert.throws(()=>validateProduct({...product,addons}),BusinessError);
});
test("product validation allows HTTPS and local uploaded images; rejects insecure schemes", () => {
  for(const image of ["https://example.com/coffee.jpg","/api/images/test.jpg","/images/menu/items/source-01.webp",""]) validateProduct({...product,image});
  for(const image of ["http://example.com/a.jpg","data:image/svg+xml,x","//example.com/a.jpg","javascript:alert(1)","/images/menu/items/../secret.webp","/images/menu/items/x.svg"]) assert.throws(()=>validateProduct({...product,image}),BusinessError);
});
const states=["pending","confirmed","preparing","ready","out_for_delivery","completed","cancelled"];
const expected={pending:["confirmed","cancelled"],confirmed:["preparing","cancelled"],preparing:["ready","out_for_delivery"],ready:["completed"],out_for_delivery:["completed"],completed:[],cancelled:[]};
for(const method of ["pickup","delivery"]) for(const from of states) for(const to of states){
  test(`transition ${method}: ${from} -> ${to}`,()=>{
    const allowed=expected[from].includes(to)&&!(method==="pickup"&&to==="out_for_delivery")&&!(method==="delivery"&&to==="ready");
    if(allowed) assert.doesNotThrow(()=>validTransition(from,to,method)); else assert.throws(()=>validTransition(from,to,method),BusinessError);
  });
}
test("unknown order status rejected",()=>assert.throws(()=>validTransition("missing","confirmed","pickup"),BusinessError));

for (const from of ["__proto__","constructor","toString"]) test(`prototype status ${from} is a controlled client error`,()=>assert.throws(()=>validTransition(from,"confirmed","pickup"),e=>e instanceof BusinessError && e.status===400));
for (const image of ["https://","https:// invalid","/api/images/../../admin",42]) test(`malformed image ${String(image)} is a controlled client error`,()=>assert.throws(()=>validateProduct({...product,image}),e=>e instanceof BusinessError && e.status===400));

test("unknown transition fulfilment is a controlled client error",()=>assert.throws(()=>validTransition("pending","confirmed","dine-in"),e=>e instanceof BusinessError && e.status===400));

// Dine in and take away share café fulfilment, with no delivery fee.
test("dine in quote has no delivery fee", () => {
 const result = priceCart([{...line,quantity:1}], [product], categories, {...settings,dineInEnabled:true}, "", "dine_in");
 assert.equal(result.fee,0);
});
test("disabled dine in cannot be ordered", () => {
 assert.throws(() => priceCart([{...line,quantity:1}], [product], categories, {...settings,dineInEnabled:false}, "", "dine_in"), BusinessError);
});
test("dine in follows ready and completed workflow", () => {
 validTransition("preparing","ready","dine_in");
 validTransition("ready","completed","dine_in");
 assert.throws(() => validTransition("preparing","out_for_delivery","dine_in"),BusinessError);
});
