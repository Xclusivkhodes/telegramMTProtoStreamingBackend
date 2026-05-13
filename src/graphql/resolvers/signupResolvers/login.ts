import bcrypt from "bcryptjs";
import { AppError } from "../../../utils/AppError.js";
import { generateToken } from "../../../utils/auth.js";
import { telegramManager } from "../../../lib/telegramManager.js";

export const login = async (
  _: any,
  { input }: any,
  { dataSources, res }: any,
) => {
  const user = await dataSources.users.findUserByEmail(input.email);
  if (!user || !(await bcrypt.compare(input.password, user.password))) {
    throw new AppError("Invalid credentials", 401);
  }

  const { accessToken, refreshToken } = generateToken(user.id);
  await dataSources.users.saveRefreshToken(refreshToken, user.id);

  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/refresh",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Background warm-up: don't block the login response
  if (user.sessionString) {
    telegramManager.getClient(user.id, user.sessionString).catch((err) => {
      throw new AppError(`An error occured: ${err.mesage || err}`);
    });
  }

  return user;
};
