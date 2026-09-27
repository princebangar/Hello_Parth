import express from 'express';
import { listPublicOtherServices } from './otherService.controller.js';

const router = express.Router();

// No auth — the public marketing landing page (`/`) reads this before anyone signs in.
router.get('/other-services', listPublicOtherServices);

export default router;
