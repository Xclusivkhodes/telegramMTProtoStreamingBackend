/**
 * utils/adminConfimation.ts — Admin-Only Resolver Guard
 *
 * A higher-order function that wraps a GraphQL resolver and enforces that:
 *   1. The request is authenticated (user exists in context)
 *   2. The authenticated user has the "admin" role
 *
 * Usage — wrap any resolver that should be admin-only:
 *   addAudio: adminOnly(async (_, { input }, { dataSources }) => { ... })
 *
 * This keeps auth logic out of individual resolvers and makes it easy to see
 * at a glance which mutations are protected.
 */

import { AppError } from "./AppError.js";

export const adminOnly = (next: any) => {
  return (parent: any, args: any, contextValue: any, info: any) => {
    // Guard 1: Must be logged in
    if (!contextValue.user) throw new AppError(`Authentication needed`, 401);

    // Guard 2: Must be an admin
    if (contextValue.user.role !== "admin")
      throw new AppError(`You are not authorized to do this`, 403);

    // All checks passed — delegate to the actual resolver
    return next(parent, args, contextValue, info);
  };
};
