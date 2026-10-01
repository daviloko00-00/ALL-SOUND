// Mapeamento estático dos arquivos locais na pasta assets
export const LOCAL_AUDIO_FILES = {
  song1: require('../assets/song1.mp3'),
  song2: require('../assets/song2.mp3'),
  song3: require('../assets/song3.mp3'),
  song4: require('../assets/song4.mp3'),
  song5: require('../assets/song5.mp3'),
};

export function getAudioSource(assetKey) {
  if (LOCAL_AUDIO_FILES[assetKey]) {
    return LOCAL_AUDIO_FILES[assetKey];
  }
  // Fallback para song1 caso a chave não seja encontrada
  return LOCAL_AUDIO_FILES.song1;
}
