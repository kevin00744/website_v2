import { apiRequest, apiRequestBlob } from './api-client';

export interface ConsentSection {
  heading: string;
  paragraphs: string[];
  /** 這段後面要不要放「是，了解。客戶簽名」欄位 */
  requiresSignature: boolean;
}

export interface ConsentTemplateSummary {
  id: number;
  version: string;
  title: string;
  sectionCount: number;
  isActive: boolean;
  createdAt: string;
  /** 已有多少位顧客簽過這個版本 */
  signedCount: number;
}

export interface ConsentTemplate {
  id: number;
  version: string;
  title: string;
  sections: ConsentSection[];
  isActive: boolean;
  createdAt: string;
}

export function listConsentTemplates(): Promise<ConsentTemplateSummary[]> {
  return apiRequest<ConsentTemplateSummary[]>('/consent-templates');
}

export function getConsentTemplate(id: number): Promise<ConsentTemplate> {
  return apiRequest<ConsentTemplate>(`/consent-templates/${id}`);
}

/** 存成新版本並設為使用中 */
export function saveConsentTemplate(input: { title: string; sections: ConsentSection[] }): Promise<ConsentTemplate> {
  return apiRequest<ConsentTemplate>('/consent-templates', { method: 'POST', json: input });
}

export function activateConsentTemplate(id: number): Promise<{ id: number; version: string; isActive: boolean }> {
  return apiRequest(`/consent-templates/${id}/activate`, { method: 'POST' });
}

export function previewConsentDraft(input: { title: string; sections: ConsentSection[] }): Promise<Blob> {
  return apiRequestBlob('/consent-templates/preview', { method: 'POST', json: input });
}

export function previewConsentTemplate(id: number): Promise<Blob> {
  return apiRequestBlob(`/consent-templates/${id}/preview`);
}
