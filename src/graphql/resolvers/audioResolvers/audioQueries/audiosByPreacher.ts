import { AppError } from "../../../../utils/AppError.js";

export const audiosByPreacher = async (
  _: any,
  { preacher, first, after }: any,
  { dataSources }: any,
) => {
  try {
    const { nodes, pageInfo } = await dataSources.audios.findAudioByPreacher(
      preacher,
      first,
      after,
    );

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
};
