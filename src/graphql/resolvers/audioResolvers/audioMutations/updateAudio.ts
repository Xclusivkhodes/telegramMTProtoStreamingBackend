export const updateAudio = async (
  _: any,
  { id, input }: any,
  { dataSources }: any,
) => {
  return dataSources.audios.updateAudio(id, input);
};
