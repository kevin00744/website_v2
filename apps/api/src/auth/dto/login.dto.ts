export interface LoginDto {
  username: string;
  password: string;
  /** 勾選「記住這台裝置」：回應多帶 refreshToken，裝置可長期保持登入 */
  rememberDevice?: boolean;
}
