import * as service from './globalCustomer.service.js';

const respond = (res, status, message, data) =>
  res.status(status).json({ success: true, message, data });

const notFound = (res) => res.status(404).json({ success: false, message: 'Customer not found' });

export async function listCustomers(req, res, next) {
  try {
    respond(res, 200, 'Customers fetched successfully', await service.listCustomers(req.query || {}));
  } catch (error) {
    next(error);
  }
}

export async function getCustomerById(req, res, next) {
  try {
    const customer = await service.getCustomerById(req.params.id);
    if (!customer) return notFound(res);
    respond(res, 200, 'Customer fetched successfully', { customer });
  } catch (error) {
    next(error);
  }
}

export async function updateCustomerStatus(req, res, next) {
  try {
    const customer = await service.setCustomerStatus(req.params.id, req.body?.isActive);
    if (!customer) return notFound(res);
    respond(
      res,
      200,
      customer.isBlocked ? 'Customer blocked in Food and Taxi' : 'Customer unblocked in Food and Taxi',
      { customer },
    );
  } catch (error) {
    next(error);
  }
}
