import { Api } from "telegram";
import { AppError } from "../../../utils/AppError.js";
import {
  clearPendingClient,
  getPendingClient,
} from "../../../utils/pendingAuthClients.js";
import { User } from "../../../models/User.js";
import { telegramManager } from "../../../lib/telegramManager.js";

export const verifyTelegramLogin = async (
  _: any,
  { input }: any,
  { user }: any,
) => {
  if (!user) throw new AppError("Unauthorized", 401);

  const client = getPendingClient(user.phoneNumber);
  if (!client)
    throw new AppError("Session expired. Please request a new code.", 400);

  try {
    const result = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: user.phoneNumber,
        phoneCodeHash: user.phoneCodeHash,
        phoneCode: input.code,
      }),
    );

    // processEntities ensures the session captures the full auth state
    client.session.processEntities(result);
    const sessionString = client.session.save() as unknown as string;

    // Persist the session and clear the temporary OTP hash
    const updatedUser = await User.findByIdAndUpdate(
      user.id,
      { sessionString, phoneCodeHash: null },
      { new: true },
    );

    clearPendingClient(user.phoneNumber);

    // 🚀 Warm up: transfer the already-connected client into the pool
    // so the first stream request doesn't pay the connection cost.
    await telegramManager.getClient(user.id, sessionString);

    return updatedUser;
  } catch (error: any) {
    if (error.errorMessage === "SESSION_PASSWORD_NEEDED") {
      throw new AppError("2FA_REQUIRED", 403);
    }
    throw new AppError(`Verification failed: ${error.message}`, 400);
  }
};
