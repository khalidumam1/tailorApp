import { OrderStatus, Prisma } from '@prisma/client';

const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ['MEASUREMENT_CONFIRMED', 'CANCELLED'],
  MEASUREMENT_CONFIRMED: ['CUTTING', 'CANCELLED'],
  CUTTING: ['STITCHING', 'CANCELLED'],
  STITCHING: ['FINISHING', 'CANCELLED'],
  FINISHING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['COLLECTED', 'CANCELLED'],
  COLLECTED: [],
  CANCELLED: [],
};

export const STAGE_KEY_ALIASES: Record<string, readonly string[]> = {
  FINISHING: ['FITTING'],
  FITTING: ['FINISHING'],
  READY_FOR_PICKUP: ['READY'],
  READY: ['READY_FOR_PICKUP'],
  COLLECTED: ['DELIVERED', 'COMPLETED'],
  DELIVERED: ['COLLECTED', 'COMPLETED'],
  COMPLETED: ['COLLECTED', 'DELIVERED'],
};

export type WorkflowStageLike = {
  id: string;
  key: string;
  label: string;
  isInitial: boolean;
  isTerminal: boolean;
  notificationTrigger?: string | null;
};

export function resolveCurrentWorkflowStage<T extends { id: string; key: string; isInitial: boolean }>(
  stages: readonly T[],
  existing: {
    workflowStageId?: string | null;
    workflowStageKey?: string | null;
    status: OrderStatus;
    currentWorkflowStage?: T | null;
  },
): T | undefined {
  if (existing.workflowStageId) {
    const byId = stages.find((stage) => stage.id === existing.workflowStageId);
    if (byId) return byId;
  }
  const candidateKeys = [
    existing.workflowStageKey,
    existing.currentWorkflowStage?.key,
    existing.status,
  ].filter((key): key is string => Boolean(key));
  for (const key of candidateKeys) {
    const byKey = stages.find((stage) => stage.key === key);
    if (byKey) return byKey;
    for (const alias of STAGE_KEY_ALIASES[key] ?? []) {
      const byAlias = stages.find((stage) => stage.key === alias);
      if (byAlias) return byAlias;
    }
  }
  if (existing.currentWorkflowStage) return existing.currentWorkflowStage;
  if (existing.status === 'NEW') {
    const initial = stages.find((stage) => stage.isInitial);
    if (initial) return initial;
  }
  return undefined;
}

export function stageToOrderStatus(
  stage: {
    key: string;
    isInitial: boolean;
    isTerminal: boolean;
    notificationTrigger?: string | null;
    actions?: Prisma.JsonValue | string[];
  },
  currentStatus: OrderStatus = 'NEW',
): OrderStatus {
  const key = stage.key.toUpperCase();
  if (key === 'NEW') return 'NEW';
  if (key === 'MEASUREMENT_CONFIRMED') return 'MEASUREMENT_CONFIRMED';
  if (key === 'CUTTING') return 'CUTTING';
  if (key === 'STITCHING') return 'STITCHING';
  if (key === 'FINISHING' || key === 'FITTING') return 'FINISHING';
  if (key === 'READY_FOR_PICKUP' || key === 'READY') return 'READY_FOR_PICKUP';
  if (key === 'COLLECTED' || key === 'DELIVERED' || key === 'COMPLETED') return 'COLLECTED';
  if (key === 'CANCELLED') return 'CANCELLED';
  if (stage.isInitial) return 'NEW';
  if (stage.isTerminal) return 'COLLECTED';
  if (
    stage.notificationTrigger === 'ORDER_READY'
    || (Array.isArray(stage.actions) && stage.actions.includes('ORDER_READY'))
  ) {
    return 'READY_FOR_PICKUP';
  }
  return currentStatus === 'NEW' ? 'MEASUREMENT_CONFIRMED' : currentStatus;
}

export function isRetryableOrderTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2034' || error.code === 'P2028')
  );
}

export function isAllowedOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function businessRoleKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '');
}

