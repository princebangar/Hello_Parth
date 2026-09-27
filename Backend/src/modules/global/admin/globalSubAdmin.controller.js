import * as service from './globalSubAdmin.service.js';

const respond = (res, status, message, data) =>
  res.status(status).json({ success: true, message, data });

const notFound = (res) =>
  res.status(404).json({ success: false, message: 'Sub admin not found' });

export async function listSubAdmins(req, res, next) {
  try {
    const data = await service.listSubAdmins(req.query || {});
    respond(res, 200, 'Sub admins fetched successfully', data);
  } catch (error) {
    next(error);
  }
}

export async function getScopeOptions(_req, res, next) {
  try {
    const data = await service.getScopeOptions();
    respond(res, 200, 'Scope options fetched successfully', data);
  } catch (error) {
    next(error);
  }
}

export async function getSubAdminById(req, res, next) {
  try {
    const subAdmin = await service.getSubAdminById(req.params.id);
    if (!subAdmin) return notFound(res);
    respond(res, 200, 'Sub admin fetched successfully', { subAdmin });
  } catch (error) {
    next(error);
  }
}

export async function createSubAdmin(req, res, next) {
  try {
    const subAdmin = await service.createSubAdmin(req.body || {});
    respond(res, 201, 'Sub admin created successfully', { subAdmin });
  } catch (error) {
    next(error);
  }
}

export async function updateSubAdmin(req, res, next) {
  try {
    const subAdmin = await service.updateSubAdmin(req.params.id, req.body || {});
    if (!subAdmin) return notFound(res);
    respond(res, 200, 'Sub admin updated successfully', { subAdmin });
  } catch (error) {
    next(error);
  }
}

export async function updateSubAdminStatus(req, res, next) {
  try {
    const subAdmin = await service.updateSubAdminStatus(req.params.id, req.body?.isActive);
    if (!subAdmin) return notFound(res);
    respond(res, 200, 'Sub admin status updated successfully', { subAdmin });
  } catch (error) {
    next(error);
  }
}

export async function resetSubAdminPassword(req, res, next) {
  try {
    const subAdmin = await service.resetSubAdminPassword(
      req.params.id,
      req.body?.newPassword ?? req.body?.password,
    );
    if (!subAdmin) return notFound(res);
    respond(res, 200, 'Password updated successfully', { subAdmin });
  } catch (error) {
    next(error);
  }
}

export async function updateSubAdminAccess(req, res, next) {
  try {
    const subAdmin = await service.updateSubAdminAccess(req.params.id, req.body || {});
    if (!subAdmin) return notFound(res);
    respond(res, 200, 'Access saved successfully', { subAdmin });
  } catch (error) {
    next(error);
  }
}

export async function deleteSubAdmin(req, res, next) {
  try {
    const subAdmin = await service.deleteSubAdmin(req.params.id);
    if (!subAdmin) return notFound(res);
    respond(res, 200, 'Sub admin deleted successfully', { subAdmin });
  } catch (error) {
    next(error);
  }
}
