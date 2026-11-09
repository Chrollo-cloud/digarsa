import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationItems, unreadNotifications } from '../src/features/messaging/notificationPresentation.js';
import { createMenuInteraction } from '../src/features/account/menuInteraction.js';
import { customerOverview } from '../src/features/customer/customerOverview.js';

test('notification All/Unread filters and compact limit preserve authoritative read states and order', () => {
  const rows = [
    {id:'old',is_read:false,created_at:'2026-11-01T00:00:00.000Z'},
    {id:'read',is_read:true,created_at:'2026-11-09T00:00:00.000Z'},
    {id:'new',is_read:false,created_at:'2026-11-08T00:00:00.000Z'},
  ];
  const before = structuredClone(rows);
  assert.equal(unreadNotifications(rows), 2);
  assert.deepEqual(notificationItems(rows).map(row=>row.id), ['read','new','old']);
  assert.deepEqual(notificationItems(rows,{unreadOnly:true,limit:1}).map(row=>row.id), ['new']);
  assert.deepEqual(rows, before);
  rows[2].is_read = true;
  assert.equal(unreadNotifications(rows), 1);
  assert.deepEqual(notificationItems(rows,{unreadOnly:true}).map(row=>row.id), ['old']);
  assert.deepEqual(notificationItems([]), []);
  const many = Array.from({length:12}, (_, index) => ({id:String(index),is_read:false,created_at:`2026-11-${String(index+1).padStart(2, '0')}T00:00:00.000Z`}));
  assert.equal(notificationItems(many, {limit:8}).length, 8);
  assert.equal(notificationItems(many, {limit:8})[0].id, '11');
  assert.equal(unreadNotifications(many), 12);
});

test('notification popover dismisses outside/Escape and restores focus without swallowing ordinary keys or internal clicks', () => {
  let closed = 0, focused = 0, prevented = 0, stopped = 0;
  const interaction = createMenuInteraction({contains: target => target === 'popover',dismiss:()=>closed++});
  interaction.pointerDown('popover');
  interaction.blur(null);
  assert.equal(closed, 0);
  interaction.pointerEnd();
  interaction.pointerDown('outside');
  assert.equal(closed, 1);
  assert.equal(interaction.escape({key:'Tab'}, ()=>focused++), false);
  assert.equal(focused, 0);
  const event = {key:'Escape',preventDefault:()=>prevented++,stopPropagation:()=>stopped++};
  assert.equal(interaction.escape(event,()=>focused++), true);
  assert.deepEqual([closed,focused,prevented,stopped], [2,1,1,1]);
});

test('customer dashboard aggregates real lifecycle statuses and dates without mutating bookings', () => {
  const bookings = ['Requested','Accepted','Paid','Completed','Declined','Cancelled'].map((status,index)=>({id:String(index),status,createdAt:`2026-11-0${index+1}T00:00:00.000Z`}));
  const before = structuredClone(bookings);
  const summary = customerOverview(bookings);
  assert.equal(summary.active, 3);
  assert.equal(summary.completed, 1);
  assert.ok(summary.statuses.every(row=>row.count===1));
  assert.deepEqual(summary.recent.map(row=>row.id), ['5','4','3']);
  assert.deepEqual(bookings, before);
  const empty = customerOverview([]);
  assert.equal(empty.active, 0);
  assert.deepEqual(empty.recent, []);
  assert.ok(empty.statuses.every(row=>row.count===0));
});
