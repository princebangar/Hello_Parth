import express from 'express';
import { upload } from '../../../middleware/upload.js';
import { config } from '../../../config/env.js';
import {
    storeImageBuffer,
    storeFileBuffer,
    deleteStoredAsset,
    extractAssetUrl,
} from '../../../services/storage.service.js';

const router = express.Router();

const requireInternalSecret = (req, res, next) => {
    const expected = String(config.uploadInternalSecret || '').trim();
    const provided = String(req.get('X-Upload-Secret') || '').trim();
    if (!expected || !provided || provided !== expected) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized upload',
        });
    }
    return next();
};

const isImageUpload = (file) => {
    const mime = String(file?.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    const name = String(file?.originalname || '').toLowerCase();
    return /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|avif)$/i.test(name);
};

// POST /v1/uploads/image — public/app upload (auth may be added at caller)
router.post('/image', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No file provided',
            });
        }

        const folder =
            typeof req.body?.folder === 'string' && req.body.folder.trim()
                ? req.body.folder.trim()
                : 'uploads';

        const stored = await storeImageBuffer(req.file.buffer, folder, {
            mimeType: req.file.mimetype,
            originalName: req.file.originalname,
            replaceUrl: extractAssetUrl(req.body?.replaceUrl),
        });

        return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                url: stored.url || stored.secure_url,
                publicId: stored.public_id || stored.filename || null,
                format: stored.format || 'webp',
            },
        });
    } catch (error) {
        next(error);
    }
});

// POST /v1/uploads/internal — local/dev backends forward here so files land on live /var/www/uploads
router.post('/internal', requireInternalSecret, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No file provided',
            });
        }

        const folder =
            typeof req.body?.folder === 'string' && req.body.folder.trim()
                ? req.body.folder.trim()
                : 'uploads';
        const replaceUrl = extractAssetUrl(req.body?.replaceUrl);

        const stored = isImageUpload(req.file)
            ? await storeImageBuffer(req.file.buffer, folder, {
                  mimeType: req.file.mimetype,
                  originalName: req.file.originalname,
                  replaceUrl,
              })
            : await storeFileBuffer(req.file.buffer, folder, req.file.originalname, {
                  mimeType: req.file.mimetype,
                  replaceUrl,
              });

        return res.status(200).json({
            success: true,
            data: {
                url: stored.url || stored.secure_url,
                secure_url: stored.url || stored.secure_url,
                public_id: stored.public_id || stored.filename || null,
                filename: stored.filename,
                format: stored.format,
                bytes: stored.bytes,
                width: stored.width,
                height: stored.height,
                resource_type: stored.resource_type || (isImageUpload(req.file) ? 'image' : 'raw'),
            },
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /v1/uploads/internal
router.delete('/internal', requireInternalSecret, async (req, res, next) => {
    try {
        const url = extractAssetUrl(req.body?.url || req.body?.replaceUrl);
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'url is required',
            });
        }
        const deleted = await deleteStoredAsset(url);
        return res.status(200).json({
            success: true,
            data: { deleted },
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /v1/uploads — app/web delete (food + taxi); removes file from /var/www/uploads
router.delete('/', async (req, res, next) => {
    try {
        const url = extractAssetUrl(req.body?.url || req.body?.replaceUrl || req.query?.url);
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'url is required',
            });
        }
        const deleted = await deleteStoredAsset(url);
        return res.status(200).json({
            success: true,
            data: { deleted },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
