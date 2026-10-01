import { Platform } from 'react-native';

export const DEFAULT_TRACKS = [
  {
    id: 1,
    title: 'SoundWave Odyssey',
    artist: 'SoundWave Studio',
    fileName: 'song1.mp3',
    assetKey: 'song1',
    durationText: '09:18',
  },
  {
    id: 2,
    title: 'Neon Horizon',
    artist: 'Cyber Groove',
    fileName: 'song2.mp3',
    assetKey: 'song2',
    durationText: '07:05',
  },
  {
    id: 3,
    title: 'Midnight Beats',
    artist: 'Lo-Fi Resonance',
    fileName: 'song3.mp3',
    assetKey: 'song3',
    durationText: '05:46',
  },
  {
    id: 4,
    title: 'Cyber Pulse',
    artist: 'Synth Electro',
    fileName: 'song4.mp3',
    assetKey: 'song4',
    durationText: '08:33',
  },
  {
    id: 5,
    title: 'Sunset Echoes',
    artist: 'Aura Chill',
    fileName: 'song5.mp3',
    assetKey: 'song5',
    durationText: '06:12',
  },
];

let dbInstance = null;
let webFallbackTracks = [...DEFAULT_TRACKS];

// Obter banco SQLite (Android/iOS nativo)
export async function getDatabase() {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!dbInstance) {
    const SQLite = await import('expo-sqlite');
    dbInstance = await SQLite.openDatabaseAsync('soundwave_player.db');
  }
  return dbInstance;
}

// Inicializa a tabela tracks e insere os registros padrão
export async function initDatabase() {
  if (Platform.OS === 'web') {
    console.log('[Web Mode] Inicializando persistência local...');
    return;
  }

  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      fileName TEXT NOT NULL,
      assetKey TEXT NOT NULL,
      durationText TEXT NOT NULL
    );
  `);

  const existing = await db.getAllAsync('SELECT * FROM tracks');
  if (existing.length === 0) {
    console.log('[SQLite] Populando SQLite com as 5 faixas iniciais...');
    for (const track of DEFAULT_TRACKS) {
      await db.runAsync(
        'INSERT INTO tracks (title, artist, fileName, assetKey, durationText) VALUES (?, ?, ?, ?, ?)',
        track.title,
        track.artist,
        track.fileName,
        track.assetKey,
        track.durationText
      );
    }
  }
}

// Busca todas as faixas cadastradas no SQLite
export async function getAllTracks() {
  if (Platform.OS === 'web') {
    return [...webFallbackTracks];
  }

  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM tracks ORDER BY id ASC');
}

// Exclui uma faixa do banco SQLite por ID
export async function deleteTrackById(id) {
  if (Platform.OS === 'web') {
    webFallbackTracks = webFallbackTracks.filter((t) => t.id !== id);
    return;
  }

  const db = await getDatabase();
  await db.runAsync('DELETE FROM tracks WHERE id = ?', id);
}

// Insere uma nova faixa no SQLite
export async function insertTrack(title, artist, fileName, assetKey, durationText) {
  if (Platform.OS === 'web') {
    const newId = webFallbackTracks.length > 0 ? Math.max(...webFallbackTracks.map((t) => t.id)) + 1 : 1;
    const newTrack = { id: newId, title, artist, fileName, assetKey, durationText };
    webFallbackTracks.push(newTrack);
    return newId;
  }

  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO tracks (title, artist, fileName, assetKey, durationText) VALUES (?, ?, ?, ?, ?)',
    title,
    artist,
    fileName,
    assetKey,
    durationText || '04:00'
  );
  return result.lastInsertRowId;
}

// Restaura as 5 músicas padrão no SQLite
export async function resetToDefaultTracks() {
  if (Platform.OS === 'web') {
    webFallbackTracks = [...DEFAULT_TRACKS];
    return;
  }

  const db = await getDatabase();
  await db.runAsync('DELETE FROM tracks');
  for (const track of DEFAULT_TRACKS) {
    await db.runAsync(
      'INSERT INTO tracks (title, artist, fileName, assetKey, durationText) VALUES (?, ?, ?, ?, ?)',
      track.title,
      track.artist,
      track.fileName,
      track.assetKey,
      track.durationText
    );
  }
}
