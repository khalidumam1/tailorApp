import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { loadEnvironmentFile } from '../src/environment.js';
import { businessPermissions, platformPermissions } from '../src/permissions.js';

loadEnvironmentFile();

const prisma = new PrismaClient();

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed data cannot be created in production');
  }

  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const staffEmail = process.env.SEED_STAFF_EMAIL?.trim().toLowerCase();
  const staffPassword = process.env.SEED_STAFF_PASSWORD;
  const platformAdminEmail = process.env.SEED_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const platformAdminPassword = process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  if (!ownerEmail || !ownerPassword || ownerPassword.length < 16
    || !staffEmail || !staffPassword || staffPassword.length < 16
    || !platformAdminEmail || !platformAdminPassword || platformAdminPassword.length < 20) {
    throw new Error('Set owner/staff seed accounts and a platform admin account with unique passwords (16+ characters; platform 20+)');
  }
  for (const password of [ownerPassword, staffPassword, platformAdminPassword]) {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error("Seed passwords must not exceed bcrypt's 72-byte limit");
    }
  }
  if (new Set([ownerEmail, staffEmail, platformAdminEmail]).size !== 3) {
    throw new Error('Demo owner, staff and platform admin accounts must use different email addresses');
  }

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.upsert({
      where: { slug: 'karachi-demo-tailors' },
      update: {},
      create: { name: 'Karachi Demo Tailors', slug: 'karachi-demo-tailors', status: 'ACTIVE' },
    });
    await tx.business.updateMany({
      where: { id: business.id, orderSequence: { lt: 2 } },
      data: { orderSequence: 2 },
    });
    await tx.business.updateMany({
      where: { id: business.id, receiptSequence: { lt: 2 } },
      data: { receiptSequence: 2 },
    });
    const existingOwner = await tx.user.findUnique({
      where: { email: ownerEmail },
      include: { memberships: { select: { businessId: true, role: { select: { name: true } } } } },
    });
    if (existingOwner?.platformRole || existingOwner?.memberships.some((membership) =>
      membership.businessId !== business.id || membership.role.name !== 'Owner')) {
      throw new Error('The configured seed owner email is already associated with another role or business');
    }
    const owner = existingOwner ?? await tx.user.create({
      data: {
        email: ownerEmail,
        name: 'Demo Business Owner',
        passwordHash: await bcrypt.hash(ownerPassword, 12),
      },
    });
    if (!owner.active) {
      throw new Error('The configured seed owner account is inactive');
    }
    const role = await tx.role.upsert({
      where: { businessId_name: { businessId: business.id, name: 'Owner' } },
      update: {},
      create: { businessId: business.id, name: 'Owner', isSystem: true },
    });

    for (const [key, description] of businessPermissions) {
      const permission = await tx.permission.upsert({
        where: { key },
        update: { description },
        create: { key, description },
      });
      await tx.rolePermissionGrant.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    const existingStaff = await tx.user.findUnique({
      where: { email: staffEmail },
      include: { memberships: { select: { businessId: true, role: { select: { name: true } } } } },
    });
    if (existingStaff?.platformRole || existingStaff?.memberships.some((membership) =>
      membership.businessId !== business.id || membership.role.name !== 'Tailor')) {
      throw new Error('The configured seed staff email is already associated with another role or business');
    }
    const staff = existingStaff ?? await tx.user.create({
      data: {
        email: staffEmail,
        name: 'Demo Tailor',
        passwordHash: await bcrypt.hash(staffPassword, 12),
      },
    });
    if (!staff.active) throw new Error('The configured seed staff account is inactive');
    const staffRole = await tx.role.upsert({
      where: { businessId_name: { businessId: business.id, name: 'Tailor' } },
      update: {},
      create: { businessId: business.id, name: 'Tailor', isSystem: true },
    });
    const staffPermissionKeys = new Set([
      'customers:read',
      'customers:write',
      'measurements:read',
      'measurements:write',
      'orders:read',
      'orders:write',
      'orders:transition',
    ]);
    for (const [key] of businessPermissions.filter(([permissionKey]) => staffPermissionKeys.has(permissionKey))) {
      const permission = await tx.permission.findUniqueOrThrow({ where: { key } });
      await tx.rolePermissionGrant.upsert({
        where: { roleId_permissionId: { roleId: staffRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: staffRole.id, permissionId: permission.id },
      });
    }
    await tx.membership.upsert({
      where: { businessId_userId: { businessId: business.id, userId: staff.id } },
      update: { active: true, roleId: staffRole.id },
      create: { businessId: business.id, userId: staff.id, roleId: staffRole.id },
    });

    const existingPlatformAdmin = await tx.user.findUnique({
      where: { email: platformAdminEmail },
      include: { memberships: { select: { businessId: true } } },
    });
    if (existingPlatformAdmin
      && (existingPlatformAdmin.platformRole !== 'SUPER_ADMIN' || existingPlatformAdmin.memberships.length > 0)) {
      throw new Error('The configured platform admin account already has a different role or business membership');
    }
    const platformAdmin = existingPlatformAdmin ?? await tx.user.create({
      data: {
        email: platformAdminEmail,
        name: 'Demo Platform Super Admin',
        passwordHash: await bcrypt.hash(platformAdminPassword, 12),
        platformRole: 'SUPER_ADMIN',
      },
    });
    if (!platformAdmin.active) throw new Error('The configured platform admin account is inactive');
    for (const [key, description] of platformPermissions) {
      const permission = await tx.permission.upsert({
        where: { key },
        update: { description },
        create: { key, description },
      });
      await tx.platformPermissionGrant.upsert({
        where: { userId_permissionId: { userId: platformAdmin.id, permissionId: permission.id } },
        update: {},
        create: { userId: platformAdmin.id, permissionId: permission.id },
      });
    }

    await tx.membership.upsert({
      where: { businessId_userId: { businessId: business.id, userId: owner.id } },
      update: { active: true, roleId: role.id },
      create: { businessId: business.id, userId: owner.id, roleId: role.id },
    });

    const customer = await tx.customer.upsert({
      where: { businessId_phoneNormalized: { businessId: business.id, phoneNormalized: '923001234567' } },
      update: { name: 'Demo Customer', deletedAt: null },
      create: {
        businessId: business.id,
        name: 'Demo Customer',
        phone: '+923001234567',
        phoneNormalized: '923001234567',
        notes: 'Development seed record',
      },
    });
    const templateDefinitions = [
      { name: 'Shalwar Kameez', fields: ['chest', 'waist', 'sleeve', 'length', 'shalwar_length'] },
      { name: 'Shirt', fields: ['chest', 'neck', 'sleeve', 'length'] },
      { name: 'Pant', fields: ['waist', 'hip', 'inseam', 'outseam'] },
      { name: 'Waistcoat', fields: ['chest', 'waist', 'shoulder', 'length'] },
      { name: 'Suit', fields: ['chest', 'waist', 'shoulder', 'sleeve', 'inseam'] },
      { name: 'Custom', fields: ['length', 'chest', 'waist'] },
    ] as const;
    for (const definition of templateDefinitions) {
      await tx.garmentTemplate.upsert({
        where: { businessId_name: { businessId: business.id, name: definition.name } },
        update: {},
        create: {
          businessId: business.id,
          name: definition.name,
          fields: definition.fields.map((key) => ({
            key,
            label: key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
            unit: 'in',
          })),
        },
      });
    }
    const template = await tx.garmentTemplate.findFirstOrThrow({
      where: { businessId: business.id, name: 'Shalwar Kameez' },
    });
    let profile = await tx.measurementProfile.findFirst({
      where: { businessId: business.id, customerId: customer.id, garmentTemplateId: template.id },
    });
    if (!profile) {
      profile = await tx.measurementProfile.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          garmentTemplateId: template.id,
          revisions: {
            create: {
              version: 1,
              values: { chest: 40, waist: 36, sleeve: 24, length: 42 },
              notes: 'Initial demo measurements',
              measuredAt: new Date(),
            },
          },
        },
      });
    }

    let order = await tx.order.findUnique({
      where: { businessId_orderNumber: { businessId: business.id, orderNumber: 'KARACHI-000001' } },
    });
    if (!order) {
      order = await tx.order.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          createdById: owner.id,
          orderNumber: 'KARACHI-000001',
          promisedAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          total: new Prisma.Decimal('18000.00'),
          items: {
            create: {
              garmentName: 'Shalwar Kameez',
              quantity: 1,
              unitPrice: new Prisma.Decimal('18000.00'),
              measurementSnapshot: { template: 'Shalwar Kameez', revision: 1, chest: 40, waist: 36, sleeve: 24, length: 42 },
            },
          },
          statusHistory: { create: { toStatus: 'NEW', changedById: owner.id } },
        },
      });
    }

    await tx.payment.upsert({
      where: { businessId_idempotencyKey: { businessId: business.id, idempotencyKey: 'demo-advance-0001' } },
      update: {},
      create: {
        businessId: business.id,
        orderId: order.id,
        recordedById: owner.id,
        amount: new Prisma.Decimal('5000.00'),
        method: 'CASH',
        receiptNumber: 'KARACHI-R000001',
        idempotencyKey: 'demo-advance-0001',
      },
    });

    const secondCustomer = await tx.customer.upsert({
      where: { businessId_phoneNormalized: { businessId: business.id, phoneNormalized: '923211234567' } },
      update: { name: 'Repeat Demo Customer', deletedAt: null },
      create: {
        businessId: business.id,
        name: 'Repeat Demo Customer',
        phone: '0321 1234567',
        phoneNormalized: '923211234567',
      },
    });
    const secondOrder = await tx.order.upsert({
      where: { businessId_orderNumber: { businessId: business.id, orderNumber: 'KARACHI-000002' } },
      update: {},
      create: {
        businessId: business.id,
        customerId: secondCustomer.id,
        createdById: owner.id,
        orderNumber: 'KARACHI-000002',
        status: 'STITCHING',
        version: 4,
        promisedAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        total: new Prisma.Decimal('19000.00'),
        items: {
          create: {
            garmentName: 'Shirt',
            quantity: 2,
            unitPrice: new Prisma.Decimal('9500.00'),
            measurementSnapshot: {},
          },
        },
        statusHistory: {
          create: [
            { toStatus: 'NEW', changedById: owner.id },
            { fromStatus: 'NEW', toStatus: 'MEASUREMENT_CONFIRMED', changedById: owner.id },
            { fromStatus: 'MEASUREMENT_CONFIRMED', toStatus: 'CUTTING', changedById: staff.id },
            { fromStatus: 'CUTTING', toStatus: 'STITCHING', changedById: staff.id },
          ],
        },
      },
    });
    await tx.payment.upsert({
      where: { businessId_idempotencyKey: { businessId: business.id, idempotencyKey: 'demo-advance-0002' } },
      update: {},
      create: {
        businessId: business.id,
        orderId: secondOrder.id,
        recordedById: owner.id,
        amount: new Prisma.Decimal('7000.00'),
        method: 'DIGITAL',
        receiptNumber: 'KARACHI-R000002',
        idempotencyKey: 'demo-advance-0002',
      },
    });

    return {
      business: business.name,
      owner: owner.email,
      staff: staff.email,
      platformAdmin: platformAdmin.email,
      customers: [customer.name, secondCustomer.name],
      orders: [order.orderNumber, secondOrder.orderNumber],
    };
  }, { maxWait: 20_000, timeout: 120_000 });

  console.info('Demo records ready:', result);
}

seed()
  .catch((error: unknown) => {
    console.error('Demo seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
