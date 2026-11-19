import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  Customer = 'customer',
  Admin = 'admin',
  Superadmin = 'superadmin',
  Designer = 'designer',
  Dealer = 'dealer',
}

/** Roles allowed into the admin panel (and the admin APIs, via RolesGuard). */
export const ADMIN_PANEL_ROLES: readonly UserRole[] = [UserRole.Admin, UserRole.Superadmin];

/** Several people may sign up with one address; only the first to verify it keeps it. */
@Index('UQ_users_verified_email', ['email'], { unique: true, where: '"emailVerifiedAt" IS NOT NULL' })
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Always stored lowercase and trimmed.
  @Index()
  @Column({ type: 'varchar', length: 254 })
  email: string;

  // Excluded from queries by default; load it explicitly where it is needed.
  @Column({ type: 'text', select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.Customer })
  role: UserRole;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
