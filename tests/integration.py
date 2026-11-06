"""Run only against the loopback built Worker, never a deployed store.
Direct Worker identity headers simulate trusted dispatcher identities locally.
The public Sites dispatcher is responsible for stripping user-supplied headers.
"""
import os,unittest,urllib.request,urllib.error,json,uuid,concurrent.futures,pathlib,time,inspect
TRACE=[]
PORT=int(os.environ.get('COFFEE_INTEGRATION_PORT','8787'))
if not 1024 <= PORT <= 65535: raise ValueError('Use a valid local integration test port')
BASE='http://127.0.0.1:'+str(PORT)
ADMIN=('local_seedy','seedy@sites.test')
def request(path,method='GET',data=None,user=ADMIN,extra=None,raw=None):
 headers={'Content-Type':'application/json'}
 if user:headers.update({'oai-authenticated-user-id':user[0],'oai-authenticated-user-email':user[1]})
 if extra:headers.update(extra)
 payload=raw if raw is not None else json.dumps(data).encode() if data is not None else None
 req=urllib.request.Request(BASE+'/api/'+path,data=payload,headers=headers,method=method)
 try:r=urllib.request.urlopen(req);status=r.status;b=r.read();content=r.headers.get('Content-Type','')
 except urllib.error.HTTPError as e:status=e.code;b=e.read();content=e.headers.get('Content-Type','')
 TRACE.append({'method':method,'path':'/api/'+path,'identity':'anonymous' if user is None else 'admin' if user==ADMIN else 'synthetic customer','status':status})
 return status,json.loads(b) if 'json' in content else b
class StoreTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  status,b=request('bootstrap');assert status==200,b;cls.originalSettings=b['settings']
  assert request('admin/overview')[0]==200,'Local administrator environment must be configured'
 def setUp(self):
  self.id='qa-'+uuid.uuid4().hex[:10];self.a=(self.id+'-a','qa-a@example.test');self.b=(self.id+'-b','qa-b@example.test')
  self.p={'id':self.id,'name':'QA coffee — test data','categoryId':'coffee','description':'Local automated test fixture','price':10000,'inventory':10,'available':True,'archived':False,'featured':False,'image':'','imageAtlas':False,'variants':[],'addons':[],'dietary':[]}
  self.assertEqual(request('admin/products','POST',self.p)[0],200)
  self.line={'productId':self.id,'quantity':1,'variantId':'','addonIds':[],'instructions':''}
 def tearDown(self):
  request('admin/products','POST',{**self.p,'archived':True,'available':False})
  request('admin/settings','PUT',self.originalSettings)
 def quote(self,items=None,user=None,fulfillment='pickup',code=''):
  return request('quote','POST',{'items':items or [self.line],'fulfillment':fulfillment,'code':code},user or self.a)
 def order(self,user=None,items=None,key=None,expected=None,method='pay_at_pickup',fulfillment='pickup'):
  items=items or [self.line];q=self.quote(items,user,fulfillment)[1]
  return request('orders','POST',{'items':items,'fulfillment':fulfillment,'paymentMethod':method,'contact':{'name':'QA customer','phone':'9999999999','address':'QA test address for local validation'},'expectedTotal':q.get('total') if expected is None else expected,'idempotencyKey':key or str(uuid.uuid4())},user or self.a)
 def test_01_catalog_complete(self):
  code,b=request('bootstrap');self.assertEqual(code,200)
  menu=[p for p in b['products'] if p.get('source')=='Outlet recipe workbook']
  self.assertEqual(len(menu),110);self.assertEqual(len(set(p['categoryId'] for p in menu)),18)
  self.assertTrue(all(p['available'] and p['price']>0 for p in menu));self.assertEqual(sum(p.get('testPrice',False) for p in menu),89)
  self.assertEqual(next(p for p in menu if p['id']=='source-01')['price'],26500)
  self.assertTrue(all(len(p.get('description',''))>20 and p.get('ingredients') for p in menu))
  self.assertTrue(all(p.get('nutrition',{}).get('status') in ['estimated','unavailable'] for p in menu))
  cappuccino=next(p for p in menu if p['id']=='source-04')['nutrition']
  self.assertEqual(cappuccino['status'],'estimated');self.assertGreater(cappuccino['grams']['protein'],0)
  for p in menu:
   if p['nutrition']['status']=='estimated':
    self.assertEqual(set(p['nutrition']['grams']),{'fat','fibre','sugar','protein'})
    self.assertTrue(all(isinstance(v,(int,float)) and v>=0 for v in p['nutrition']['grams'].values()))
   else:self.assertNotIn('grams',p['nutrition'])
  mocha=next(p for p in menu if p['id']=='recipe-mocha')
  self.assertIn('Chocolate powder',mocha['ingredients']);self.assertIn('Milk',mocha['ingredients'])
  chicken=next(p for p in menu if p['id']=='source-23')
  self.assertIn('Chicken',chicken['ingredients'])
 def test_60_phone_auth_fails_closed_without_sms(self):
  code,b=request('auth/phone/config');self.assertEqual(code,200);self.assertFalse(b['enabled'])
  self.assertEqual(request('auth/phone/send','POST',{'phone':'9876543210'},user=None)[0],503)
  self.assertEqual(request('auth/phone/verify','POST',{'phone':'9876543210','code':'123456','challenge':'x'},user=None)[0],503)
  self.assertEqual(request('auth/phone/logout','POST',{},user=None)[0],200)
 def test_02_unauthenticated_private_data(self):
  for path in ['cart','orders','profile','favorites','addresses','suggestions','admin/overview']:
   with self.subTest(path=path):self.assertEqual(request(path,user=None)[0],403 if path.startswith('admin/') else 401)
 def test_03_customer_cannot_manage_store(self):
  for path,method,data in [('admin/overview','GET',None),('admin/products','POST',self.p),('admin/categories','POST',{}),('admin/settings','PUT',{}),('admin/import','POST',{'products':[]})]:
   with self.subTest(path=path):self.assertEqual(request(path,method,data,self.a)[0],403)
 def test_04_client_roles_ignored(self):
  self.assertEqual(request('profile','PUT',{'name':'QA','phone':'','role':'admin','admin':True},self.a)[0],200);self.assertEqual(request('admin/overview',user=self.a)[0],403)
 def test_05_cart_persistence_and_isolation(self):
  self.assertEqual(request('cart','PUT',{'items':[self.line]},self.a)[0],200);self.assertEqual(request('cart',user=self.a)[1]['items'][0]['productId'],self.id);self.assertEqual(request('cart',user=self.b)[1]['items'],[])
 def test_06_invalid_cart(self):
  self.assertEqual(request('cart','PUT',{'items':[{**self.line,'quantity':-1}]},self.a)[0],400)
 def test_07_profile_isolation(self):
  request('profile','PUT',{'name':'QA Alice','phone':'9999999999'},self.a);self.assertEqual(request('profile',user=self.a)[1]['profile']['name'],'QA Alice');self.assertNotEqual(request('profile',user=self.b)[1]['profile']['name'],'QA Alice')
 def test_08_favorites_persist_and_remove(self):
  request('favorites','POST',{'productId':self.id},self.a);self.assertIn(self.id,request('favorites',user=self.a)[1]['ids']);self.assertNotIn(self.id,request('favorites',user=self.b)[1]['ids']);request('favorites','POST',{'productId':self.id,'remove':True},self.a);self.assertNotIn(self.id,request('favorites',user=self.a)[1]['ids'])
 def test_09_address_ownership(self):
  code,b=request('addresses','POST',{'label':'QA Home','address':'Local test address'},self.a);self.assertEqual(code,201);request('addresses/'+b['id'],'DELETE',user=self.b);self.assertEqual(len(request('addresses',user=self.a)[1]['addresses']),1);request('addresses/'+b['id'],'DELETE',user=self.a);self.assertEqual(request('addresses',user=self.a)[1]['addresses'],[])
 def test_10_order_creation_unpaid_and_stock(self):
  code,b=self.order();self.assertEqual(code,201,b);self.assertEqual(b['paymentStatus'],'unpaid');o=request('orders',user=self.a)[1]['orders'][0];self.assertEqual(o['total'],10000);self.assertEqual(o['items'][0]['unit_price'],10000);self.assertEqual(o['payment_status'],'unpaid');p=next(p for p in request('bootstrap')[1]['products'] if p['id']==self.id);self.assertEqual(p['inventory'],9)
 def test_11_idempotent_order(self):
  key=str(uuid.uuid4());a=self.order(key=key);b=self.order(key=key);self.assertEqual(a[1]['id'],b[1]['id']);self.assertEqual(len(request('orders',user=self.a)[1]['orders']),1)
 def test_12_concurrent_duplicate_submit(self):
  key=str(uuid.uuid4())
  with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:self.order(key=key),range(2)))
  self.assertEqual([r[0] for r in results],[201,201],results);self.assertEqual(results[0][1]['id'],results[1][1]['id'])
 def test_13_concurrent_stock_cannot_oversell(self):
  request('admin/products','POST',{**self.p,'inventory':1})
  with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:self.order(),range(2)))
  self.assertEqual(sum(r[0]==201 for r in results),1,results);self.assertTrue(all(r[0] in [201,400,409] for r in results));self.assertEqual(len(request('orders',user=self.a)[1]['orders']),1)
 def test_14_order_ownership(self):
  _,o=self.order();self.assertEqual(request('orders',user=self.b)[1]['orders'],[]);self.assertEqual(request('orders/'+o['id'],'PATCH',{'status':'cancelled'},self.b)[0],404)
 def test_15_client_prices_not_trusted(self):
  code,q=self.quote([{**self.line,'price':1,'unitPrice':1}]);self.assertEqual(code,200);self.assertEqual(q['total'],10000)
 def test_16_changed_total_rejected(self):
  code,b=self.order(expected=1);self.assertEqual(code,409,b);self.assertEqual(request('orders',user=self.a)[1]['orders'],[])
 def test_17_unpriced_product_blocked(self):
  request('admin/products','POST',{**self.p,'price':None,'available':False});self.assertEqual(self.quote()[0],400)
 def test_18_unavailable_product_blocked(self):
  request('admin/products','POST',{**self.p,'available':False});self.assertEqual(self.quote()[0],400)
 def test_19_archive_preserves_order_snapshot(self):
  _,o=self.order();request('admin/products','POST',{**self.p,'name':'Renamed QA','price':50000,'archived':True});order=request('orders',user=self.a)[1]['orders'][0];self.assertEqual(order['items'][0]['name'],self.p['name']);self.assertEqual(order['items'][0]['unit_price'],10000);self.assertEqual(self.quote()[0],400)
 def test_20_variant_addon_server_pricing(self):
  request('admin/products','POST',{**self.p,'variants':[{'id':'large','name':'Large','price':2000}],'addons':[{'id':'shot','name':'Shot','price':1500}]});self.line.update(variantId='large',addonIds=['shot']);self.assertEqual(self.quote()[1]['total'],13500)
 def test_21_taxes_promotions_and_fee(self):
  s={**self.originalSettings,'taxBps':500,'deliveryEnabled':True,'deliveryFee':3000,'offers':[{'code':'QA10','type':'percent','value':1000,'enabled':True,'minimum':0}]};self.assertEqual(request('admin/settings','PUT',s)[0],200);code,q=self.quote(fulfillment='delivery',code='QA10');self.assertEqual(code,200);self.assertEqual(q['total'],12450)
 def test_22_cancel_restock_once(self):
  _,o=self.order();self.assertEqual(request('orders/'+o['id'],'PATCH',{'status':'cancelled'},self.a)[0],200);self.assertEqual(request('orders/'+o['id'],'PATCH',{'status':'cancelled'},self.a)[0],403);p=next(p for p in request('bootstrap')[1]['products'] if p['id']==self.id);self.assertEqual(p['inventory'],10)
 def test_23_customer_cannot_confirm_order(self):
  _,o=self.order();self.assertEqual(request('orders/'+o['id'],'PATCH',{'status':'confirmed'},self.a)[0],403)
 def test_24_order_lifecycle(self):
  _,o=self.order()
  for status in ['confirmed','preparing','ready','completed']:self.assertEqual(request('admin/orders/'+o['id'],'PATCH',{'status':status})[0],200)
  order=request('orders',user=self.a)[1]['orders'][0];self.assertEqual(order['status'],'completed');self.assertEqual(len(order['events']),5)
 def test_25_invalid_transition(self):
  _,o=self.order();self.assertEqual(request('admin/orders/'+o['id'],'PATCH',{'status':'completed'})[0],400)
 def test_26_no_simulated_online_payment(self):
  self.assertEqual(self.order(method='card')[0],400);_,o=self.order();self.assertEqual(request('admin/payments/'+o['id'],'POST',{'reference':'QA receipt'},self.a)[0],403);self.assertEqual(request('orders',user=self.a)[1]['orders'][0]['payment_status'],'unpaid')
 def test_27_record_actual_cash_and_no_duplicate(self):
  _,o=self.order();self.assertEqual(request('admin/payments/'+o['id'],'POST',{'reference':'QA local cash receipt'})[0],200);self.assertEqual(request('admin/payments/'+o['id'],'POST',{'reference':'duplicate'})[0],409);self.assertEqual(request('orders',user=self.a)[1]['orders'][0]['payment_status'],'paid');self.assertEqual(request('admin/orders/'+o['id'],'PATCH',{'status':'cancelled'})[0],409)
 def test_28_category_management(self):
  id='cat-'+self.id;c={'id':id,'name':'QA category','position':99,'enabled':True,'image':''};self.assertEqual(request('admin/categories','POST',c)[0],200);request('admin/products','POST',{**self.p,'categoryId':id});request('admin/categories','POST',{**c,'enabled':False,'name':'QA renamed'});self.assertEqual(self.quote()[0],400);self.assertEqual(request('admin/products','POST',{**self.p,'categoryId':'unknown'})[0],400)
 def test_29_atomic_import_validation(self):
  a={**self.p,'id':self.id+'-import'};bad={**self.p,'id':self.id+'-bad','price':-1};self.assertEqual(request('admin/import','POST',{'products':[a,bad]})[0],400);self.assertFalse(any(p['id']==a['id'] for p in request('bootstrap')[1]['products']));code,b=request('admin/import','POST',{'products':[a]});self.assertEqual(code,200);self.assertEqual(b['imported'],1);request('admin/products','POST',{**a,'archived':True})
 def test_30_customer_suggestion_pending_then_draft(self):
  code,s=request('suggestions','POST',{'name':'QA suggestion','category':'Coffee','description':'Local test idea'},self.a);self.assertEqual(code,201);self.assertEqual(s['status'],'pending');self.assertEqual(request('suggestions',user=self.b)[1]['suggestions'],[]);self.assertFalse(any(p['name']=='QA suggestion' for p in request('bootstrap')[1]['products']));self.assertEqual(request('admin/suggestions/'+s['id'],'PATCH',{'status':'approved','product':{**self.p,'name':'QA approved'}})[0],200);draft=next(p for p in request('bootstrap')[1]['products'] if p['id']=='suggestion-'+s['id']);self.assertFalse(draft['available']);request('admin/products','POST',{**draft,'archived':True})
 def test_31_disabled_customer_blocked(self):
  request('profile','PUT',{'name':'QA disabled','phone':''},self.b);self.assertEqual(request('admin/customers/'+self.b[0],'PATCH',{'disabled':True})[0],200);self.assertEqual(request('orders',user=self.b)[0],403)
 def test_32_cross_origin_write_blocked(self):
  self.assertEqual(request('cart','PUT',{'items':[]},self.a,{'Origin':'https://evil.example'})[0],403)
 def test_33_invalid_json_and_oversized_body(self):
  self.assertEqual(request('cart','PUT',user=self.a,raw=b'{broken')[0],400);self.assertEqual(request('cart','PUT',user=self.a,raw=b' '*1000001)[0],413)
 def test_34_image_upload_and_magic_validation(self):
  def upload(content,mime):
   boundary='coffee-test-boundary';payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: {mime}\r\n\r\n').encode()+content+f'\r\n--{boundary}--\r\n'.encode();return request('upload','POST',user=self.a,extra={'Content-Type':f'multipart/form-data; boundary={boundary}'},raw=payload)
  self.assertEqual(upload(b'<svg onload="alert(1)"></svg>','image/png')[0],400);code,b=upload(pathlib.Path('public/icon-192.png').read_bytes(),'image/png');self.assertEqual(code,201,b);status,content=request(b['url'].removeprefix('/api/'));self.assertEqual(status,200);self.assertTrue(content.startswith(b'\x89PNG'))
 def test_35_audit_records_present(self):
  self.assertTrue(any(a['target']==self.id and a['action']=='product.save' for a in request('admin/overview')[1]['audit']))
 def test_36_checkout_contact_validation(self):
  code,b=request('orders','POST',{'items':[self.line],'fulfillment':'pickup','paymentMethod':'pay_at_pickup','contact':{'name':'QA','phone':'bad'},'expectedTotal':10000,'idempotencyKey':str(uuid.uuid4())},self.a);self.assertEqual(code,400,b)
 def test_37_invalid_settings_atomic(self):
  for change in [{'currency':'inr'},{'taxBps':10001},{'deliveryFee':-1},{'brand':''}]:
   with self.subTest(change=change):
    self.assertEqual(request('admin/settings','PUT',{**self.originalSettings,**change})[0],400)
    self.assertEqual(request('bootstrap')[1]['settings'],self.originalSettings)
 def test_38_online_payment_forced_off(self):
  self.assertEqual(request('admin/settings','PUT',{**self.originalSettings,'onlinePayments':True})[0],200)
  self.assertFalse(request('bootstrap')[1]['settings']['onlinePayments'])
 def test_39_disabled_fulfillment(self):
  request('admin/settings','PUT',{**self.originalSettings,'pickupEnabled':False,'deliveryEnabled':False})
  self.assertEqual(self.quote()[0],400);self.assertEqual(self.quote(fulfillment='delivery')[0],400)
 def test_40_reject_suggestion(self):
  code,s=request('suggestions','POST',{'name':'QA rejected idea','category':'Coffee','description':'Test rejection'},self.a);self.assertEqual(code,201)
  self.assertEqual(request('admin/suggestions/'+s['id'],'PATCH',{'status':'invalid'})[0],400)
  self.assertEqual(request('admin/suggestions/'+s['id'],'PATCH',{'status':'approved'})[0],400)
  self.assertEqual(request('admin/suggestions/'+s['id'],'PATCH',{'status':'rejected'})[0],200)
  self.assertEqual(request('suggestions',user=self.a)[1]['suggestions'][0]['status'],'rejected')
  self.assertFalse(any(p['id']=='suggestion-'+s['id'] for p in request('bootstrap')[1]['products']))
 def test_41_customer_recovery_admin_protection(self):
  request('profile','PUT',{'name':'QA restore','phone':''},self.b)
  request('admin/customers/'+self.b[0],'PATCH',{'disabled':True});self.assertEqual(request('cart',user=self.b)[0],403)
  self.assertEqual(request('admin/customers/'+self.b[0],'PATCH',{'disabled':False})[0],200);self.assertEqual(request('cart',user=self.b)[0],200)
  self.assertEqual(request('admin/customers/'+ADMIN[0],'PATCH',{'disabled':True})[0],400)
 def test_42_admin_order_search_filter_offset(self):
  _,o=self.order();code,b=request('admin/orders?q='+o['id']);self.assertEqual(code,200);self.assertEqual([x['id'] for x in b['orders']],[o['id']])
  request('admin/orders/'+o['id'],'PATCH',{'status':'confirmed'})
  self.assertEqual(len(request('admin/orders?q='+o['id']+'&status=confirmed')[1]['orders']),1)
  self.assertEqual(request('admin/orders?q='+o['id']+'&status=pending')[1]['orders'],[])
  self.assertEqual(request('admin/orders?q='+o['id']+'&offset=1')[1]['orders'],[])
  self.assertEqual(request('admin/orders?offset=-1')[0],400)
 def test_43_delivery_lifecycle(self):
  request('admin/settings','PUT',{**self.originalSettings,'deliveryEnabled':True,'deliveryFee':3000})
  code,o=self.order(method='cash_on_delivery',fulfillment='delivery');self.assertEqual(code,201,o)
  for status in ['confirmed','preparing']:self.assertEqual(request('admin/orders/'+o['id'],'PATCH',{'status':status})[0],200)
  self.assertEqual(request('admin/orders/'+o['id'],'PATCH',{'status':'ready'})[0],400)
  for status in ['out_for_delivery','completed']:self.assertEqual(request('admin/orders/'+o['id'],'PATCH',{'status':status})[0],200)
  order=request('orders',user=self.a)[1]['orders'][0];self.assertEqual(order['status'],'completed');self.assertEqual(order['total'],13000)
 def test_44_payment_reference_and_cancelled_order(self):
  _,o=self.order()
  for reference in ['', ' '*5, 'x'*151]:self.assertEqual(request('admin/payments/'+o['id'],'POST',{'reference':reference})[0],400)
  self.assertEqual(request('orders',user=self.a)[1]['orders'][0]['payment_status'],'unpaid')
  request('orders/'+o['id'],'PATCH',{'status':'cancelled'},self.a)
  self.assertEqual(request('admin/payments/'+o['id'],'POST',{'reference':'cancelled receipt'})[0],400)
 def test_45_invalid_product_fields(self):
  for change in [{'price':-1},{'image':'javascript:alert(1)'},{'image':'https://'},{'image':'https://user:password@example.test/a.png'},{'image':'https://example.test/a b.png'},{'image':'/api/images/../../bad'},{'image':'http://insecure.example/a.png'},{'inventory':-1},{'dietary':['invented']},{'variants':[{'id':'x','name':'X','price':0},{'id':'x','name':'Duplicate','price':0}]}]:
   with self.subTest(change=change):self.assertEqual(request('admin/products','POST',{**self.p,**change})[0],400)
  self.assertEqual(self.quote()[1]['total'],10000)
 def test_46_upload_invalid_data(self):
  def upload(content,mime):
   boundary='qa-upload';payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="qa.png"\r\nContent-Type: {mime}\r\n\r\n').encode()+content+f'\r\n--{boundary}--\r\n'.encode()
   return request('upload','POST',user=self.a,extra={'Content-Type':f'multipart/form-data; boundary={boundary}'},raw=payload)
  for content,mime in [(b'','image/png'),(b'\x89PNG','image/png'),(pathlib.Path('public/icon-192.png').read_bytes(),'image/jpeg'),(b'GIF89a','image/gif')]:
   with self.subTest(mime=mime,length=len(content)):self.assertEqual(upload(content,mime)[0],400)
 def test_47_duplicate_import_atomic(self):
  a={**self.p,'id':self.id+'-dupe'}
  self.assertEqual(request('admin/import','POST',{'products':[a,a]})[0],400)
  self.assertFalse(any(p['id']==a['id'] for p in request('bootstrap')[1]['products']))
 def test_49_invalid_transition_prototype_keys(self):
  _,o=self.order()
  for status in ['constructor','toString','__proto__']:
   with self.subTest(status=status):self.assertEqual(request('admin/orders/'+o['id'],'PATCH',{'status':status})[0],400)
 def test_48_missing_resources(self):
  self.assertEqual(request('admin/suggestions/missing','PATCH',{'status':'rejected'})[0],404)
  self.assertEqual(request('admin/orders/missing','PATCH',{'status':'confirmed'})[0],404)
  self.assertEqual(request('not-a-real-endpoint')[0],404)

 def test_50_online_gateway_disabled_and_auth_protected(self):
  self.assertEqual(request('payments/config',user=None)[0],401)
  code,config=request('payments/config',user=self.a)
  self.assertEqual(code,200);self.assertEqual(config,{'enabled':False,'provider':None})
  code,order=self.order();self.assertEqual(code,201)
  for suffix,method,data in [('start','POST',{}),('verify','POST',{'razorpay_payment_id':'pay_forged'}),('status','GET',None)]:
   self.assertEqual(request('payments/'+order['id']+'/'+suffix,method,data,self.a)[0],403)
  self.assertEqual(request('payments/webhook','POST',{'event':'payment.captured'},None)[0],503)
  self.assertEqual(request('orders',user=self.a)[1]['orders'][0]['payment_status'],'unpaid')

 def test_51_subscription_balance_private_and_cannot_self_grant(self):
  self.assertEqual(request('subscriptions',user=None)[0],401)
  for customer in [self.a,self.b]:
   code,b=request('subscriptions',user=customer)
   self.assertEqual(code,200);self.assertEqual(b['subscriptions'],[])
   self.assertEqual(b['summary']['remainingCredits'],0);self.assertEqual(b['summary']['totalCredits'],0)
  self.assertEqual(request('subscriptions','POST',{'totalCredits':8,'paid':True},self.a)[0],404)
  self.assertEqual(request('subscriptions',user=self.a)[1]['summary']['remainingCredits'],0)

 def test_52_dummy_payment_outcomes_never_pay_order(self):
  self.assertEqual(request('test-payments/config',user=self.a)[1]['enabled'],True)
  _,o=self.order()
  for outcome,status in [('success','paid'),('failure','failed'),('cancelled','cancelled')]:
   code,b=request('test-payments/'+o['id'],'POST',{'outcome':outcome,'amount':1,'paid':True},self.a)
   self.assertEqual(code,200,b);self.assertEqual(b['simulatedStatus'],status);self.assertEqual(b['amount'],10000);self.assertFalse(b['realMoneyCollected']);self.assertEqual(b['actualPaymentStatus'],'unpaid')
  saved=request('orders',user=self.a)[1]['orders'][0]
  self.assertEqual(saved['payment_status'],'unpaid');self.assertEqual(saved['status'],'pending')
 def test_53_dummy_payment_access_validation(self):
  self.assertEqual(request('test-payments/config',user=None)[0],401)
  _,o=self.order();path='test-payments/'+o['id']
  self.assertEqual(request(path,'POST',{'outcome':'success'},self.b)[0],404)
  self.assertEqual(request(path,'POST',{'outcome':'paid'},self.a)[0],400)
  self.assertEqual(request(path,'GET',user=self.a)[0],405)
  request('orders/'+o['id'],'PATCH',{'status':'cancelled'},self.a)
  self.assertEqual(request(path,'POST',{'outcome':'success'},self.a)[0],409)

 def test_54_tester_login_isolated_and_logout(self):
  def login(name):
   req=urllib.request.Request(BASE+'/api/tester-session',data=json.dumps({'name':name}).encode(),headers={'Content-Type':'application/json'},method='POST')
   with urllib.request.urlopen(req) as r:
    self.assertEqual(r.status,200);cookie=r.headers['Set-Cookie'];self.assertIn('HttpOnly',cookie);self.assertIn('SameSite=Lax',cookie);return {'Cookie':cookie.split(';')[0]}
  a=login('QA Tester A');b=login('QA Tester B')
  ua=request('bootstrap',user=None,extra=a)[1]['user'];ub=request('bootstrap',user=None,extra=b)[1]['user']
  self.assertNotEqual(ua['userId'],ub['userId']);self.assertEqual(ua['profile']['name'],'QA Tester A');self.assertFalse(ua['admin'])
  self.assertEqual(request('admin/overview',user=None,extra=a)[0],403)
  self.assertEqual(request('cart','PUT',{'items':[self.line]},user=None,extra=a)[0],200)
  self.assertEqual(request('cart',user=None,extra=b)[1]['items'],[])
  self.assertEqual(request('tester-session/logout','POST',{},user=None,extra=a)[0],200)
  self.assertEqual(request('cart',user=None,extra=a)[0],401)
 def test_55_tester_session_validation(self):
  self.assertEqual(request('tester-session','POST',{'name':'x'},user=None)[0],400)
  self.assertEqual(request('tester-session','GET',user=None)[0],405)
  self.assertEqual(request('tester-session','POST',{'name':'QA'},user=None,extra={'Origin':'https://evil.example'})[0],403)
  self.assertIsNone(request('bootstrap',user=None,extra={'Cookie':'espresso_tester='+'a'*64})[1]['user'])

 def test_56_admin_identity_survives_tester_cookie(self):
  req=urllib.request.Request(BASE+'/api/tester-session',data=json.dumps({'name':'QA Admin Customer View'}).encode(),headers={'Content-Type':'application/json'},method='POST')
  with urllib.request.urlopen(req) as r:cookie={'Cookie':r.headers['Set-Cookie'].split(';')[0]}
  customer=request('bootstrap',user=ADMIN,extra=cookie)[1]['user']
  self.assertTrue(customer['userId'].startswith('tester-'));self.assertFalse(customer['admin'])
  self.assertEqual(request('admin/overview',user=ADMIN,extra=cookie)[0],200)
  self.assertEqual(request('admin/overview',user=None,extra=cookie)[0],403)
  self.assertEqual(request('admin/overview',user=self.a,extra=cookie)[0],403)
  self.assertEqual(request('tester-session/logout','POST',{},user=None,extra=cookie)[0],200)

 def test_57_workbook_temporary_price_checkout(self):
  product=next(p for p in request('bootstrap')[1]['products'] if p.get('testPrice'))
  line={**self.line,'productId':product['id']}
  code,q=self.quote([line]);self.assertEqual(code,200);self.assertEqual(q['total'],10000)
  code,o=self.order(items=[line]);self.assertEqual(code,201);self.assertEqual(o['paymentStatus'],'unpaid')
 def test_58_workbook_recipe_dietary_metadata(self):
  products=request('bootstrap')[1]['products']
  lookup={p['id']:p for p in products}
  self.assertEqual(lookup['source-26']['dietary'],['Non-veg','Egg'])
  self.assertEqual(lookup['source-15']['dietary'],['Egg'])
  self.assertEqual(lookup['source-28']['dietary'],[])
  self.assertEqual(lookup['source-28']['dietaryReview'],True)

 def test_59_removed_paypal_routes_are_disabled(self):
  self.assertEqual(request('paypal-test/config',user=None)[0],401)
  self.assertEqual(request('paypal-test/config',user=self.a)[0],410)
  self.assertEqual(request('razorpay-test/config',user=self.a)[0],410)
  code,o=self.order();self.assertEqual(code,201)
  for action in ['start','capture','status']:
   self.assertEqual(request('paypal-test/'+o['id']+'/'+action,'POST',{},self.a)[0],410)
  saved=next(item for item in request('orders',user=self.a)[1]['orders'] if item['id']==o['id'])
  self.assertEqual(saved['payment_status'],'unpaid')

 def test_61_admin_advertisements_roundtrip_and_validation(self):
  banners=[{'id':'qa-banner-'+str(i),'image':'/api/images/qa-example','tag':'','title':'QA banner','copy':'','action':'Browse','search':'coffee','destination':'menu','enabled':True} for i in range(7)]
  settings={**self.originalSettings,'promotionBanners':banners}
  self.assertEqual(request('admin/settings','PUT',settings)[0],200)
  self.assertEqual(request('bootstrap')[1]['settings']['promotionBanners'],banners)
  bad={**banners[0],'image':'javascript:alert(1)'}
  self.assertEqual(request('admin/settings','PUT',{**settings,'promotionBanners':[bad]})[0],400)
  self.assertEqual(request('bootstrap')[1]['settings']['promotionBanners'],banners)
  self.assertEqual(request('admin/settings','PUT',{**settings,'promotionBanners':[]})[0],200)
  self.assertEqual(request('bootstrap')[1]['settings']['promotionBanners'],[])

 def test_62_profile_photo_ownership_and_persistence(self):
  boundary='profile-photo-test'
  payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n').encode()+pathlib.Path('public/icon-192.png').read_bytes()+f'\r\n--{boundary}--\r\n'.encode()
  status,photo=request('upload','POST',user=self.a,extra={'Content-Type':f'multipart/form-data; boundary={boundary}'},raw=payload)
  self.assertEqual(status,201,photo)
  details={'name':'QA photo user','phone':'9876543210','avatar':photo['url']}
  self.assertEqual(request('profile','PUT',details,self.a)[0],200)
  self.assertEqual(request('profile',user=self.a)[1]['profile']['avatar'],photo['url'])
  self.assertEqual(request('profile','PUT',details,self.b)[0],403)
  self.assertEqual(request('profile','PUT',{'name':'Updated name','phone':''},self.a)[0],200)
  self.assertEqual(request('profile',user=self.a)[1]['profile']['avatar'],photo['url'])
  self.assertEqual(request('profile','PUT',{**details,'avatar':''},self.a)[0],200)
  self.assertEqual(request('profile',user=self.a)[1]['profile']['avatar'],'')

 def test_63_payment_collection_method_and_customer_history(self):
  for method in ['cash','upi','card']:
   _,o=self.order()
   self.assertEqual(request('admin/payments/'+o['id'],'POST',{'reference':'QA '+method,'collection_method':method})[0],200)
   status,b=request('admin/customers/'+self.a[0]+'/orders')
   self.assertEqual(status,200);self.assertEqual(b['total'],len(b['orders']));self.assertFalse(b['hasMore'])
   row=next(x for x in b['orders'] if x['id']==o['id'])
   self.assertEqual(row['collection_method'],method);self.assertEqual(row['items'][0]['product_id'],self.id)
   self.assertIn('discount',row);self.assertEqual(row['payment_status'],'paid')
  self.assertEqual(request('admin/customers/'+self.a[0]+'/orders',user=self.b)[0],403)
  overview=request('admin/overview')[1]
  self.assertEqual(next(x for x in overview['customers'] if x['id']==self.a[0])['order_count'],3)
  _,o=self.order()
  self.assertEqual(request('admin/payments/'+o['id'],'POST',{'reference':'QA invalid','collection_method':'bitcoin'})[0],400)
  self.assertEqual(request('admin/customers/missing-customer/orders')[0],404)

 def test_64_admin_password_login_and_logout(self):
  payload=json.dumps({'username':'qaadmin','password':'qa-admin-password'}).encode()
  req=urllib.request.Request(BASE+'/api/auth/admin/login',data=payload,headers={'Content-Type':'application/json','cf-connecting-ip':self.id+'-success'},method='POST')
  with urllib.request.urlopen(req) as r:
   self.assertEqual(r.status,200);cookie=r.headers['Set-Cookie'];self.assertIn('HttpOnly',cookie);self.assertIn('SameSite=Strict',cookie)
  identity={'Cookie':cookie.split(';')[0]}
  self.assertEqual(request('admin/overview',user=None,extra=identity)[0],200)
  # Admin cookies grant admin access only, never a customer identity.
  self.assertIsNone(request('bootstrap',user=None,extra=identity)[1]['user'])
  self.assertEqual(request('auth/admin/logout','POST',{},user=None,extra=identity)[0],200)
  self.assertEqual(request('admin/overview',user=None,extra=identity)[0],403)
  self.assertEqual(request('admin/overview',user=None,extra={'Cookie':'espresso_admin='+'a'*64})[0],403)
 def test_65_admin_password_rejection_and_rate_limit(self):
  for i in range(10):
   self.assertEqual(request('auth/admin/login','POST',{'username':'qaadmin','password':'wrong'},user=None,extra={'cf-connecting-ip':self.id+'-rate'})[0],401)
  self.assertEqual(request('auth/admin/login','POST',{'username':'qaadmin','password':'qa-admin-password'},user=None,extra={'cf-connecting-ip':self.id+'-rate'})[0],429)
  self.assertEqual(request('auth/admin/login','POST',{'username':'qaadmin','password':'qa-admin-password'},user=None,extra={'Origin':'https://evil.example'})[0],403)

 def test_66_admin_stock_toggle_preserves_item_and_blocks_order(self):
  path='admin/products/'+self.id+'/availability'
  self.assertEqual(request(path,'PATCH',{'available':False},self.a)[0],403)
  self.assertEqual(request(path,'PATCH',{'available':False})[0],200)
  p=next(x for x in request('bootstrap')[1]['products'] if x['id']==self.id)
  self.assertFalse(p['available']);self.assertEqual(p['inventory'],10);self.assertEqual(p['price'],10000)
  self.assertEqual(self.quote()[0],400)
  self.assertEqual(request(path,'PATCH',{'available':True})[0],200)
  self.assertEqual(self.quote()[0],200)
  self.assertEqual(request('admin/products','POST',{**self.p,'image':'/images/menu/items/source-01.webp'})[0],200)
  self.assertEqual(request('admin/products','POST',{**self.p,'inventory':0,'available':False})[0],200)
  self.assertEqual(request(path,'PATCH',{'available':True})[0],409)
  self.assertEqual(request(path,'PATCH',{'available':'yes'})[0],400)

