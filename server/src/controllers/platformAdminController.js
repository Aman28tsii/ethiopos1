// server/src/controllers/platformAdminController.js

import { query, getClient } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

// ============================================================
// Guard — only the single platform_admin can reach these handlers.
// protect() already ran, so req.user is guaranteed present.
// ============================================================
const assertPlatformAdmin = (req) => {
  if (req.user?.role !== 'platform_admin') {
    throw new AppError('Platform admin required', 403);
  }
};

// ============================================================
// DASHBOARD — counts for the admin home
// ============================================================
export const getDashboard = catchAsync(async (req, res) => {
  assertPlatformAdmin(req);

  const [pending, approved, rejected, companies] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM registration_requests WHERE status = 'pending'`),
    query(`SELECT COUNT(*)::int AS c FROM registration_requests WHERE status = 'approved'`),
    query(`SELECT COUNT(*)::int AS c FROM registration_requests WHERE status = 'rejected'`),
    query(`SELECT COUNT(*)::int AS c FROM companies`),
  ]);

  res.json({
    success: true,
    data: {
      pending:         pending.rows[0].c,
      approved:        approved.rows[0].c,
      rejected:        rejected.rows[0].c,
      total_companies: companies.rows[0].c,
    },
  });
});

// ============================================================
// LIST REGISTRATIONS — optionally filter by status
// ============================================================
export const listRegistrations = catchAsync(async (req, res) => {
  assertPlatformAdmin(req);

  const { status } = req.query;
  const params = [];
  let where = '';

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    where = 'WHERE r.status = $1';
    params.push(status);
  }

  const result = await query(
    `SELECT
        r.id,
        r.company_name,
        r.branch_name,
        r.branch_address,
        r.branch_phone,
        r.owner_name,
        r.owner_email,
        r.owner_phone,
        r.status,
        r.rejection_reason,
        r.company_id,
        r.branch_id,
        r.owner_id,
        r.created_at,
        r.reviewed_at,
        r.reviewed_by
       FROM registration_requests r
       ${where}
   ORDER BY r.created_at DESC`,
    params
  );

  res.json({ success: true, data: result.rows });
});

// ============================================================
// GET ONE REGISTRATION — plus read-only snapshots of linked rows.
// Never returns password.
// ============================================================
export const getRegistration = catchAsync(async (req, res) => {
  assertPlatformAdmin(req);

  const { id } = req.params;

  const rows = await query(
    `SELECT * FROM registration_requests WHERE id = $1`,
    [id]
  );
  if (rows.rows.length === 0) {
    throw new AppError('Registration not found', 404);
  }

  const reg = rows.rows[0];

  const company = reg.company_id
    ? (await query(
        `SELECT id, name, is_approved, approved_at, approved_by, created_at
           FROM companies WHERE id = $1`,
        [reg.company_id]
      )).rows[0] || null
    : null;

  const branch = reg.branch_id
    ? (await query(
        `SELECT id, name, address, phone, is_active
           FROM branches WHERE id = $1`,
        [reg.branch_id]
      )).rows[0] || null
    : null;

  const owner = reg.owner_id
    ? (await query(
        `SELECT id, name, email, phone, role, status, is_active
           FROM users WHERE id = $1`,
        [reg.owner_id]
      )).rows[0] || null
    : null;

  res.json({ success: true, data: { request: reg, company, branch, owner } });
});

// ============================================================
// APPROVE — atomic. Company + owner + request in one transaction.
// ============================================================
export const approveRegistration = catchAsync(async (req, res) => {
  assertPlatformAdmin(req);

  const { id } = req.params;
  const adminId = req.user.id;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock the request row so two admins cannot approve simultaneously.
    const r = await client.query(
      `SELECT * FROM registration_requests WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (r.rows.length === 0) throw new AppError('Registration not found', 404);

    const reg = r.rows[0];
    if (reg.status !== 'pending') {
      throw new AppError(`Registration is already ${reg.status}`, 409);
    }

    // 1. Activate company
    await client.query(
      `UPDATE companies
          SET is_approved = true,
              approved_at = NOW(),
              approved_by = $1,
              updated_at  = NOW()
        WHERE id = $2`,
      [adminId, reg.company_id]
    );

    // 2. Activate owner
    await client.query(
      `UPDATE users
          SET status     = 'active',
              is_active  = true,
              updated_at = NOW()
        WHERE id = $1`,
      [reg.owner_id]
    );

    // 3. Mark request approved
    await client.query(
      `UPDATE registration_requests
          SET status      = 'approved',
              reviewed_by = $1,
              reviewed_at = NOW(),
              updated_at  = NOW()
        WHERE id = $2`,
      [adminId, id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Company approved. Owner can now log in.',
      data: { company_id: reg.company_id, owner_id: reg.owner_id },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================
// REJECT — atomic. Owner blocked, company stays unapproved.
// ============================================================
export const rejectRegistration = catchAsync(async (req, res) => {
  assertPlatformAdmin(req);

  const { id } = req.params;
  const { reason } = req.body || {};
  const adminId = req.user.id;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const r = await client.query(
      `SELECT * FROM registration_requests WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (r.rows.length === 0) throw new AppError('Registration not found', 404);

    const reg = r.rows[0];
    if (reg.status !== 'pending') {
      throw new AppError(`Registration is already ${reg.status}`, 409);
    }

    // 1. Block owner
    await client.query(
      `UPDATE users
          SET status     = 'rejected',
              is_active  = false,
              updated_at = NOW()
        WHERE id = $1`,
      [reg.owner_id]
    );

    // 2. Mark request rejected (company stays is_approved = false)
    await client.query(
      `UPDATE registration_requests
          SET status            = 'rejected',
              rejection_reason  = $1,
              reviewed_by       = $2,
              reviewed_at       = NOW(),
              updated_at        = NOW()
        WHERE id = $3`,
      [reason || null, adminId, id]
    );

    await client.query('COMMIT');

    res.json({ success: true, message: 'Registration rejected.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});