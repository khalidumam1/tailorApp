import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { calculateNetPaid, calculateOutstanding } from '../src/domain/finance.js';
import {
  businessRoleKey,
  isAllowedOrderTransition,
  isRetryableOrderTransactionError,
  resolveCurrentWorkflowStage,
  stageToOrderStatus,
} from '../src/domain/orders.js';

test('financial balance arithmetic uses decimal values including reversals', () => {
  const ledger = [
    { kind: 'PAYMENT' as const, amount: '0.10' },
    { kind: 'PAYMENT' as const, amount: '0.20' },
    { kind: 'REVERSAL' as const, amount: '0.10' },
  ];
  assert.equal(calculateNetPaid(ledger).toFixed(2), '0.20');
  assert.equal(calculateOutstanding('100.00', ledger).toFixed(2), '99.80');
});

test('workflow transitions allow only the next stage or cancellation before terminal states', () => {
  assert.equal(isAllowedOrderTransition('NEW', 'MEASUREMENT_CONFIRMED'), true);
  assert.equal(isAllowedOrderTransition('STITCHING', 'READY_FOR_PICKUP'), false);
  assert.equal(isAllowedOrderTransition('READY_FOR_PICKUP', 'COLLECTED'), true);
  assert.equal(isAllowedOrderTransition('COLLECTED', 'CANCELLED'), false);
  assert.equal(isAllowedOrderTransition('CANCELLED', 'NEW'), false);
});

test('business role keys normalize to stable workflow keys', () => {
  assert.equal(businessRoleKey('Quality Control'), 'quality_control');
  assert.equal(businessRoleKey(' Owner '), 'owner');
});

test('resolveCurrentWorkflowStage resolves 1st-level and aliased workflow stages resiliently', () => {
  const stages = [
    { id: 'stage-intake', key: 'INTAKE', label: 'Intake', isInitial: true, isTerminal: false, notificationTrigger: null },
    { id: 'stage-fitting', key: 'FITTING', label: 'Fitting', isInitial: false, isTerminal: false, notificationTrigger: null },
    { id: 'stage-ready', key: 'READY', label: 'Ready', isInitial: false, isTerminal: false, notificationTrigger: 'ORDER_READY' },
    { id: 'stage-delivered', key: 'DELIVERED', label: 'Delivered', isInitial: false, isTerminal: true, notificationTrigger: null },
  ];

  // Order created at 1st level with status NEW and null workflowStageId/workflowStageKey resolves to initial stage
  assert.equal(
    resolveCurrentWorkflowStage(stages, {
      workflowStageId: null,
      workflowStageKey: null,
      status: 'NEW',
    })?.id,
    'stage-intake',
  );

  // Order with stale workflowStageId falls back to workflowStageKey or initial stage
  assert.equal(
    resolveCurrentWorkflowStage(stages, {
      workflowStageId: 'stale-stage-id',
      workflowStageKey: 'NEW',
      status: 'NEW',
    })?.id,
    'stage-intake',
  );

  // Stage aliases map legacy statuses to template stage keys
  assert.equal(
    resolveCurrentWorkflowStage(stages, {
      workflowStageId: null,
      workflowStageKey: 'FINISHING',
      status: 'FINISHING',
    })?.id,
    'stage-fitting',
  );
  assert.equal(
    resolveCurrentWorkflowStage(stages, {
      workflowStageId: null,
      workflowStageKey: 'READY_FOR_PICKUP',
      status: 'READY_FOR_PICKUP',
    })?.id,
    'stage-ready',
  );
  assert.equal(
    resolveCurrentWorkflowStage(stages, {
      workflowStageId: null,
      workflowStageKey: 'COLLECTED',
      status: 'COLLECTED',
    })?.id,
    'stage-delivered',
  );
});

test('stageToOrderStatus maps custom and standard workflow stages to OrderStatus', () => {
  assert.equal(
    stageToOrderStatus(
      { key: 'INTAKE', isInitial: true, isTerminal: false, notificationTrigger: null },
      'NEW',
    ),
    'NEW',
  );
  assert.equal(
    stageToOrderStatus(
      { key: 'DIAGNOSIS', isInitial: false, isTerminal: false, notificationTrigger: null },
      'NEW',
    ),
    'MEASUREMENT_CONFIRMED',
  );
  assert.equal(
    stageToOrderStatus(
      { key: 'READY', isInitial: false, isTerminal: false, notificationTrigger: 'ORDER_READY' },
      'STITCHING',
    ),
    'READY_FOR_PICKUP',
  );
  assert.equal(
    stageToOrderStatus(
      { key: 'COMPLETED', isInitial: false, isTerminal: true, notificationTrigger: null },
      'READY_FOR_PICKUP',
    ),
    'COLLECTED',
  );
  assert.equal(
    stageToOrderStatus(
      { key: 'CANCELLED', isInitial: false, isTerminal: true, notificationTrigger: null },
      'NEW',
    ),
    'CANCELLED',
  );
});

test('isRetryableOrderTransactionError identifies P2034 and P2028 Prisma transaction errors', () => {
  const p2034 = new Prisma.PrismaClientKnownRequestError('Write conflict', {
    code: 'P2034',
    clientVersion: '5.22.0',
  });
  const p2028 = new Prisma.PrismaClientKnownRequestError('Transaction already closed', {
    code: 'P2028',
    clientVersion: '5.22.0',
  });
  const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
  assert.equal(isRetryableOrderTransactionError(p2034), true);
  assert.equal(isRetryableOrderTransactionError(p2028), true);
  assert.equal(isRetryableOrderTransactionError(p2002), false);
  assert.equal(isRetryableOrderTransactionError(new Error('Other')), false);
});

