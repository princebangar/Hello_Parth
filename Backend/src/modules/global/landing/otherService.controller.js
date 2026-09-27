import * as service from './otherService.service.js';

const respond = (res, status, message, data) =>
  res.status(status).json({ success: true, message, data });

const notFound = (res) => res.status(404).json({ success: false, message: 'Service not found' });

export async function listOtherServices(_req, res, next) {
  try {
    respond(res, 200, 'Services fetched successfully', { services: await service.listAllOtherServices() });
  } catch (error) {
    next(error);
  }
}

export async function listPublicOtherServices(_req, res, next) {
  try {
    respond(res, 200, 'Services fetched successfully', { services: await service.listPublicOtherServices() });
  } catch (error) {
    next(error);
  }
}

export async function createOtherService(req, res, next) {
  try {
    const item = await service.createOtherService(req.body || {});
    respond(res, 201, 'Service created successfully', { service: item });
  } catch (error) {
    next(error);
  }
}

export async function updateOtherService(req, res, next) {
  try {
    const item = await service.updateOtherService(req.params.id, req.body || {});
    if (!item) return notFound(res);
    respond(res, 200, 'Service updated successfully', { service: item });
  } catch (error) {
    next(error);
  }
}

export async function deleteOtherService(req, res, next) {
  try {
    const item = await service.deleteOtherService(req.params.id);
    if (!item) return notFound(res);
    respond(res, 200, 'Service deleted successfully', { service: item });
  } catch (error) {
    next(error);
  }
}
