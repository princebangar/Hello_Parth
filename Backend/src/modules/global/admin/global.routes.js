import express from 'express';
import { requireGlobalAccess } from '../../../core/admin/adminAccess.middleware.js';
import * as subAdminController from './globalSubAdmin.controller.js';
import * as customerController from './globalCustomer.controller.js';
import * as otherServiceController from '../landing/otherService.controller.js';
import * as pageContentController from './globalPageContent.controller.js';
import * as customizationController from './globalCustomization.controller.js';

const router = express.Router();

// Managing admins is reserved for the platform super admin.
const platformOnly = requireGlobalAccess({ platformOnly: true });

router.get('/sub-admins/scope-options', platformOnly, subAdminController.getScopeOptions);
router.get('/sub-admins', platformOnly, subAdminController.listSubAdmins);
router.post('/sub-admins', platformOnly, subAdminController.createSubAdmin);
router.get('/sub-admins/:id', platformOnly, subAdminController.getSubAdminById);
router.patch('/sub-admins/:id', platformOnly, subAdminController.updateSubAdmin);
router.patch('/sub-admins/:id/status', platformOnly, subAdminController.updateSubAdminStatus);
router.patch('/sub-admins/:id/password', platformOnly, subAdminController.resetSubAdminPassword);
router.patch('/sub-admins/:id/access', platformOnly, subAdminController.updateSubAdminAccess);
router.delete('/sub-admins/:id', platformOnly, subAdminController.deleteSubAdmin);

// Customers (one profile across Food and Taxi). A global sub-admin needs the matching Global permission.
router.get('/customers', requireGlobalAccess({ section: 'customers', action: 'view' }), customerController.listCustomers);
router.get('/customers/:id', requireGlobalAccess({ section: 'customers', action: 'view' }), customerController.getCustomerById);
router.patch('/customers/:id/status', requireGlobalAccess({ section: 'customers', action: 'edit' }), customerController.updateCustomerStatus);

// Terms & Conditions / Privacy Policy / Support — User, Restaurant, Delivery and Captain (driver) content.
router.get('/pages-social-media/:key', requireGlobalAccess({ section: 'pagesSocialMedia', action: 'view' }), pageContentController.getPageController);
router.put('/pages-social-media/:key', requireGlobalAccess({ section: 'pagesSocialMedia', action: 'edit' }), pageContentController.upsertPageController);

// Customization Settings — payment gateway on/off for the whole app. Keys are read from Backend/.env only.
router.get('/customization', requireGlobalAccess({ section: 'customization', action: 'view' }), customizationController.getCustomizationSettings);
router.patch('/customization/payment-gateways', requireGlobalAccess({ section: 'customization', action: 'edit' }), customizationController.updatePaymentGateways);
// Customer referral system on/off for Food + Taxi wallets.
router.patch('/customization/referral', requireGlobalAccess({ section: 'customization', action: 'edit' }), customizationController.updateReferral);

// Landing page "Other Service" cards (public site content, admin-managed).
router.get('/landing/other-services', requireGlobalAccess({ section: 'landing', action: 'view' }), otherServiceController.listOtherServices);
router.post('/landing/other-services', requireGlobalAccess({ section: 'landing', action: 'create' }), otherServiceController.createOtherService);
router.patch('/landing/other-services/:id', requireGlobalAccess({ section: 'landing', action: 'edit' }), otherServiceController.updateOtherService);
router.delete('/landing/other-services/:id', requireGlobalAccess({ section: 'landing', action: 'delete' }), otherServiceController.deleteOtherService);

export default router;
