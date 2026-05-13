import { User } from "../../../models/User.js";
import { AppError } from "../../../utils/AppError.js";
import { generateToken } from "../../../utils/auth.js";
import { requestLoginCode } from "../../../utils/pendingAuthClients.js";

export const registerUser = async (
  _: any,
  { input }: any,
  { dataSources, res }: any,
) => {
  const existingUser = await dataSources.users.findUserByEmail(input.email);
  if (existingUser)
    throw new AppError(`User ${input.email} already exists`, 400);

  const newUser = await dataSources.users.createUser(input);
  const { refreshToken, accessToken } = generateToken(newUser.id);

  await dataSources.users.saveRefreshToken(refreshToken, newUser.id);

  // Kick off Telegram OTP — user will call verifyTelegramLogin next
  const result = await requestLoginCode(newUser.phoneNumber);
  if (!result.success) throw new AppError(result.message, 500);

  // Set httpOnly cookies (not accessible to JavaScript on the client)
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/refresh",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000,
  });

  // Store the hash so verifyTelegramLogin can complete the SignIn RPC
  await User.findByIdAndUpdate(newUser.id, {
    phoneCodeHash: result.phoneCodeHash,
  });

  return newUser;
};
