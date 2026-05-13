import { AppError } from "../../../../utils/AppError.js";

export const getAudios = async (
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
      node: audio,
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
};
