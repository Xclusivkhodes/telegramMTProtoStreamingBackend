/**
 * graphql/resolvers/signupResolver.ts — User Auth Resolvers
 *
 * Handles all user-facing authentication operations:
 *
 * Queries:
 *   me        — Returns the currently authenticated user (from GraphQL context)
 *   users     — Admin-only: returns all users with sensitive fields stripped
 *
 * Mutations:
 *   registerUser         — Creates a user, issues JWT cookies, and triggers
 *                          Telegram OTP (Step 1 of the login flow)
 *   verifyTelegramLogin  — Completes the OTP flow (Step 2), saves the session
 *                          string, and warms up the MTProto connection
 *   login                — Password auth + JWT cookies + background MTProto warmup
 *   logout               — Clears cookies, revokes refresh token, kills MTProto client
 *
 * Latency optimisations:
 *   • On login: telegramManager.getClient() is called without await so the
 *     MTProto connection starts in the background while the login response is
 *     already on its way to the client.
 *   • On verifyTelegramLogin: the already-connected pending client is handed
 *     directly to TelegramManager, avoiding a second connection round-trip.
 */

import { AppError } from "../../utils/AppError.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../../utils/auth.js";
import { adminOnly } from "../../utils/adminConfimation.js";
import {
  requestLoginCode,
  getPendingClient,
  clearPendingClient,
} from "../../utils/pendingAuthClients.js";
import { telegramManager } from "../../lib/telegramManager.js";
import { User } from "../../models/User.js";
import { Api } from "telegram";

export const signupResolver = {
  Query: {
    // Returns the current user from GraphQL context (set by server.ts JWT check)
    me: async (_: any, __: any, { user }: any) => {
      if (!user) return null;
      return user;
    },

    // Admin-only: list all users with passwords and tokens stripped
    users: adminOnly(async (_: any, __: any, { dataSources }: any) => {
      const userList = await dataSources.users.findAll();
      return userList.map((user: any) => {
        const u = user.toObject({ virtuals: true });
        // Never expose these fields through the API
        delete u.password;
        delete u.refreshToken;
        delete u.sessionString;
        return u;
      });
    }),
  },

  Mutation: {
    /**
     * registerUser — Full registration flow:
     *   1. Check for duplicate email
     *   2. Create user in DB
     *   3. Generate JWT pair and set cookies
     *   4. Trigger Telegram OTP (requestLoginCode)
     *   5. Store phoneCodeHash on the user for Step 2
     */
    registerUser: async (_: any, { input }: any, { dataSources, res }: any) => {
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
        httpOnly: true, secure: true, sameSite: "none",
        path: "/refresh", maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.cookie("access_token", accessToken, {
        httpOnly: true, secure: true, sameSite: "none",
        maxAge: 15 * 60 * 1000,
      });

      // Store the hash so verifyTelegramLogin can complete the SignIn RPC
      await User.findByIdAndUpdate(newUser.id, {
        phoneCodeHash: result.phoneCodeHash,
      });

      return newUser;
    },

    /**
     * verifyTelegramLogin — Step 2 of the OTP flow:
     *   1. Retrieve the live pending client for this user's phone number
     *   2. Call Telegram's auth.SignIn RPC with the OTP code
     *   3. Extract and save the session string
     *   4. Hand the connected client to TelegramManager (warm-up)
     */
    verifyTelegramLogin: async (_: any, { input }: any, { user }: any) => {
      if (!user) throw new AppError("Unauthorized", 401);

      const client = getPendingClient(user.phoneNumber);
      if (!client)
        throw new AppError("Session expired. Please request a new code.", 400);

      try {
        const result = await client.invoke(
          new Api.auth.SignIn({
            phoneNumber:   user.phoneNumber,
            phoneCodeHash: user.phoneCodeHash,
            phoneCode:     input.code,
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
    },

    /**
     * login — Password-based login:
     *   1. Verify email + bcrypt password
     *   2. Generate and set JWT cookies
     *   3. Start MTProto connection in the background (no await)
     */
    login: async (_: any, { input }: any, { dataSources, res }: any) => {
      const user = await dataSources.users.findUserByEmail(input.email);
      if (!user || !(await bcrypt.compare(input.password, user.password))) {
        throw new AppError("Invalid credentials", 401);
      }

      const { accessToken, refreshToken } = generateToken(user.id);
      await dataSources.users.saveRefreshToken(refreshToken, user.id);

      res.cookie("access_token", accessToken, {
        httpOnly: true, secure: true, sameSite: "none",
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refresh_token", refreshToken, {
        httpOnly: true, sameSite: "none", secure: true,
        path: "/refresh", maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // Background warm-up: don't block the login response
      if (user.sessionString) {
        telegramManager.getClient(user.id, user.sessionString).catch((err) => {
          throw new AppError(`An error occured: ${err.mesage || err}`);
        });
      }

      return user;
    },

    /**
     * logout — Full cleanup:
     *   1. Revoke refresh token in DB
     *   2. Kill the MTProto connection
     *   3. Clear both auth cookies
     */
    logout: async (_: any, __: any, { dataSources, user, res }: any) => {
      if (user) {
        await dataSources.users.saveRefreshToken(null, user.id);
        await telegramManager.stopClient(user.id);
      }
      res.clearCookie("access_token",  { httpOnly: true, secure: true, sameSite: "none" });
      res.clearCookie("refresh_token", { httpOnly: true, secure: true, sameSite: "none", path: "/refresh" });
      return true;
    },
  },
};
