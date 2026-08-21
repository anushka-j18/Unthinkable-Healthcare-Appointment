declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      email: string;
      role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
      name: string;
    };
  }
}
