import { UserRole } from '@prisma/client';
import { z, ZodType } from 'zod';

export class UserValidation {
  static readonly ADD: ZodType = z.object({
    username: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.enum(Object.values(UserRole) as [string, ...string[]]),
  });

  static readonly UPDATE: ZodType = z.object({
    username: z.string().min(1).max(100).optional(),
    role: z.enum(Object.values(UserRole) as [string, ...string[]]).optional(),
  });
}
