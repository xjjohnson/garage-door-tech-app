import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';

/** The dark squares of a QR code, row by row; true is dark. Null if the text is too long to encode. */
export function qrMatrix(text: string): boolean[][] | null {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  } catch {
    return null;
  }
}

/**
 * A QR code drawn with plain views (no image or SVG library, so it ships over
 * the air). Each row draws a run of dark squares as one view. Black on white
 * with the standard quiet zone, so phone cameras read it in sunlight.
 */
export function QrCode({ value, size = 220, testID }: { value: string; size?: number; testID?: string }) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  if (!matrix) return null;
  const quiet = 4;
  const cell = size / (matrix.length + quiet * 2);
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FFFFFF', padding: cell * quiet }} testID={testID} accessibilityLabel="QR code" accessible>
      {matrix.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {runs(row).map(([start, len, dark]) => (
            <View key={start} style={{ width: cell * len, height: cell, backgroundColor: dark ? '#000000' : '#FFFFFF' }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** [start, length, dark] for each run of same-colored squares. */
function runs(row: boolean[]): [number, number, boolean][] {
  const out: [number, number, boolean][] = [];
  let start = 0;
  for (let i = 1; i <= row.length; i++) {
    if (i === row.length || row[i] !== row[start]) {
      out.push([start, i - start, row[start]]);
      start = i;
    }
  }
  return out;
}
