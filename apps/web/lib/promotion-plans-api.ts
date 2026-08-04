import { apiRequest } from './api-client';

export type PromotionPlanType = 'top_up_bonus' | 'course_bundle';
export type PaymentMethod = 'cash' | 'transfer' | 'line_pay' | 'credit_card';

export interface PromotionPlanItem {
  id: number;
  sessions: number;
  serviceItem: { id: number; name: string; price: number };
}

export interface PromotionPlan {
  id: number;
  storeId: number;
  name: string;
  type: PromotionPlanType;
  price: number;
  bonusAmount: number | null;
  isActive: boolean;
  createdAt: string;
  items: PromotionPlanItem[];
}

export interface CreatePromotionPlanInput {
  name: string;
  type: PromotionPlanType;
  price: number;
  bonusAmount?: number;
  items?: { serviceItemId: number; sessions: number }[];
}

export interface PurchaseResult {
  planId: number;
  planName: string;
  type: PromotionPlanType;
  price: number;
}

export function listPromotionPlans(storeId: number): Promise<PromotionPlan[]> {
  return apiRequest<PromotionPlan[]>(`/stores/${storeId}/promotion-plans`);
}

export function createPromotionPlan(storeId: number, input: CreatePromotionPlanInput): Promise<PromotionPlan> {
  return apiRequest<PromotionPlan>(`/stores/${storeId}/promotion-plans`, { method: 'POST', json: input });
}

export function updatePromotionPlan(
  storeId: number,
  planId: number,
  input: { name?: string; price?: number; bonusAmount?: number; items?: { serviceItemId: number; sessions: number }[] },
): Promise<PromotionPlan> {
  return apiRequest<PromotionPlan>(`/stores/${storeId}/promotion-plans/${planId}`, { method: 'PATCH', json: input });
}

export function deletePromotionPlan(storeId: number, planId: number): Promise<void> {
  return apiRequest<void>(`/stores/${storeId}/promotion-plans/${planId}`, { method: 'DELETE' });
}

export function purchasePromotionPlan(
  storeId: number,
  planId: number,
  dto: { customerId: number; staffId?: number; paymentMethod: PaymentMethod },
): Promise<PurchaseResult> {
  return apiRequest<PurchaseResult>(`/stores/${storeId}/promotion-plans/${planId}/purchase`, {
    method: 'POST',
    json: dto,
  });
}
