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

if __name__=='__main__':unittest.main(verbosity=2)
