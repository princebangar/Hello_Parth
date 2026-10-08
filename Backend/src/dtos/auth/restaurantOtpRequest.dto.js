import { z } from 'zod';
import { ValidationError } from '../../core/auth/errors.js';

const schema = z.object({
    phone: z
        .string()
        .min(8, 'Phone must be at least 8 digits')
        .max(15, 'Phone must be at most 15 digits'),
    partnerType: z.enum(['restaurant', 'store']).optional().default('restaurant'),
    // set after the person confirmed the 'new account for this role' popup
    confirmNewRole: z.boolean().optional().default(false)
});

export const validateRestaurantOtpRequestDto = (body) => {
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};
