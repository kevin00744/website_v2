/**
 * 開發環境固定一個預設值，避免每個人 docker-compose up 起來 JWT_SECRET 沒設就直接掛掉；
 * 正式環境部署時必須在環境變數覆寫這個值（見 docker-compose.yml 的註解）。
 */
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-in-production';

export const JWT_EXPIRES_IN = '12h';
