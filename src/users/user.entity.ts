import {
  Column,
  CreateDateColumn,
  Entity,
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

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Always stored lowercase and trimmed.
  @Column({ type: 'varchar', length: 254, unique: true })
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
