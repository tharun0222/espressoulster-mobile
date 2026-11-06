import sqlite3
from pathlib import Path
c=sqlite3.connect(':memory:');c.execute('create table profiles(id text primary key)');c.execute("insert into profiles values('u')");c.execute("insert into profiles values('v')")
for f in ['0025_table_bookings.sql','0026_booking_tables.sql']:c.executescript(Path('drizzle',f).read_text())
assert c.execute('select count(*),sum(seats) from cafe_tables').fetchone()==(15,56)
for i,h,g in [('a','10:00',8),('b','11:00',2),('c','10:00',4)]:c.execute("insert into table_bookings(id,user_id,date,time,guests,purpose) values(?, ?,'2099-01-01',?,?,'Visit')",(i,'v' if i=='c' else 'u',h,g))
def update(id,tables,status='confirmed'):
 c.execute('update table_bookings set status=?,table_ids=? where id=?',(status,tables,id))
def reject(id,tables):
 try:update(id,tables)
 except sqlite3.IntegrityError:return
 raise AssertionError('Invalid allocation accepted')
reject('a','["T02"]');reject('a','["T02","T02","T02","T02"]');update('a','["T01"]');reject('c','["T01"]');update('b','["T01"]');update('a','["T01"]','cancelled');update('c','["T01"]')
try:c.execute("update cafe_tables set enabled=0 where id='T01'")
except sqlite3.IntegrityError:pass
else:raise AssertionError('Disabling booked table allowed')
c.execute("update cafe_tables set enabled=0 where id='T06'");reject('a','["T06","T07"]');update('a','["T07","T08"]')
print('Passed: inventory, capacity, duplicates, slot conflicts, adjacent slots, cancellation release, disabled tables and multi-table allocation')
# Existing rows migrate as one-hour reservations, preserving their arrival dates.
c.executescript(Path('drizzle/0027_booking_time_ranges.sql').read_text())
assert c.execute("select end_at-start_at from table_bookings where id='c'").fetchone()==(3600,)
c.execute('delete from table_bookings')
c.execute("update cafe_tables set enabled=1")
def add(id,user,start,end):
 c.execute("insert into table_bookings(id,user_id,date,time,guests,purpose,start_at,end_at) values(?,?,'2099-01-01',?,2,'Visit',CAST(strftime('%s',?) AS INTEGER),CAST(strftime('%s',?) AS INTEGER))",(id,user,start[11:16],start,end))
add('range-a','u','2099-01-01 10:00:00','2099-01-01 12:00:00');update('range-a','["T02"]')
add('range-b','v','2099-01-01 11:30:00','2099-01-01 12:30:00');reject('range-b','["T02"]')
update('range-b','["T03"]')
add('range-c','u','2099-01-01 12:00:00','2099-01-01 13:00:00');update('range-c','["T02"]')
try:add('range-d','u','2099-01-01 11:00:00','2099-01-01 11:30:00')
except sqlite3.IntegrityError:pass
else:raise AssertionError('Customer overlapping booking accepted')
update('range-a','["T02"]','cancelled');reject('range-b','["T02"]');update('range-c','["T02"]','cancelled');update('range-b','["T02"]')
try:c.execute("update cafe_tables set enabled=0 where id='T02'")
except sqlite3.IntegrityError:pass
else:raise AssertionError('Range allocation did not protect disabling')
print('Passed: legacy backfill, overlapping ranges, adjacent bookings, same-user overlap, range cancellation release')
c.executescript(Path('drizzle/0028_booking_notifications.sql').read_text())
update('range-b','["T03"]')
assert c.execute("select count(*) from booking_notifications where booking_id='range-b'").fetchone()==(1,)
update('range-b','["T03"]')
assert c.execute("select count(*) from booking_notifications where booking_id='range-b'").fetchone()==(1,)
update('range-b','["T04"]')
row=c.execute("select user_id,json_extract(data,'$.tables[0]'),json_extract(data,'$.start'),json_extract(data,'$.end') from booking_notifications where booking_id='range-b' order by rowid desc limit 1").fetchone()
assert row==('v','T04',4070950200,4070953800),row
update('range-b','["T04"]','cancelled')
assert c.execute("select count(*) from booking_notifications where booking_id='range-b'").fetchone()==(2,)
print('Passed: durable confirmation notices, no duplicate on unchanged save, reassignment notice, correct customer and time range')
