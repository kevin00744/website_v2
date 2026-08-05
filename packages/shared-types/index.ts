export type Role = 'system_admin' | 'general_agent' | 'admin' | 'editor' | 'dealer' | 'manager' | 'accountant' | 'staff';
export type Region = 'A' | 'B' | 'C';
export type DocumentType = 'disclaimer' | 'id_document';
export type SignerRole = 'customer' | 'staff';

export * from './customer';
export * from './auth';
export * from './store';
export * from './user';
export * from './inventory';
export * from './chat';
export * from './contact';
