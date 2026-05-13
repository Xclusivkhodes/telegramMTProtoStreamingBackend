/**
 * graphql/resolvers/resolvers.ts — Schema Assembly Point
 *
 * Merges all resolver modules, builds an executable schema, and applies
 * graphql-shield permission middleware. The resulting schemaWithPermissions
 * is passed directly to ApolloServer as its `schema` option.
 *
 * To add a new resolver module, import it and add it to resolverArray.
 */

import { mergeResolvers } from "@graphql-tools/merge";
import { signupResolver } from "./signupResolver.js";
import { audioResolver } from "./audioResolvers.js";
import { testResolver } from "./testResolver.js";
import { applyMiddleware } from "graphql-middleware";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "../schema/schema.js";
import { permissions } from "../../middleware/permissions.js";

const resolverArray = [signupResolver, audioResolver, testResolver];
const mergedResolvers = mergeResolvers(resolverArray);
// export const resolvers = mergeResolvers(resolverArray);

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers: mergedResolvers,
});

export const schemaWithPermissions = applyMiddleware(schema, permissions);
