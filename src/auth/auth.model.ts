import { $Enums } from '@prisma/client';

export class AuthLoginRequest {
  nip: string;
  password: string;
}

export class AuthResponse {
  nip: string;
  name: string;
  email: string;
  phone: string;
  role: $Enums.EmployeeRole;
  token?: string;
}