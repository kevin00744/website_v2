export type Role = 'system_admin' | 'admin' | 'editor' | 'dealer' | 'manager';
export type Region = 'north' | 'central' | 'south';
export type DocumentType = 'disclaimer' | 'id_document';
export type SignerRole = 'customer' | 'staff';

export * from './customer';
export * from './auth';
export * from './store';
export * from './user';
export * from './inventory';
export * from './chat';
export * from './cms';
export * from './products';
export * from './contact';
