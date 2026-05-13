import { AppError } from "../../../../utils/AppError.js";

export const addAudio = async (
  _: any,
  { input }: { input: any },
  { dataSources }: any,
) => {
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
};
