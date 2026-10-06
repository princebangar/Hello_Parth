import { Driver } from '../driver/models/Driver.js';
import { Owner } from '../admin/models/Owner.js';
import { SupportTicket } from '../support/models/SupportTicket.js';
import { BusDriver } from '../driver/models/BusDriver.js';
import { PoolingVehicle } from '../admin/models/PoolingVehicle.js';

// Tells the Taxi admin panel that something is waiting for review: a live socket event (bell + toast in the
// open panel) and a push to admin devices. Never throws — an alert must not break the request that caused it.
export const alertTaxiAdmins = ({ type, title, body, link = '', id = '' } = {}) => {
  const payload = {
    type: String(type || 'request'),
    title: String(title || 'New request'),
    body: String(body || ''),
    link: String(link || ''),
    id: String(id || ''),
    createdAt: new Date().toISOString(),
  };

  // Loaded lazily: dispatchService pulls in the whole ride stack and is imported by many of the callers' modules.
  import('./dispatchService.js')
    .then(({ emitToAdmins }) => emitToAdmins('admin:request', payload))
    .catch(() => {});

  import('../../../core/notifications/firebase.service.js')
    .then(({ notifyAdminsSafely }) =>
      notifyAdminsSafely({
        title: payload.title,
        body: payload.body,
        data: { type: `taxi_${payload.type}`, id: payload.id, link: payload.link },
      }),
    )
    .catch(() => {});
};

const toTime = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const getDocumentStatus = (doc = {}) =>
  String(doc.status || doc.verificationStatus || doc.reviewStatus || '').trim().toLowerCase();

// A document the driver changed (new photo / new expiry date) after the admin last reviewed it.
const isAwaitingReverification = (doc) => {
  if (!doc || typeof doc !== 'object') return false;
  if (getDocumentStatus(doc) !== 'pending') return false;
  const changedAt = Math.max(toTime(doc.reverificationRequestedAt), toTime(doc.uploadedAt), toTime(doc.updatedAt));
  return Boolean(doc.reverificationRequestedAt) && changedAt > toTime(doc.reviewedAt);
};

// Everything the admin still has to act on, newest first, for the bell's "Requests" tab.
export const getPendingAdminRequests = async ({ limit = 30 } = {}) => {
  const perKind = Math.min(Math.max(Number(limit) || 30, 1), 100);

  const [
    pendingDrivers, pendingDriverCount, pendingOwners, pendingOwnerCount, openTickets, openTicketCount, approvedDrivers,
    pendingBusDrivers, pendingBusDriverCount, pendingPooling, pendingPoolingCount,
  ] =
    await Promise.all([
      Driver.find({ approve: false, deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(perKind)
        .select('name phone createdAt')
        .lean(),
      Driver.countDocuments({ approve: false, deletedAt: null }),
      Owner.find({ approve: false, deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(perKind)
        .select('owner_name name company_name mobile createdAt')
        .lean(),
      Owner.countDocuments({ approve: false, deletedAt: null }),
      SupportTicket.find({ status: { $in: ['pending', 'assigned'] } })
        .sort({ updatedAt: -1 })
        .limit(perKind)
        .select('ticketCode title requesterName requesterRole createdAt updatedAt')
        .lean(),
      SupportTicket.countDocuments({ status: { $in: ['pending', 'assigned'] } }),
      // Re-uploads only matter for drivers who are already approved (a pending driver is reviewed as a whole).
      Driver.find({ approve: true, deletedAt: null, documents: { $exists: true, $ne: null } })
        .sort({ updatedAt: -1 })
        .limit(500)
        .select('name phone documents updatedAt')
        .lean(),
      BusDriver.find({ signupSource: 'self_signup', approve: false })
        .sort({ createdAt: -1 })
        .limit(perKind)
        .select('name phone busName createdAt')
        .lean(),
      BusDriver.countDocuments({ signupSource: 'self_signup', approve: false }),
      PoolingVehicle.find({ approve: false })
        .sort({ createdAt: -1 })
        .limit(perKind)
        .select('driverName driverPhone vehicleNumber name createdAt')
        .lean(),
      PoolingVehicle.countDocuments({ approve: false }),
    ]);

  const reverifications = [];
  for (const driver of approvedDrivers) {
    const docs = Object.entries(driver.documents || {}).filter(([, doc]) => isAwaitingReverification(doc));
    if (docs.length === 0) continue;
    const latest = docs.reduce((max, [, doc]) => Math.max(max, toTime(doc.reverificationRequestedAt)), 0);
    reverifications.push({
      id: String(driver._id),
      type: 'document_reverification',
      title: `${driver.name || 'Driver'} updated ${docs.length} document${docs.length > 1 ? 's' : ''}`,
      body: docs.map(([key, doc]) => doc.label || doc.name || key).join(', '),
      link: `/taxi/admin/drivers/${driver._id}`,
      createdAt: new Date(latest || toTime(driver.updatedAt)).toISOString(),
    });
  }

  const items = [
    ...pendingDrivers.map((driver) => ({
      id: String(driver._id),
      type: 'driver_registration',
      title: `${driver.name || 'New driver'} is waiting for approval`,
      body: driver.phone ? `Driver · ${driver.phone}` : 'Driver registration',
      link: `/taxi/admin/drivers/${driver._id}`,
      createdAt: driver.createdAt,
    })),
    ...pendingOwners.map((owner) => ({
      id: String(owner._id),
      type: 'owner_registration',
      title: `${owner.owner_name || owner.name || owner.company_name || 'New owner'} is waiting for approval`,
      body: owner.mobile ? `Fleet owner · ${owner.mobile}` : 'Fleet owner registration',
      link: '/taxi/admin/owners/pending',
      createdAt: owner.createdAt,
    })),
    ...pendingBusDrivers.map((busDriver) => ({
      id: String(busDriver._id),
      type: 'bus_driver_registration',
      title: `${busDriver.name || 'New bus driver'} is waiting for approval`,
      body: `Bus driver${busDriver.busName ? ` · ${busDriver.busName}` : ''}${busDriver.phone ? ` · ${busDriver.phone}` : ''}`,
      link: '/taxi/admin/bus-service',
      createdAt: busDriver.createdAt,
    })),
    ...pendingPooling.map((vehicle) => ({
      id: String(vehicle._id),
      type: 'pooling_registration',
      title: `${vehicle.driverName || 'New pooling driver'} is waiting for approval`,
      body: `Pooling · ${vehicle.name || 'Vehicle'}${vehicle.vehicleNumber ? ` · ${vehicle.vehicleNumber}` : ''}`,
      link: `/taxi/admin/pooling/vehicles/view/${vehicle._id}`,
      createdAt: vehicle.createdAt,
    })),
    ...openTickets.map((ticket) => ({
      id: String(ticket._id),
      type: 'support_ticket',
      title: `${ticket.requesterName || 'Someone'} raised a ticket`,
      body: `${ticket.title || 'Support'} · ${ticket.requesterRole || 'user'}`,
      link: '/taxi/admin/support/tickets',
      createdAt: ticket.updatedAt || ticket.createdAt,
    })),
    ...reverifications.slice(0, perKind),
  ].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

  return {
    counts: {
      pendingDrivers: pendingDriverCount,
      pendingOwners: pendingOwnerCount,
      openTickets: openTicketCount,
      documentReverifications: reverifications.length,
      pendingBusDrivers: pendingBusDriverCount,
      pendingPoolingDrivers: pendingPoolingCount,
    },
    total: pendingDriverCount + pendingOwnerCount + openTicketCount + reverifications.length + pendingBusDriverCount + pendingPoolingCount,
    results: items,
  };
};
