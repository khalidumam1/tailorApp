import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { loadEnvironmentFile } from '../src/environment.js';
import { businessPermissions, platformPermissions } from '../src/permissions.js';
import { customFieldValueData } from '../src/domain/custom-fields.js';

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
    const tailorTemplate = await tx.businessTemplate.findUniqueOrThrow({
      where: { key: 'tailor' },
      select: { id: true },
    });
    const business = await tx.business.upsert({
      where: { slug: 'karachi-demo-tailors' },
      update: { name: 'Tailor Demo', templateId: tailorTemplate.id, businessType: 'TAILOR' },
      create: {
        name: 'Tailor Demo',
        slug: 'karachi-demo-tailors',
        businessType: 'TAILOR',
        templateId: tailorTemplate.id,
        status: 'ACTIVE',
      },
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
      include: { memberships: { select: { business: { select: { slug: true } }, role: { select: { name: true } } } } },
    });
    const demoSlugs = new Set([
      'karachi-demo-tailors',
      'furniture-demo',
      'carpenter-demo',
      'auto-workshop-demo',
      'printing-demo',
    ]);
    if (existingOwner?.platformRole || existingOwner?.memberships.some((membership) =>
      !demoSlugs.has(membership.business.slug) || membership.role.name !== 'Owner')) {
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

    const demoConfigurations = [
      {
        key: 'furniture',
        name: 'Furniture Demo',
        slug: 'furniture-demo',
        businessType: 'FURNITURE',
        itemTypeKey: 'furniture_item',
        itemName: 'Two-seat sofa',
        unit: 'piece',
        price: '85000.00',
        dueDays: 12,
        orderNumber: 'FURN-000001',
        receiptNumber: 'FURN-R000001',
        customValues: { dimensions: 210, material: 'Oak' },
        stages: [
          ['new', 'New'], ['design', 'Design'], ['material_confirmation', 'Material Confirmation'],
          ['production', 'Production'], ['finishing', 'Finishing'], ['ready', 'Ready'], ['completed', 'Completed'],
        ],
      },
      {
        key: 'carpenter',
        name: 'Carpenter Demo',
        slug: 'carpenter-demo',
        businessType: 'CARPENTER',
        itemTypeKey: 'project',
        itemName: 'Oak dining table',
        unit: 'project',
        price: '62000.00',
        dueDays: 18,
        orderNumber: 'CARP-000001',
        receiptNumber: 'CARP-R000001',
        customValues: { dimensions: 180 },
        stages: [
          ['new', 'New'], ['measurement', 'Measurement'], ['material', 'Material'],
          ['production', 'Production'], ['installation', 'Installation'], ['completed', 'Completed'],
        ],
      },
      {
        key: 'auto-workshop',
        name: 'Auto Workshop Demo',
        slug: 'auto-workshop-demo',
        businessType: 'AUTO-WORKSHOP',
        itemTypeKey: 'vehicle',
        itemName: 'Honda Civic repair job',
        unit: 'job',
        price: '32000.00',
        dueDays: 3,
        orderNumber: 'AUTO-000001',
        receiptNumber: 'AUTO-R000001',
        customValues: {
          vehicle: 'Honda Civic · demo registration ABC-123',
          inspection_notes: 'Inspect engine, brakes, and suspension.',
          registration: 'ABC-123',
          service_type: 'Repair',
        },
        stages: [
          ['inspection', 'Inspection'], ['estimate', 'Estimate'], ['approved', 'Approved'],
          ['repair', 'Repair'], ['quality_check', 'Quality Check'], ['ready', 'Ready'], ['completed', 'Completed'],
        ],
      },
      {
        key: 'printing',
        name: 'Printing Demo',
        slug: 'printing-demo',
        businessType: 'PRINTING',
        itemTypeKey: 'print_product',
        itemName: 'A5 product flyer',
        unit: 'bundle',
        price: '14500.00',
        dueDays: 5,
        orderNumber: 'PRINT-000001',
        receiptNumber: 'PRINT-R000001',
        customValues: {
          specifications: 'A5, 4-color, 170gsm glossy, 500 copies.',
          size: 'A5',
          material: 'Glossy paper',
          quantity: 500,
          finishing: 'Lamination',
        },
        stages: [
          ['new', 'New'], ['design', 'Design'], ['production', 'Production'],
          ['quality_check', 'Quality Check'], ['ready', 'Ready'], ['completed', 'Completed'],
        ],
      },
    ] as const;
    const disabledNotificationTemplates = {
      ORDER_CREATED: { enabled: false, body: 'Order {{order.number}} for {{item.name}} was received by {{business.name}}.' },
      PAYMENT_RECEIVED: { enabled: false, body: 'Payment received for order {{order.number}}. Balance: {{order.balance}}.' },
      ORDER_READY: { enabled: false, body: '{{item.name}} for order {{order.number}} is ready at {{business.name}}.' },
      STATUS_CHANGED: { enabled: false, body: 'Order {{order.number}} is now {{order.status}}.' },
      PAYMENT_DUE: { enabled: false, body: 'Payment due for order {{order.number}}. Balance: {{order.balance}}.' },
      SUBSCRIPTION_EXPIRING: {
        enabled: false,
        body: '{{recipient.name}}, your {{subscription.plan}} plan expires {{subscription.endsAt}} in {{subscription.daysRemaining}} days.',
      },
    };
    for (const [index, definition] of demoConfigurations.entries()) {
      const template = await tx.businessTemplate.findUniqueOrThrow({
        where: { key: definition.key },
        include: { fields: { where: { active: true } }, workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
      });
      const demoBusiness = await tx.business.upsert({
        where: { slug: definition.slug },
        update: { name: definition.name, businessType: definition.businessType, templateId: template.id, status: 'ACTIVE' },
        create: {
          name: definition.name,
          slug: definition.slug,
          businessType: definition.businessType,
          templateId: template.id,
          status: 'ACTIVE',
        },
      });
      let workflowStages = await tx.workflowStage.findMany({
        where: { businessId: demoBusiness.id, active: true },
        orderBy: { sortOrder: 'asc' },
      });
      if (!workflowStages.length) {
        const readyKey = definition.stages.some(([key]) => key === 'ready') ? 'ready' : undefined;
        workflowStages = [];
        for (const [sortOrder, [key, label]] of definition.stages.entries()) {
          workflowStages.push(await tx.workflowStage.create({
            data: {
              businessId: demoBusiness.id,
              key,
              label,
              sortOrder,
              isInitial: sortOrder === 0,
              isTerminal: sortOrder === definition.stages.length - 1,
              actions: key === readyKey ? ['ORDER_READY'] : [],
            },
          }));
        }
        await tx.workflowTransition.createMany({
          data: workflowStages.slice(0, -1).map((stage, index) => ({
            businessId: demoBusiness.id,
            fromStageId: stage.id,
            toStageId: workflowStages[index + 1]!.id,
            allowedRoleKeys: [],
            actions: workflowStages[index + 1]!.key === readyKey ? ['ORDER_READY'] : [],
          })),
        });
      }
      const demoRole = await tx.role.upsert({
        where: { businessId_name: { businessId: demoBusiness.id, name: 'Owner' } },
        update: { isSystem: true },
        create: { businessId: demoBusiness.id, name: 'Owner', isSystem: true },
      });
      for (const [permissionKey, description] of businessPermissions) {
        const permission = await tx.permission.upsert({
          where: { key: permissionKey },
          update: { description },
          create: { key: permissionKey, description },
        });
        await tx.rolePermissionGrant.upsert({
          where: { roleId_permissionId: { roleId: demoRole.id, permissionId: permission.id } },
          update: {},
          create: { roleId: demoRole.id, permissionId: permission.id },
        });
      }
      await tx.membership.upsert({
        where: { businessId_userId: { businessId: demoBusiness.id, userId: owner.id } },
        update: { roleId: demoRole.id, active: true },
        create: { businessId: demoBusiness.id, userId: owner.id, roleId: demoRole.id },
      });
      const existingConfiguration = await tx.businessConfiguration.findUnique({
        where: { businessId: demoBusiness.id },
        select: { notificationTemplates: true },
      });
      if (existingConfiguration) {
        const currentTemplates = existingConfiguration.notificationTemplates
          && typeof existingConfiguration.notificationTemplates === 'object'
          && !Array.isArray(existingConfiguration.notificationTemplates)
          ? existingConfiguration.notificationTemplates
          : {};
        if (!Object.hasOwn(currentTemplates, 'SUBSCRIPTION_EXPIRING')) {
          await tx.businessConfiguration.update({
            where: { businessId: demoBusiness.id },
            data: {
              notificationTemplates: {
                ...currentTemplates,
                SUBSCRIPTION_EXPIRING: disabledNotificationTemplates.SUBSCRIPTION_EXPIRING,
              },
              version: { increment: 1 },
            },
          });
        }
      }
      await tx.businessConfiguration.upsert({
        where: { businessId: demoBusiness.id },
        update: {},
        create: {
          businessId: demoBusiness.id,
          enabledModules: template.enabledModules,
          paymentMethods: template.paymentMethods,
          dashboardWidgets: template.dashboardWidgets,
          notificationTemplates: disabledNotificationTemplates,
          publishedAt: new Date(),
        },
      });
      const customerPhone = `9230012345${String(index + 1).padStart(2, '0')}`;
      const demoCustomer = await tx.customer.upsert({
        where: { businessId_phoneNormalized: { businessId: demoBusiness.id, phoneNormalized: customerPhone } },
        update: { name: `Demo ${template.name} Customer`, deletedAt: null },
        create: {
          businessId: demoBusiness.id,
          name: `Demo ${template.name} Customer`,
          phone: `+${customerPhone}`,
          phoneNormalized: customerPhone,
          notes: `${template.name} demo workspace customer`,
        },
      });
      const item = await tx.businessItem.upsert({
        where: { businessId_typeKey_name: { businessId: demoBusiness.id, typeKey: definition.itemTypeKey, name: definition.itemName } },
        update: { unit: definition.unit, unitPrice: new Prisma.Decimal(definition.price), active: true },
        create: {
          businessId: demoBusiness.id,
          typeKey: definition.itemTypeKey,
          name: definition.itemName,
          description: `Sample ${template.name.toLowerCase()} catalog entry`,
          unit: definition.unit,
          unitPrice: new Prisma.Decimal(definition.price),
        },
      });
      const initialStage = workflowStages.find((stage) => stage.isInitial);
      if (!initialStage) throw new Error(`Template ${definition.key} has no initial workflow stage`);
      const fieldByKey = new Map(template.fields.map((field) => [field.key, field]));
      const orderValues = Object.entries(definition.customValues)
        .flatMap(([key, value]) => {
          const field = fieldByKey.get(key);
          if (!field || field.screen === 'order-item') return [];
          return [customFieldValueData({
            fieldDefinitionId: field.id,
            key,
            type: field.type,
            value: field.type === 'NUMBER' || field.type === 'CURRENCY' || field.type === 'MEASUREMENT'
              ? Number(value) : String(value),
          })];
        });
      const itemValues = Object.entries(definition.customValues)
        .flatMap(([key, value]) => {
          const field = fieldByKey.get(key);
          if (!field || field.screen !== 'order-item') return [];
          return [customFieldValueData({
            fieldDefinitionId: field.id,
            key,
            type: field.type,
            value: field.type === 'NUMBER' || field.type === 'CURRENCY' || field.type === 'MEASUREMENT'
              ? Number(value) : String(value),
          })];
        });
      const demoOrder = await tx.order.upsert({
        where: { businessId_orderNumber: { businessId: demoBusiness.id, orderNumber: definition.orderNumber } },
        update: {},
        create: {
          businessId: demoBusiness.id,
          customerId: demoCustomer.id,
          createdById: owner.id,
          orderNumber: definition.orderNumber,
          status: 'NEW',
          workflowStageId: initialStage.id,
          workflowStageKey: initialStage.key,
          promisedAt: new Date(Date.now() + definition.dueDays * 86400000),
          total: new Prisma.Decimal(definition.price),
          ...(orderValues.length ? { customFieldValues: { create: orderValues } } : {}),
          items: {
            create: {
              itemId: item.id,
              itemTypeKey: definition.itemTypeKey,
              itemName: definition.itemName,
              garmentName: definition.itemName,
              quantity: 1,
              unitPrice: new Prisma.Decimal(definition.price),
              measurementSnapshot: definition.customValues,
              ...(itemValues.length ? { customFieldValues: { create: itemValues } } : {}),
            },
          },
          statusHistory: { create: { toStatus: 'NEW', changedById: owner.id, note: 'Demo order created' } },
          workflowHistory: {
            create: {
              toStageId: initialStage.id,
              toStageKey: initialStage.key,
              toStageLabel: initialStage.label,
              changedById: owner.id,
              note: 'Demo order created',
            },
          },
        },
      });
      await tx.payment.upsert({
        where: { businessId_idempotencyKey: { businessId: demoBusiness.id, idempotencyKey: `demo-payment-${definition.key}` } },
        update: {},
        create: {
          businessId: demoBusiness.id,
          orderId: demoOrder.id,
          recordedById: owner.id,
          amount: new Prisma.Decimal((Number(definition.price) * 0.25).toFixed(2)),
          method: 'CASH',
          receiptNumber: definition.receiptNumber,
          idempotencyKey: `demo-payment-${definition.key}`,
        },
      });
    }

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
    const tailorCatalogItem = await tx.businessItem.upsert({
      where: {
        businessId_typeKey_name: {
          businessId: business.id,
          typeKey: 'garment',
          name: 'Shalwar Kameez',
        },
      },
      update: { unit: 'garment', unitPrice: new Prisma.Decimal('18000.00'), active: true },
      create: {
        businessId: business.id,
        typeKey: 'garment',
        name: 'Shalwar Kameez',
        unit: 'garment',
        unitPrice: new Prisma.Decimal('18000.00'),
      },
    });
    const shirtCatalogItem = await tx.businessItem.upsert({
      where: {
        businessId_typeKey_name: {
          businessId: business.id,
          typeKey: 'garment',
          name: 'Shirt',
        },
      },
      update: { unit: 'garment', unitPrice: new Prisma.Decimal('9500.00'), active: true },
      create: {
        businessId: business.id,
        typeKey: 'garment',
        name: 'Shirt',
        unit: 'garment',
        unitPrice: new Prisma.Decimal('9500.00'),
      },
    });
    const tailorInitialStage = await tx.workflowStage.findFirstOrThrow({
      where: { templateId: tailorTemplate.id, key: 'NEW', active: true },
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
          workflowStageId: tailorInitialStage.id,
          workflowStageKey: tailorInitialStage.key,
          items: {
            create: {
              itemId: tailorCatalogItem.id,
              itemTypeKey: 'garment',
              itemName: 'Shalwar Kameez',
              garmentName: 'Shalwar Kameez',
              quantity: 1,
              unitPrice: new Prisma.Decimal('18000.00'),
              measurementSnapshot: { template: 'Shalwar Kameez', revision: 1, chest: 40, waist: 36, sleeve: 24, length: 42 },
            },
          },
          statusHistory: { create: { toStatus: 'NEW', changedById: owner.id } },
          workflowHistory: {
            create: {
              toStageId: tailorInitialStage.id,
              toStageKey: tailorInitialStage.key,
              toStageLabel: tailorInitialStage.label,
              changedById: owner.id,
              note: 'Demo order created',
            },
          },
        },
      });
    }
    await tx.order.updateMany({
      where: { id: order.id, businessId: business.id, status: 'NEW', workflowStageId: null },
      data: { workflowStageId: tailorInitialStage.id, workflowStageKey: tailorInitialStage.key },
    });
    const tailorOrderItem = await tx.orderItem.findFirstOrThrow({
      where: { orderId: order.id, businessId: business.id },
    });
    await tx.orderItem.update({
      where: { id: tailorOrderItem.id },
      data: {
        itemId: tailorCatalogItem.id,
        itemTypeKey: 'garment',
        itemName: tailorOrderItem.garmentName,
      },
    });
    const tailorOrderFields = await tx.customFieldDefinition.findMany({
      where: { templateId: tailorTemplate.id, module: 'orders', screen: 'order-item', active: true },
    });
    const tailorSampleValues = new Map<string, string | number>([
      ['garment_name', tailorOrderItem.garmentName],
      ['quantity', tailorOrderItem.quantity],
    ]);
    const tailorFieldValues = tailorOrderFields.flatMap((field) => {
      const value = tailorSampleValues.get(field.key);
      if (value === undefined) return [];
      return [{
        businessId: business.id,
        orderItemId: tailorOrderItem.id,
        ...customFieldValueData({
          fieldDefinitionId: field.id,
          key: field.key,
          type: field.type,
          value: field.type === 'NUMBER' || field.type === 'CURRENCY' || field.type === 'MEASUREMENT'
            ? Number(value) : String(value),
        }),
      }];
    });
    if (tailorFieldValues.length) {
      await tx.customFieldValue.createMany({ data: tailorFieldValues, skipDuplicates: true });
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
    const stitchingStage = await tx.workflowStage.findFirst({
      where: { templateId: tailorTemplate.id, key: 'STITCHING', active: true },
    });
    if (stitchingStage) {
      await tx.order.updateMany({
        where: { id: secondOrder.id, businessId: business.id, workflowStageId: null },
        data: { workflowStageId: stitchingStage.id, workflowStageKey: stitchingStage.key },
      });
      const historyExists = await tx.orderWorkflowHistory.findFirst({
        where: { orderId: secondOrder.id, businessId: business.id },
        select: { id: true },
      });
      if (!historyExists) {
        await tx.orderWorkflowHistory.create({
          data: {
            businessId: business.id,
            orderId: secondOrder.id,
            toStageId: stitchingStage.id,
            toStageKey: stitchingStage.key,
            toStageLabel: stitchingStage.label,
            changedById: staff.id,
            note: 'Demo workflow history',
          },
        });
      }
    }
    const tailorSecondItem = await tx.orderItem.findFirstOrThrow({
      where: { orderId: secondOrder.id, businessId: business.id },
    });
    await tx.orderItem.update({
      where: { id: tailorSecondItem.id },
      data: {
        itemId: tailorSecondItem.garmentName === 'Shirt' ? shirtCatalogItem.id : tailorCatalogItem.id,
        itemTypeKey: 'garment',
        itemName: tailorSecondItem.garmentName,
      },
    });
    const tailorSecondFieldValues = tailorOrderFields.flatMap((field) => {
      const value = tailorSampleValues.get(field.key);
      if (value === undefined) return [];
      return [{
        businessId: business.id,
        orderItemId: tailorSecondItem.id,
        ...customFieldValueData({
          fieldDefinitionId: field.id,
          key: field.key,
          type: field.type,
          value: field.type === 'NUMBER' || field.type === 'CURRENCY' || field.type === 'MEASUREMENT'
            ? Number(value) : String(value),
        }),
      }];
    });
    if (tailorSecondFieldValues.length) {
      await tx.customFieldValue.createMany({ data: tailorSecondFieldValues, skipDuplicates: true });
    }
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
      businesses: ['Tailor Demo', ...demoConfigurations.map((definition) => definition.name)],
      ownerLogin: 'SEED_OWNER_EMAIL',
      staffLogin: 'SEED_STAFF_EMAIL',
      platformAdminLogin: 'SEED_PLATFORM_ADMIN_EMAIL',
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
