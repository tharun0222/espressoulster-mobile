import test from 'node:test';import assert from 'node:assert/strict';import {validateBooking,bookingsOverlap} from '../lib/table-booking.ts';
const now=Date.parse('2026-10-21T08:00:00+05:30'),good={date:'2026-10-22',time:'10:00',endTime:'11:30',guests:4,purpose:'Office meeting'};
test('validates a ninety-minute booking',()=>{const b=validateBooking(good,now);assert.equal(b.end_at-b.start_at,5400)});
test('rejects invalid ranges, dates and guests',()=>{for(const input of [{time:'10:15'},{endTime:'10:00'},{endTime:'09:30'},{time:'02:00'},{endTime:'02:30'},{date:'2026-02-30'},{date:'2026-12-01'},{guests:0},{guests:21},{guests:1.5}])assert.throws(()=>validateBooking({...good,...input},now))});
test('overnight bookings use the next calendar date',()=>{const b=validateBooking({...good,time:'23:30',endTime:'02:00'},now);assert.equal(b.end_at-b.start_at,9000);assert.equal(new Date(b.end_at*1000).toISOString(),'2026-10-22T20:30:00.000Z');assert.equal(validateBooking({...good,time:'00:30',endTime:'01:30'},now).date,'2026-10-23')});
test('overlap excludes adjacent and includes enclosing intervals',()=>{assert.equal(bookingsOverlap({start_at:1,end_at:5},{start_at:5,end_at:7}),false);assert.equal(bookingsOverlap({start_at:1,end_at:10},{start_at:2,end_at:3}),true)});
test('requires both times',()=>assert.throws(()=>validateBooking({...good,endTime:''},now)));
