import { OrderStatus } from '@prisma/client';

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

export function isAllowedOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function businessRoleKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '');
}
