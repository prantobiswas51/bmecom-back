import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto, SignupDto, UpdateProfileDto } from './dto/auth.dto.js';
import { AuthToken, AuthTokenType } from './entities/auth-token.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { PasswordService } from './password.service.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EMAIL_TOKEN_TTL: Record<AuthTokenType, number> = {
  [AuthTokenType.VerifyEmail]: 24 * HOUR,
  [AuthTokenType.ResetPassword]: HOUR,
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;
  private readonly frontendUrl: string;

  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(AuthToken) private readonly authTokens: Repository<AuthToken>,
  ) {
    this.accessTtlSeconds = Number(config.get('JWT_ACCESS_TTL_SECONDS', 900));
    this.refreshTtlMs = Number(config.get('REFRESH_TTL_DAYS', 30)) * DAY;
    this.frontendUrl = config.get('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, '');
  }

  async signup(dto: SignupDto) {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const user = await this.users.create({
      email: dto.email,
      passwordHash: await this.passwords.hash(dto.password),
      name: dto.name,
    });
    void this.sendVerificationEmail(user);
    return this.issueSession(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const valid = user
      ? await this.passwords.verify(dto.password, user.passwordHash)
      : await this.passwords.verifyDummy(dto.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    return this.issueSession(user);
  }

  /** Rotates the refresh token: the presented one is revoked and a new pair is issued. */
  async refresh(refreshToken: string) {
    const row = await this.refreshTokens.findOneBy({ tokenHash: sha256(refreshToken) });
    if (!row) throw new UnauthorizedException('Invalid refresh token');

    if (row.revokedAt) {
      // A rotated token was presented again: assume it leaked and end every session.
      await this.revokeAllSessions(row.userId);
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.expiresAt <= new Date()) throw new UnauthorizedException('Invalid refresh token');

    // Atomic, so two concurrent refreshes cannot both succeed.
    const claimed = await this.refreshTokens.update(
      { id: row.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (claimed.affected !== 1) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.users.findById(row.userId);
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    return this.issueSession(user);
  }

  async logout(refreshToken: string) {
    await this.refreshTokens.update(
      { tokenHash: sha256(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async verifyEmail(token: string) {
    const userId = await this.consumeToken(token, AuthTokenType.VerifyEmail);
    await this.users.markEmailVerified(userId);
  }

  async resendVerification(userId: string) {
    const user = await this.users.findById(userId);
    if (user && !user.emailVerifiedAt) await this.sendVerificationEmail(user);
  }

  /** Never reveals whether the email has an account. */
  async forgotPassword(email: string) {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    const token = await this.createEmailToken(user.id, AuthTokenType.ResetPassword);
    const link = `${this.frontendUrl}/auth/reset-password?token=${token}`;
    await this.mail
      .send({
        to: user.email,
        subject: 'Reset your password',
        text: `Reset your password: ${link}\n\nThis link expires in 1 hour. If you did not ask for this, ignore this email.`,
        html: `<p>Reset your password: <a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you did not ask for this, ignore this email.</p>`,
      })
      .catch((err: Error) => this.logger.error(`Password reset email failed: ${err.message}`));
  }

  async resetPassword(token: string, password: string) {
    const userId = await this.consumeToken(token, AuthTokenType.ResetPassword);
    await this.users.setPasswordHash(userId, await this.passwords.hash(password));
    await this.revokeAllSessions(userId);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.users.updateProfile(userId, { name: dto.name ?? null });
    return this.me(userId);
  }

  /** Checks the current password, then signs every other device out and returns a fresh session for this one. */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const found = await this.users.findById(userId);
    const user = found && (await this.users.findByEmailWithPassword(found.email));
    if (!user || !(await this.passwords.verify(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Your current password is not right');
    }
    await this.users.setPasswordHash(userId, await this.passwords.hash(newPassword));
    await this.revokeAllSessions(userId);
    return this.issueSession(user);
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.toPublic(user);
  }

  private toPublic(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: !!user.emailVerifiedAt,
    };
  }

  private async issueSession(user: User) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: this.accessTtlSeconds },
    );
    const refreshToken = newToken();
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      }),
    );
    return {
      user: this.toPublic(user),
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
    };
  }

  private revokeAllSessions(userId: string) {
    return this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Creates a single-use token and voids the user's older unused ones of the same type. */
  private async createEmailToken(userId: string, type: AuthTokenType) {
    await this.authTokens.update({ userId, type, usedAt: IsNull() }, { usedAt: new Date() });
    const token = newToken();
    await this.authTokens.save(
      this.authTokens.create({
        userId,
        type,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL[type]),
      }),
    );
    return token;
  }

  /** Marks the token used and returns its user. Fails if unknown, expired or already used. */
  private async consumeToken(token: string, type: AuthTokenType) {
    const now = new Date();
    const row = await this.authTokens.findOneBy({
      tokenHash: sha256(token),
      type,
      usedAt: IsNull(),
      expiresAt: MoreThan(now),
    });
    if (!row) throw new UnauthorizedException('This link is invalid or has expired');

    const claimed = await this.authTokens.update({ id: row.id, usedAt: IsNull() }, { usedAt: now });
    if (claimed.affected !== 1) throw new UnauthorizedException('This link is invalid or has expired');
    return row.userId;
  }

  private async sendVerificationEmail(user: User) {
    try {
      const token = await this.createEmailToken(user.id, AuthTokenType.VerifyEmail);
      const link = `${this.frontendUrl}/auth/verify-email?token=${token}`;
      await this.mail.send({
        to: user.email,
        subject: 'Verify your email',
        text: `Verify your email: ${link}\n\nThis link expires in 24 hours.`,
        html: `<p>Verify your email: <a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
      });
    } catch (err) {
      this.logger.error(`Verification email failed: ${(err as Error).message}`);
    }
  }
}
