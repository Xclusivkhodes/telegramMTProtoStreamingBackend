export const deleteAudio = async (
  _: any,
  { id }: any,
  { dataSources }: any,
) => {
  return dataSources.audios.deleteAudio(id);
};
