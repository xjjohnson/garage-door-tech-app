/**
 * Voice notes on an inspection: record, play back, delete. Uses expo-audio
 * (built into the APK from 0.5.0); where it isn't there (web, tests) the list
 * still shows and recording is hidden.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { VoiceNote } from '../lib/inspection';
import { log } from '../lib/log';
import { colors, touch, type } from '../theme';
import { Action } from './Buttons';

type AudioModule = typeof import('expo-audio');

let audio: AudioModule | null | undefined;
function loadAudio(): AudioModule | null {
  if (audio !== undefined) return audio;
  if (Platform.OS === 'web') return (audio = null);
  try {
    audio = require('expo-audio') as AudioModule;
  } catch {
    audio = null;
  }
  return audio;
}

export function formatSeconds(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export interface VoiceNotesProps {
  notes: VoiceNote[];
  /** Copies the recording into the app's own folder. */
  keepFile?: (uri: string, folder: string) => Promise<string>;
  onAdd: (n: VoiceNote) => void;
  onRemove: (id: string) => void;
}

export function VoiceNotes({ notes, keepFile, onAdd, onRemove }: VoiceNotesProps) {
  const a = loadAudio();
  return (
    <View testID="voice-notes">
      {notes.length === 0 ? <Text style={styles.muted}>No voice notes.</Text> : null}
      {notes.map((n, i) => (
        <View key={n.id} style={styles.row} testID={`voice-${n.id}`}>
          {a ? <PlayButton audio={a} uri={n.uri} testID={`voice-${n.id}-play`} /> : null}
          <Text style={styles.label}>
            Note {i + 1} · {formatSeconds(n.seconds)}
          </Text>
          <Pressable onPress={() => onRemove(n.id)} accessibilityRole="button" accessibilityLabel={`Delete voice note ${i + 1}`} testID={`voice-${n.id}-delete`} style={styles.small}>
            <Text style={styles.smallText}>Delete</Text>
          </Pressable>
        </View>
      ))}
      {a && keepFile ? <Recorder audio={a} keepFile={keepFile} onAdd={onAdd} /> : null}
    </View>
  );
}

function PlayButton({ audio: a, uri, testID }: { audio: AudioModule; uri: string; testID: string }) {
  const player = a.useAudioPlayer(uri);
  const status = a.useAudioPlayerStatus(player);
  const playing = status.playing;
  return (
    <Pressable
      onPress={() => {
        if (playing) player.pause();
        else {
          if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) player.seekTo(0);
          player.play();
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      testID={testID}
      style={styles.small}
    >
      <Text style={styles.smallText}>{playing ? 'Pause' : 'Play'}</Text>
    </Pressable>
  );
}

function Recorder({ audio: a, keepFile, onAdd }: { audio: AudioModule; keepFile: (uri: string, folder: string) => Promise<string>; onAdd: (n: VoiceNote) => void }) {
  const recorder = a.useAudioRecorder(a.RecordingPresets.HIGH_QUALITY);
  const state = a.useAudioRecorderState(recorder, 500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(0);

  useEffect(
    () => () => {
      if (recorder.isRecording) recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  const start = async () => {
    setError('');
    setBusy(true);
    try {
      const perm = await a.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('Allow the microphone in the phone settings to record.');
        return;
      }
      await a.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      started.current = Date.now();
    } catch (e) {
      log.error('inspection', e);
      setError("Couldn't start recording.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const seconds = state.durationMillis ? state.durationMillis / 1000 : (Date.now() - started.current) / 1000;
      await recorder.stop();
      await a.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording file');
      const kept = await keepFile(uri, 'voice');
      onAdd({ id: `v${Date.now().toString(36)}`, uri: kept, at: Date.now(), seconds: Math.round(seconds) });
    } catch (e) {
      log.error('inspection', e);
      setError("Couldn't save the recording.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      {state.isRecording ? (
        <Action label={`Stop · ${formatSeconds(state.durationMillis / 1000)}`} primary onPress={stop} disabled={busy} testID="voice-stop" />
      ) : (
        <Action label="Record a voice note" onPress={start} disabled={busy} testID="voice-record" />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.info },
  label: { fontSize: type.body, color: colors.text, flex: 1 },
  muted: { fontSize: type.body, color: colors.muted },
  small: { minHeight: touch.min, minWidth: touch.min, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.border, borderRadius: 8 },
  smallText: { fontSize: type.body, fontWeight: '700', color: colors.text },
  error: { fontSize: type.body, color: colors.stop, marginTop: 6 },
});
