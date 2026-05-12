/**
 * graphql/resolvers/resolvers.ts — Resolver Merge Point
 *
 * Combines all resolver modules into a single object using @graphql-tools/merge.
 * Apollo Server receives this merged object as its `resolvers` option.
 *
 * To add a new resolver module, import it and add it to resolverArray.
 */

import { mergeResolvers } from "@graphql-tools/merge";
import { signupResolver } from "./signupResolver.js";
import { audioResolver } from "./audioResolvers.js";
import { testResolver } from "./testResolver.js";

const resolverArray = [signupResolver, audioResolver, testResolver];

export const resolvers = mergeResolvers(resolverArray);
