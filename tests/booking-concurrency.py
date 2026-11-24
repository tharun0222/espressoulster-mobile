"""Race the real booking database triggers using disposable SQLite files only."""
import concurrent.futures, datetime, pathlib, sqlite3, tempfile, threading, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]

class BookingConcurrency(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='coffee-booking-race-')
        self.path=str(pathlib.Path(self.temp.name)/'fixture.sqlite')
        self.db=sqlite3.connect(self.path)
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'drizzle').glob('*.sql')):
            self.db.executescript(migration.read_text())
        self.start=int((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=4)).timestamp())
        self.day=datetime.datetime.fromtimestamp(self.start,datetime.timezone.utc).strftime('%Y-%m-%d')
        for name in ('a','b','c'):
            self.db.execute('INSERT INTO profiles(id,email,name,phone) VALUES(?,?,?,?)',(name,name+'@fixture.invalid','Fixture '+name,''))
        self.table=self.db.execute('SELECT id FROM cafe_tables WHERE enabled=1 AND seats>=4 ORDER BY seats LIMIT 1').fetchone()[0]
        self.db.commit()
    def tearDown(self):
        self.db.close();self.temp.cleanup()
    def pending(self,id,user,start=None):
        start=self.start if start is None else start
        self.db.execute("INSERT INTO table_bookings(id,user_id,date,time,guests,purpose,notes,start_at,end_at) VALUES(?,?,?,?,4,'Fixture','',?,?)",(id,user,self.day,'12:00',start,start+3600))
        self.db.commit()
    def race(self,operations):
        barrier=threading.Barrier(len(operations))
        def run(operation):
            db=sqlite3.connect(self.path,timeout=10)
            db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA busy_timeout=10000')
            barrier.wait()
            try:
                operation(db);db.commit();return 'success'
            except sqlite3.IntegrityError as error:
                db.rollback();return str(error)
            finally:db.close()
        with concurrent.futures.ThreadPoolExecutor(len(operations)) as pool:
            return list(pool.map(run,operations))
    def test_simultaneous_table_assignment_has_one_winner(self):
        self.pending('first','a');self.pending('second','b')
        def assign(id):
            return lambda db:db.execute("UPDATE table_bookings SET status='confirmed',table_ids=json_array(?) WHERE id=?",(self.table,id))
        results=self.race([assign('first'),assign('second')])
        self.assertEqual(results.count('success'),1,results)
        self.assertEqual(sum('already booked' in value for value in results),1,results)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM table_bookings WHERE status='confirmed'").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM booking_notifications").fetchone()[0],1)
        # Consecutive bookings are not overlaps and remain assignable.
        self.pending('adjacent','c',self.start+3600)
        self.db.execute("UPDATE table_bookings SET status='confirmed',table_ids=json_array(?) WHERE id='adjacent'",(self.table,));self.db.commit()
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM table_bookings WHERE status='confirmed'").fetchone()[0],2)
    def test_simultaneous_overlapping_customer_requests_have_one_winner(self):
        def insert(id):
            return lambda db:db.execute("INSERT INTO table_bookings(id,user_id,date,time,guests,purpose,notes,start_at,end_at) VALUES(?,'a',?,'12:00',4,'Fixture','',?,?)",(id,self.day,self.start,self.start+3600))
        results=self.race([insert('first'),insert('second')])
        self.assertEqual(results.count('success'),1,results)
        self.assertEqual(sum('overlapping' in value for value in results),1,results)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM table_bookings').fetchone()[0],1)

    def test_booking_qr_order_and_staff_assignment_share_one_table(self):
        now=int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        self.pending('reservation','a',now+600)
        self.db.execute("""INSERT INTO orders(id,user_id,idempotency_key,fulfillment,contact,subtotal,tax,discount,fee,total,currency)
          VALUES('walk-in','c','dine-test','dine_in','{}',100,0,0,0,100,'INR')""")
        self.db.commit()
        def book(db):
            db.execute("UPDATE table_bookings SET status='confirmed',table_ids=json_array(?) WHERE id='reservation'",(self.table,))
        def qr_order(db):
            db.execute("""INSERT INTO orders(id,user_id,idempotency_key,fulfillment,contact,subtotal,tax,discount,fee,total,currency)
              VALUES('qr-order','b','qr-race','dine_in',json_object('table',?),100,0,0,0,100,'INR')""",(self.table,))
        def assign(db):
            db.execute("UPDATE orders SET contact=json_set(contact,'$.table',?),status='confirmed' WHERE id='walk-in'",(self.table,))
        outcomes=self.race([book,qr_order,assign])
        self.assertEqual(outcomes.count('success'),1,outcomes)
        self.assertEqual(outcomes.count('Cafe table conflict'),2,outcomes)
        rows=self.db.execute("SELECT customer_id,kind FROM live_cafe_table_schedule WHERE table_id=?",(self.table,)).fetchall()
        self.assertEqual(len(rows),1,rows)
        self.assertIn(rows[0],[('a','booking'),('b','visit'),('c','visit')])

    def test_scans_do_not_allocate_but_a_placed_order_occupies_the_table(self):
        for customer in ('a','b','c','b'):
            self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,?,'scan')",(self.table,customer))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM cafe_table_schedule WHERE table_id=?",(self.table,)).fetchone()[0],0)
        self.db.execute("""INSERT INTO orders(id,user_id,idempotency_key,fulfillment,contact,subtotal,tax,discount,fee,total,currency)
            VALUES('qr-order','b','qr-order','dine_in',json_object('table',?),100,0,0,0,100,'INR')""",(self.table,))
        rows=self.db.execute("SELECT kind,customer_id FROM live_cafe_table_schedule WHERE table_id=?",(self.table,)).fetchall()
        self.assertEqual(rows,[('visit','b')])
        with self.assertRaisesRegex(sqlite3.IntegrityError,'Cafe table conflict'):
            self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'c','scan')",(self.table,))
        # Further scans/orders from this same party do not allocate a duplicate visit.
        self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'b','scan')",(self.table,))
        self.db.execute("""INSERT INTO orders(id,user_id,idempotency_key,fulfillment,contact,subtotal,tax,discount,fee,total,currency)
            VALUES('qr-order-2','b','qr-order-2','dine_in',json_object('table',?),100,0,0,0,100,'INR')""",(self.table,))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM live_cafe_table_schedule WHERE table_id=?",(self.table,)).fetchone()[0],1)

    def test_two_customers_can_scan_but_only_one_can_place_the_table_order(self):
        for customer in ('a','b'):
            self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,?,'scan')",(self.table,customer))
        self.db.commit()
        def place(customer):
            return lambda db:db.execute("""INSERT INTO orders(id,user_id,idempotency_key,fulfillment,contact,subtotal,tax,discount,fee,total,currency)
                VALUES(?,?,?,'dine_in',json_object('table',?),100,0,0,0,100,'INR')""",(customer,customer,customer,self.table))
        results=self.race([place('a'),place('b')])
        self.assertEqual(results.count('success'),1,results)
        self.assertEqual(results.count('Cafe table conflict'),1,results)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM orders").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM live_cafe_table_schedule WHERE table_id=?",(self.table,)).fetchone()[0],1)

    def test_reserved_table_blocks_scan_and_order_without_changing_reservation(self):
        now=int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        self.pending('reserved','a',now-60)
        self.db.execute("UPDATE table_bookings SET status='confirmed',table_ids=json_array(?) WHERE id='reserved'",(self.table,));self.db.commit()
        with self.assertRaisesRegex(sqlite3.IntegrityError,'Cafe table conflict'):
            self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'b','scan')",(self.table,))
        with self.assertRaisesRegex(sqlite3.IntegrityError,'Cafe table conflict'):
            self.db.execute("""INSERT INTO orders(id,user_id,idempotency_key,fulfillment,contact,subtotal,tax,discount,fee,total,currency)
                VALUES('blocked','b','blocked','dine_in',json_object('table',?),100,0,0,0,100,'INR')""",(self.table,))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM orders WHERE id='blocked'").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT customer_id,kind FROM live_cafe_table_schedule WHERE table_id=?",(self.table,)).fetchall(),[('a','booking')])
        # The customer who owns the current reservation can still scan their own table.
        self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'a','scan')",(self.table,))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM live_cafe_table_schedule WHERE table_id=? AND kind='scan'",(self.table,)).fetchone()[0],0)

    def test_scanning_never_releases_an_existing_occupied_table(self):
        other=self.db.execute("SELECT id FROM cafe_tables WHERE id<>? AND enabled=1 LIMIT 1",(self.table,)).fetchone()[0]
        self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'b','visit')",(other,))
        self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'a','visit')",(self.table,))
        with self.assertRaisesRegex(sqlite3.IntegrityError,'Cafe table conflict'):
            self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'b','scan')",(self.table,))
        self.assertEqual(self.db.execute("SELECT table_id FROM live_cafe_table_schedule WHERE customer_id='b'").fetchall(),[(other,)])

    def test_disabled_tables_reject_scans(self):
        self.db.execute("UPDATE cafe_tables SET enabled=0 WHERE id=?",(self.table,))
        with self.assertRaisesRegex(sqlite3.IntegrityError,'Cafe table unavailable'):
            self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'c','scan')",(self.table,))

    def test_upgrade_releases_old_scan_holds_but_preserves_occupied_tables(self):
        self.db.execute("INSERT INTO cafe_table_schedule(table_id,customer_id,kind,start_at,end_at,expires_at) VALUES(?,'a','scan',unixepoch(),unixepoch()+5400,unixepoch()+600)",(self.table,))
        other=self.db.execute("SELECT id FROM cafe_tables WHERE id<>? AND enabled=1 LIMIT 1",(self.table,)).fetchone()[0]
        self.db.execute("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES(?,'b','visit')",(other,))
        self.db.executescript((ROOT/'drizzle'/'0051_table_occupied_after_order.sql').read_text())
        self.assertEqual(self.db.execute("SELECT table_id,kind FROM live_cafe_table_schedule").fetchall(),[(other,'visit')])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM cafe_table_schedule WHERE kind='scan' AND closed_at IS NOT NULL").fetchone()[0],1)

if __name__=='__main__':unittest.main(verbosity=2)
