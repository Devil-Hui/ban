'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { setup, request } = require('./helpers');

describe('H5 admin settings', () => {
  let adminToken;
  let userToken;

  before(async () => {
    setup();
    const admin = await request('POST', '/api/v1/auth/h5/login', {
      body: { username: 'admin', password: 'admin123' },
      headers: { 'x-client-type': 'h5' },
    });
    adminToken = admin.accessToken;
    assert.ok(adminToken);
    assert.equal(admin.user.role, 'admin');

    const user = await request('POST', '/api/v1/auth/miniprogram/login', {
      body: { code: 'admin_test_user' },
    });
    userToken = user.accessToken;
  });

  it('rejects non-admin for admin routes', async () => {
    await assert.rejects(
      () => request('GET', '/api/v1/admin/settings', { token: userToken }),
      (e) => e && (e.code === 4030 || e.httpStatus === 403)
    );
  });

  it('admin can read overview and settings', async () => {
    const ov = await request('GET', '/api/v1/admin/overview', { token: adminToken });
    assert.ok(typeof ov.profileCount === 'number');
    assert.ok(ov.settings);

    const st = await request('GET', '/api/v1/admin/settings', { token: adminToken });
    assert.ok(st.settings);
    assert.ok(Array.isArray(st.profiles));
  });

  it('admin can update default settings', async () => {
    const before = await request('GET', '/api/v1/admin/settings', { token: adminToken });
    const profileId =
      (before.profiles[0] && before.profiles[0].id) ||
      before.settings.defaultProfileId ||
      'sys_uni_45min_v1';

    const put = await request('PUT', '/api/v1/admin/settings', {
      token: adminToken,
      body: {
        defaultTimeMode: 'range',
        defaultProfileId: profileId,
      },
    });
    assert.equal(put.settings.defaultTimeMode, 'range');
    assert.equal(put.settings.defaultProfileId, profileId);

    const after = await request('GET', '/api/v1/admin/settings', { token: adminToken });
    assert.equal(after.settings.defaultTimeMode, 'range');
  });
});
