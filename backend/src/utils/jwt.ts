import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface TokenPayload {
  userId: string;
  email: string;
  role: Role;
}

const getJwtSecret = (): Secret => {
  return process.env.JWT_SECRET || 'fallback_jwt_secret_key_for_development';
};

const getJwtExpiresIn = (): SignOptions['expiresIn'] => {
  return (process.env.JWT_EXPIRES_IN as SignOptions['expiresIn']) || '7d';
};

/**
 * Generates a signed JWT token for an authenticated user.
 * @param payload User identity information (userId, email, role)
 * @returns Signed JWT string
 */
export function generateToken(payload: TokenPayload): string {
  const secret = getJwtSecret();
  const expiresIn = getJwtExpiresIn();
  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, secret, options);
}

/**
 * Verifies a JWT token and returns its decoded payload.
 * @param token JWT string
 * @returns Decoded TokenPayload
 */
export function verifyToken(token: string): TokenPayload {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as TokenPayload;
}
