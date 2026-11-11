import test from 'node:test';
import assert from 'node:assert/strict';
import { createMenuInteraction } from '../src/features/account/menuInteraction.js';

test('Safari internal pointer blur preserves activation; outside pointer and keyboard blur dismiss', () => {
  let dismissals = 0;
  const menu = createMenuInteraction({ contains: target => target === 'inside', dismiss: () => dismissals++ });
  menu.pointerDown('inside');
  menu.blur(null);
  assert.equal(dismissals, 0);
  menu.pointerEnd();
  menu.blur('inside');
  assert.equal(dismissals, 0);
  menu.blur('next-tab-target');
  assert.equal(dismissals, 1);
  menu.pointerDown('outside');
  assert.equal(dismissals, 2);
  menu.pointerEnd();
  menu.blur(null);
  assert.equal(dismissals, 3);
});

import { accountLinks, accountLinkActive } from '../src/features/account/accountNavigation.js';
import { safeReturnTo } from '../src/features/account/redirects.js';
test('all customer destinations remain valid; Seller shortcut stays in navbar and Admin requires explicit permission', () => {
  assert.deepEqual(accountLinks(null), []);
  const user = { capabilities: ['buyer'], permissions: [] };
  const links = accountLinks(user);
  assert.deepEqual(links.map(([to]) => to), ['/dashboard','/profile','/settings','/favorites','/cart','/orders','/reviews','/messages','/notifications']);
  assert.deepEqual(links.find(([to]) => to === "/orders"), ["/orders", "Booking Saya"]);
  for (const [to] of links) assert.equal(safeReturnTo(to), to);
  assert.equal(accountLinks({...user, email:'admin@example.test',sellerProfileId:'unverified'}).length, 9);
  const seller = {...user, capabilities:['buyer','seller'],sellerProfileId:'owned-profile'};
  assert.equal(accountLinks(seller).length, 9);
  assert.ok(!accountLinks(seller).some(([to]) => to === "/seller-dashboard"));
  assert.deepEqual(accountLinks({...seller, permissions:['admin:access']}).at(-1), ['/admin','Admin Dashboard']);
});

test('account active destinations follow exact and supported nested routes, never focus or Seller paths', () => {
  for (const [to] of accountLinks({permissions:[]})) {
    assert.equal(accountLinkActive(to, to), true);
    assert.equal(accountLinkActive(to, '/seller-dashboard'), false);
    assert.equal(accountLinkActive(to, '/marketplace'), false);
    assert.equal(accountLinkActive(to, '/dashboard-other'), false);
  }
  for (const [to, path] of [['/reviews','/review/booking-123'],['/messages','/messages/conversation-1'],['/orders','/orders/booking-1']]) {
    const active = accountLinks({permissions:[]}).filter(([link]) => accountLinkActive(link, path));
    assert.deepEqual(active.map(([link]) => link), [to]);
  }
  assert.equal(accountLinkActive('/dashboard','/dashboard/nested'), false);
  assert.equal(accountLinkActive('/profile','/profile-other'), false);
});
