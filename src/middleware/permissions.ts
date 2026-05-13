import { rule, shield, and } from "graphql-shield";
import { AppError } from "../utils/AppError.js";

const isAuthenticated = rule({ cache: "contextual" })(async (
  _parent,
  _args,
  { user },
) => {
  return user ? true : new AppError("Unauthorized", 401);
});

const isAdmin = rule({ cache: "contextual" })(async (
  _parent,
  _args,
  { user },
) => {
  return (
    (user?.role).toLowerCase() === "admin" ||
    new AppError("Forbidden: You are not an admin", 403)
  );
});

export const permissions = shield(
  {
    Query: {
      me: isAuthenticated,
      users: and(isAuthenticated, isAdmin),
      testAudios: and(isAuthenticated, isAdmin),
    },
    Mutation: {
      registerUser: rule()(() => true),
      login: rule()(() => true),
      verifyTelegramLogin: isAuthenticated,
      logout: isAuthenticated,
    },
  },
  {
    fallbackRule: rule()(() => true),
    fallbackError: () => new AppError("Internal Server Err", 500),
  },
);