class EvidenceResult(unittest.TextTestResult):
 def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs);self.evidence=[]
 def startTest(self,test):
  self.started=time.perf_counter();self.traceStart=len(TRACE);self.currentStatus='passed';self.details=[];super().startTest(test)
 def addFailure(self,test,err):self.currentStatus='failed';self.details.append(self._exc_info_to_string(err,test));super().addFailure(test,err)
 def addError(self,test,err):self.currentStatus='error';self.details.append(self._exc_info_to_string(err,test));super().addError(test,err)
 def addSubTest(self,test,subtest,err):
  if err:self.currentStatus='failed';self.details.append(str(subtest)+': '+str(err[1]))
  super().addSubTest(test,subtest,err)
 def stopTest(self,test):
  self.evidence.append({'test':test._testMethodName,'status':self.currentStatus,'durationSeconds':round(time.perf_counter()-self.started,4),'stepsAndExpectedAssertions':inspect.getsource(getattr(type(test),test._testMethodName)),'actualApiTrace':TRACE[self.traceStart:],'details':self.details});super().stopTest(test)

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(StoreTests);result=unittest.TextTestRunner(verbosity=2,resultclass=EvidenceResult).run(suite)
 report={'tests':result.testsRun,'passed':sum(x['status']=='passed' for x in result.evidence),'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'scope':'Local built Worker with test identities; synthetic fixtures never deployed','testCases':result.evidence}
 out=pathlib.Path('docs/testing/backend');out.mkdir(parents=True,exist_ok=True);(out/'integration-evidence.json').write_text(json.dumps(report,indent=2));pathlib.Path('docs/integration-results.json').write_text(json.dumps({k:v for k,v in report.items() if k!='testCases'},indent=2));raise SystemExit(not result.wasSuccessful())
