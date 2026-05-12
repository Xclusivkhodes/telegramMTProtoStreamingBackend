/**
 * graphql/resolvers/audioResolvers.ts — Audio CRUD & Query Resolvers
 *
 * Mutations (all admin-only via the adminOnly guard):
 *   addAudio    — Manually add a sermon record (used for one-off imports)
 *   updateAudio — Edit an existing sermon's metadata
 *   deleteAudio — Remove a sermon record from the DB
 *
 * Queries:
 *   audios           — All sermons, sorted by name (no pagination)
 *   audio            — Search by title or preacher name (partial match)
 *   audiosByPreacher — Cursor-paginated list filtered by preacher name
 *   getAudios        — Cursor-paginated list of all sermons (newest first)
 *
 * Pagination strategy:
 *   Both paginated queries use cursor-based pagination (not offset/page).
 *   Cursors are base64-encoded MongoDB _id values (or title:_id pairs for
 *   preacher queries). This is stable under inserts/deletes, unlike offset
 *   pagination which can skip or repeat items when the list changes.
 */

import { AppError } from "../../utils/AppError.js";
import { sort } from "fast-sort";
import { adminOnly } from "../../utils/adminConfimation.js";

export const audioResolver = {
  Mutation: {
    // Create a new audio record — admin only
    addAudio: adminOnly(
      async (_: any, { input }: { input: any }, { dataSources }: any) => {
        try {
          const existingAudio = await dataSources.audios.findAudioByTitle(
            input.title,
          );
          if (existingAudio) {
            throw new AppError(
              `The audio with the title ${input.title} already exists`,
              400,
            );
          }
          return await dataSources.audios.createAudio(input);
        } catch (err: any) {
          if (err instanceof AppError) throw err;
          throw new AppError(`Failed to add audio: ${err.message || err}`, 400);
        }
      },
    ),

    // Update an existing audio record by ID — admin only
    updateAudio: adminOnly(
      async (_: any, { id, input }: any, { dataSources }: any) => {
        return dataSources.audios.updateAudio(id, input);
      },
    ),

    // Delete an audio record by ID — admin only
    deleteAudio: adminOnly(
      async (_: any, { id }: any, { dataSources }: any) => {
        return dataSources.audios.deleteAudio(id);
      },
    ),
  },

  Query: {
    // Return all audios sorted by name then sequence (no pagination)
    audios: async (_: any, __: any, { dataSources }: any) => {
      try {
        const audios = dataSources.audios.findAll();
        return sort(audios).desc([
          (audio: any) => audio.name,
          (audio: any) => audio.sequence,
        ]);
      } catch (err: any) {
        throw new AppError(`There was an error: ${err.message || err}`);
      }
    },

    // Search audios by title or preacher (partial, case-insensitive match)
    audio: async (_: any, { title }: any, { dataSources }: any) => {
      try {
        const audio = await dataSources.audios.findAudioByTitle(title);
        if (!audio) throw new AppError(`${title} was not found`, 404);

        return sort(audio).asc([
          (audio: any) => audio.name,
          (audio: any) => audio.sequence,
        ]);
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError(`There was an error: ${err.message || err}`);
      }
    },

    // Cursor-paginated sermons filtered by preacher name
    audiosByPreacher: async (
      _: any,
      { preacher, first, after }: any,
      { dataSources }: any,
    ) => {
      try {
        const { nodes, pageInfo } =
          await dataSources.audios.findAudioByPreacher(preacher, first, after);

        // Only throw 404 on the first page — subsequent pages can legitimately be empty
        if (!nodes || nodes.length === 0) {
          if (!after)
            throw new AppError(`Audios of ${preacher} was not found`, 404);
        }

        return {
          edges: nodes.map((node: any) => ({
            // Cursor encodes both title and _id to handle duplicate titles correctly
            cursor: Buffer.from(`${node.title}:${node._id}`).toString("base64"),
            node,
          })),
          pageInfo,
        };
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError(`There was an error: ${err.message || err}`);
      }
    },

    // Cursor-paginated list of all sermons (newest first, default 10 per page)
    getAudios: async (
      _: any,
      { first = 10, after }: any,
      { dataSources }: any,
    ) => {
      try {
        // Fetch first+1 to determine if there's a next page without a COUNT query
        const audios = await dataSources.audios.findPaginated(first, after);

        const hasNextPage = audios.length > first;
        const nodes = hasNextPage ? audios.slice(0, -1) : audios;

        const edges = nodes.map((audio: any) => ({
          cursor: Buffer.from(audio._id.toString()).toString("base64"),
          node:   audio,
        }));

        return {
          edges,
          pageInfo: {
            hasNextPage,
            endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
          },
        };
      } catch (err: any) {
        throw new AppError(`Pagination error: ${err.message}`);
      }
    },
  },
};
