import { loginMiniApp } from "./auth.client.service.js";
import { loginAdmin, getAdminSession } from "./auth.admin.service.js";
import { issueWsTicket, refreshSession, getCsrf, logout } from "./auth.session.service.js";

export const authService = {
  loginMiniApp,
  loginAdmin,
  issueWsTicket,
  refreshSession,
  getCsrf,
  getAdminSession,
  logout,
};
