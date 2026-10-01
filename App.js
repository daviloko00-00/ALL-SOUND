import React, { useState, useEffect, useRef } from 'react';
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  Image,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';

import {
  initDatabase,
  getAllTracks,
  deleteTrackById,
  insertTrack,
  resetToDefaultTracks,
} from './src/database';
import { getAudioSource } from './src/audioMap';
import { styles } from './src/styles/styles.js';

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);

  // Estado para o modal de adicionar faixa no SQLite
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newFileName, setNewFileName] = useState('');

  // Referência do som do expo-av
  const soundRef = useRef(null);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  // 1. Inicialização do Banco de Dados SQLite e Carregamento das Faixas
  useEffect(() => {
    async function setupApp() {
      try {
        setIsLoading(true);
        // Configura modo de áudio do Expo AV
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        // Inicializa tabela SQLite e carrega os dados
        await initDatabase();
        await loadTracksFromDb();
      } catch (error) {
        console.error('Erro na inicialização:', error);
        Alert.alert('Erro', 'Não foi possível inicializar o banco SQLite.');
      } finally {
        setIsLoading(false);
      }
    }

    setupApp();
  }, []);

  // 2. REQUISITO OBRIGATÓRIO:
  // "Usar o Hook UseEffect para fazer a faixa parar de reproduzir quando eu sair da tela do App"
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      console.log('Mudança de AppState:', nextAppState);
      // Se o usuário minimizou o app ou foi para a tela inicial do celular/emulador
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('App saiu da tela principal. Pausando faixa...');
        if (soundRef.current && isPlayingRef.current) {
          try {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
          } catch (err) {
            console.warn('Erro ao pausar no background:', err);
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Função de limpeza do useEffect (quando a tela for desmontada)
    return () => {
      subscription.remove();
      if (soundRef.current) {
        console.log('Desmontando tela: descarregando som...');
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  // Carrega lista persistida no SQLite
  async function loadTracksFromDb() {
    try {
      const data = await getAllTracks();
      setTracks(data);
      if (!currentTrack && data.length > 0) {
        setCurrentTrack(data[0]);
      }
    } catch (err) {
      console.error('Erro ao ler faixas do SQLite:', err);
    }
  }

  // Atualização em tempo real do progresso da reprodução
  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      if (!isSeeking) {
        setPositionMillis(status.positionMillis || 0);
        setDurationMillis(status.durationMillis || 1);
      }
      setIsPlaying(status.isPlaying);

      if (status.didJustFinish) {
        console.log('Faixa finalizada. Tocando próxima...');
        playNextTrack();
      }
    } else if (status.error) {
      console.error(`Erro de playback: ${status.error}`);
    }
  };

  // Carrega e toca uma faixa de áudio
  async function playTrack(track, autoPlay = true) {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setCurrentTrack(track);
      setPositionMillis(0);

      const source = getAudioSource(track.assetKey);
      const { sound } = await Audio.Sound.createAsync(
        source,
        { shouldPlay: autoPlay, positionMillis: 0 },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      setIsPlaying(autoPlay);
    } catch (err) {
      console.error('Erro ao reproduzir faixa:', err);
      Alert.alert('Erro', `Não foi possível carregar a faixa: ${track.fileName}`);
    }
  }

  // Alterna Play / Pause
  async function togglePlayPause() {
    if (!currentTrack) {
      if (tracks.length > 0) {
        await playTrack(tracks[0], true);
      }
      return;
    }

    if (!soundRef.current) {
      await playTrack(currentTrack, true);
      return;
    }

    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Erro ao alternar Play/Pause:', error);
    }
  }

  // Próxima faixa
  async function playNextTrack() {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    await playTrack(tracks[nextIndex], true);
  }

  // Faixa anterior
  async function playPreviousTrack() {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    await playTrack(tracks[prevIndex], true);
  }

  // Avançar / retroceder segundos
  async function seekRelative(seconds) {
    if (!soundRef.current) return;
    const newPos = Math.max(0, Math.min(positionMillis + seconds * 1000, durationMillis));
    await soundRef.current.setPositionAsync(newPos);
  }

  // Concluir arrasto da barra de progresso (Slider)
  async function onSlidingComplete(value) {
    setIsSeeking(false);
    if (soundRef.current) {
      await soundRef.current.setPositionAsync(value);
    }
  }

  // REQUISITO: Excluir do banco SQLite e da tela
  function handleDeleteTrack(track) {
    Alert.alert(
      'Excluir Música',
      `Tem certeza que deseja excluir "${track.title}" do banco de dados SQLite e da tela?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              if (currentTrack?.id === track.id) {
                if (soundRef.current) {
                  await soundRef.current.stopAsync();
                  await soundRef.current.unloadAsync();
                  soundRef.current = null;
                }
                setIsPlaying(false);
                setCurrentTrack(null);
              }

              // Deleta da tabela tracks no SQLite
              await deleteTrackById(track.id);

              // Atualiza o estado da lista
              const updatedTracks = await getAllTracks();
              setTracks(updatedTracks);

              if (updatedTracks.length > 0 && !currentTrack) {
                setCurrentTrack(updatedTracks[0]);
              }

              Alert.alert('Sucesso', 'Música removida do SQLite e da tela!');
            } catch (err) {
              console.error('Erro ao excluir:', err);
              Alert.alert('Erro', 'Não foi possível excluir a música.');
            }
          },
        },
      ]
    );
  }

  // Restaurar as 5 faixas padrão no SQLite
  async function handleResetTracks() {
    Alert.alert(
      'Restaurar Lista Padrão',
      'Isso restaurará as 5 faixas originais no SQLite. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: async () => {
            try {
              if (soundRef.current) {
                await soundRef.current.unloadAsync();
                soundRef.current = null;
                setIsPlaying(false);
              }
              await resetToDefaultTracks();
              await loadTracksFromDb();
              Alert.alert('Restaurado', '5 faixas restauradas no SQLite!');
            } catch (err) {
              Alert.alert('Erro', 'Falha ao restaurar banco.');
            }
          },
        },
      ]
    );
  }

  // Adicionar nova faixa no SQLite
  async function handleAddTrack() {
    if (!newTitle.trim() || !newArtist.trim() || !newFileName.trim()) {
      Alert.alert('Atenção', 'Preencha todos os campos da nova música.');
      return;
    }

    try {
      const randomAssetKey = `song${Math.floor(Math.random() * 5) + 1}`;
      const finalFileName = newFileName.trim().endsWith('.mp3')
        ? newFileName.trim()
        : `${newFileName.trim()}.mp3`;

      await insertTrack(
        newTitle.trim(),
        newArtist.trim(),
        finalFileName,
        randomAssetKey,
        '04:15'
      );

      setNewTitle('');
      setNewArtist('');
      setNewFileName('');
      setModalVisible(false);

      await loadTracksFromDb();
      Alert.alert('Sucesso', 'Nova faixa gravada com sucesso no SQLite!');
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível salvar no SQLite.');
    }
  }

  // Formatação de milissegundos para mm:ss
  function formatTime(millis) {
    if (!millis || isNaN(millis) || millis < 0) return '00:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  // Renderização de cada item da FlatList
  const renderTrackItem = ({ item }) => {
    const isCurrent = currentTrack?.id === item.id;

    return (
      <View style={[styles.trackCard, isCurrent && styles.trackCardActive]}>
        <TouchableOpacity
          style={styles.trackInfoArea}
          onPress={() => playTrack(item, true)}
          activeOpacity={0.7}
        >
          <View style={[styles.trackBadge, isCurrent && styles.trackBadgeActive]}>
            <Text style={styles.trackBadgeText}>#{item.id}</Text>
          </View>

          <View style={styles.trackDetails}>
            <Text style={[styles.trackTitle, isCurrent && styles.trackTitleActive]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {item.artist}
            </Text>
            {/* REQUISITO: Exibir o nome do arquivo */}
            <View style={styles.fileNameRow}>
              <Text style={styles.fileIcon}>🎵</Text>
              <Text style={styles.trackFileName} numberOfLines={1}>
                {item.fileName}
              </Text>
              <Text style={styles.durationTag}>• {item.durationText}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Ações da linha: Play/Pause rápido e botão de Excluir do SQLite */}
        <View style={styles.trackActions}>
          <TouchableOpacity
            style={[styles.miniButton, isCurrent && isPlaying ? styles.miniButtonPause : styles.miniButtonPlay]}
            onPress={() => {
              if (isCurrent) {
                togglePlayPause();
              } else {
                playTrack(item, true);
              }
            }}
          >
            <Text style={styles.miniButtonText}>
              {isCurrent && isPlaying ? '⏸' : '▶'}
            </Text>
          </TouchableOpacity>

          {/* Botão de Excluir da Tela e do SQLite */}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteTrack(item)}
          >
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0b071e" />

      {/* Header com Logo criado por IA e nome do App */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require('./assets/splash-icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>SoundWave</Text>
            <Text style={styles.headerSubtitle}>Player SQLite & Audio</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.addBtnText}>+ Nova</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetBtn} onPress={handleResetTracks}>
            <Text style={styles.resetBtnText}>↺ Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* PLAYER PRINCIPAL: NOME DO ARQUIVO, SLIDER DE PROGRESSO E TEMPORIZADOR */}
      <View style={styles.nowPlayingCard}>
        <View style={styles.nowPlayingHeader}>
          <Text style={styles.nowPlayingStatus}>
            {isPlaying ? '● REPRODUZINDO AGORA' : 'PAUSADO'}
          </Text>
          <View style={styles.storageBadge}>
            <Text style={styles.storageBadgeText}>SQLite DB</Text>
          </View>
        </View>

        {/* Exibição do título e artista */}
        <Text style={styles.currentTitle} numberOfLines={1}>
          {currentTrack ? currentTrack.title : 'Selecione uma faixa'}
        </Text>
        <Text style={styles.currentArtist} numberOfLines={1}>
          {currentTrack ? currentTrack.artist : 'SoundWave Player'}
        </Text>

        {/* REQUISITO: Exibir o nome do arquivo */}
        <View style={styles.fileNamePill}>
          <Text style={styles.fileNamePillLabel}>Arquivo:</Text>
          <Text style={styles.fileNamePillText} numberOfLines={1}>
            {currentTrack ? currentTrack.fileName : 'nenhum arquivo'}
          </Text>
        </View>

        {/* REQUISITO: Barra de progresso durante a reprodução e temporizador ao lado da barra */}
        <View style={styles.progressContainer}>
          <Text style={styles.timerText}>{formatTime(positionMillis)}</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={durationMillis > 0 ? durationMillis : 1}
            value={positionMillis}
            minimumTrackTintColor="#00e5ff"
            maximumTrackTintColor="#2c2250"
            thumbTintColor="#00f2fe"
            onValueChange={(val) => {
              setIsSeeking(true);
              setPositionMillis(val);
            }}
            onSlidingComplete={onSlidingComplete}
          />
          <Text style={styles.timerText}>{formatTime(durationMillis)}</Text>
        </View>

        {/* Controles de Reprodução */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.seekButton}
            onPress={() => seekRelative(-10)}
          >
            <Text style={styles.seekButtonText}>-10s</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.stepButton} onPress={playPreviousTrack}>
            <Text style={styles.stepButtonText}>⏮</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainPlayButton, isPlaying && styles.mainPlayButtonActive]}
            onPress={togglePlayPause}
          >
            <Text style={styles.mainPlayButtonText}>
              {isPlaying ? '❚❚' : '▶'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.stepButton} onPress={playNextTrack}>
            <Text style={styles.stepButtonText}>⏭</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.seekButton}
            onPress={() => seekRelative(10)}
          >
            <Text style={styles.seekButtonText}>+10s</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* LISTA DE MÚSICAS COM FLATLIST */}
      <View style={styles.listSection}>
        <View style={styles.listHeaderRow}>
          <Text style={styles.sectionTitle}>
            Playlist ({tracks.length} {tracks.length === 1 ? 'música' : 'músicas'})
          </Text>
          <Text style={styles.listHelper}>Persistidas no SQLite</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00e5ff" />
            <Text style={styles.loadingText}>Carregando banco SQLite...</Text>
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderTrackItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Nenhuma música no banco de dados.</Text>
                <TouchableOpacity style={styles.restoreEmptyBtn} onPress={handleResetTracks}>
                  <Text style={styles.restoreEmptyBtnText}>Restaurar 5 Músicas</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>

      {/* Modal para Adicionar Música ao SQLite */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adicionar Música ao SQLite</Text>
            <Text style={styles.modalDescription}>
              Cadastre uma nova faixa no banco de dados local.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Título da música (ex: Vibe Noturna)"
              placeholderTextColor="#7b729e"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <TextInput
              style={styles.input}
              placeholder="Artista / Cantor (ex: DJ Alok)"
              placeholderTextColor="#7b729e"
              value={newArtist}
              onChangeText={setNewArtist}
            />

            <TextInput
              style={styles.input}
              placeholder="Nome do Arquivo (ex: vibe_noturna.mp3)"
              placeholderTextColor="#7b729e"
              value={newFileName}
              onChangeText={setNewFileName}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleAddTrack}
              >
                <Text style={styles.modalSaveBtnText}>Salvar no SQLite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
