import { telegramManager } from "../../../lib/telegramManager.js";

export const logout = async (
  _: any,
  __: any,
  { dataSources, user, res }: any,
) => {
  if (user) {
    await dataSources.users.saveRefreshToken(null, user.id);
    await telegramManager.stopClient(user.id);
  }
  res.clearCookie("access_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/refresh",
  });
  return true;
};
