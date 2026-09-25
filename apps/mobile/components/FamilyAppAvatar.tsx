import { View, type ViewStyle } from 'react-native';

import type { AvatarConfig } from '../lib/profile';

const BACKGROUND_COLORS: Record<AvatarConfig['background'], string> = {
  peach: '#FFE0C2',
  sky: '#CFE8FF',
  mint: '#D3F5E4',
  lilac: '#E6D9FF',
  sun: '#FFF3B0'
};

const SKIN_COLORS: Record<AvatarConfig['skinTone'], string> = {
  light: '#FCE0C2',
  medium: '#E8B98C',
  tan: '#C98A5B',
  deep: '#8B5A3C'
};

const HAIR_COLORS: Record<AvatarConfig['hairColor'], string> = {
  black: '#2B2320',
  brown: '#6B4A32',
  blonde: '#D8B26B',
  red: '#A9502F',
  gray: '#B8B0A8'
};

const TOP_COLORS: Record<AvatarConfig['top'], string> = {
  tshirt: '#5571D9',
  hoodie: '#3C9B71',
  dress: '#E85D3F',
  buttonup: '#F5BD4F'
};

const DARK = '#2B2320';

/**
 * FamilyApp's own small, illustrated avatar system — built entirely from plain View
 * primitives (circles/rects via borderRadius, never an image or SVG), so it renders
 * identically on web and native with zero extra dependencies and no external assets.
 * Deterministic: the same AvatarConfig always produces the same picture. Every layer below
 * is positioned absolutely, directly inside the one circular root container, using offsets
 * computed from `size` alone — never nested relative to another absolutely-positioned
 * layer, which keeps the math simple and predictable.
 */
export function FamilyAppAvatar({ config, size }: { config: AvatarConfig; size: number }) {
  const isTiny = size < 32;
  const faceSize = size * 0.56;
  const faceTop = size * 0.16;
  const faceLeft = (size - faceSize) / 2;
  const eyeSize = Math.max(1.5, size * 0.045);
  const eyeGap = eyeSize * 2.4;
  const eyesTop = faceTop + faceSize * 0.42;
  const mouthWidth = size * 0.16;
  const mouthTop = faceTop + faceSize * 0.64;

  const hairColor = HAIR_COLORS[config.hairColor];

  const mouthStyle: ViewStyle = config.expression === 'neutral'
    ? { width: mouthWidth, height: Math.max(1, size * 0.02), backgroundColor: DARK, borderRadius: 2 }
    : {
      width: config.expression === 'grin' ? mouthWidth * 1.3 : mouthWidth,
      height: config.expression === 'grin' ? size * 0.09 : size * 0.06,
      borderBottomWidth: Math.max(1.5, size * 0.03),
      borderColor: DARK,
      borderBottomLeftRadius: mouthWidth,
      borderBottomRightRadius: mouthWidth
    };

  return (
    <View
      accessibilityLabel="FamilyApp Avatar"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: BACKGROUND_COLORS[config.background], overflow: 'hidden' }}
    >
      {/* Long-hair side strands sit behind the face */}
      {config.hairstyle === 'long' ? (
        <>
          <View style={{ position: 'absolute', top: faceTop, left: faceLeft - faceSize * 0.08, width: faceSize * 0.22, height: faceSize * 0.95, borderRadius: faceSize * 0.12, backgroundColor: hairColor }} />
          <View style={{ position: 'absolute', top: faceTop, left: faceLeft + faceSize - faceSize * 0.14, width: faceSize * 0.22, height: faceSize * 0.95, borderRadius: faceSize * 0.12, backgroundColor: hairColor }} />
        </>
      ) : null}

      {/* Face */}
      <View style={{ position: 'absolute', top: faceTop, left: faceLeft, width: faceSize, height: faceSize, borderRadius: faceSize / 2, backgroundColor: SKIN_COLORS[config.skinTone] }} />

      {/* Eyes */}
      <View style={{ position: 'absolute', top: eyesTop, left: size / 2 - eyeGap / 2 - eyeSize / 2, flexDirection: 'row', gap: eyeGap - eyeSize }}>
        <Eye size={eyeSize} closed={config.expression === 'wink'} />
        <Eye size={eyeSize} closed={false} />
      </View>

      {/* Mouth */}
      <View style={[{ position: 'absolute', top: mouthTop, left: size / 2 - mouthWidth / 2 }, mouthStyle]} />

      {/* Accessory (glasses), skipped at very small sizes where it would just look muddy */}
      {!isTiny && config.accessory !== 'none' ? (
        <Accessory
          size={size}
          left={size / 2 - eyeGap / 2 - size * 0.065}
          top={eyesTop - size * 0.03}
          filled={config.accessory === 'sunglasses'}
        />
      ) : null}

      {/* Hairstyle cap, drawn on top of the face's hairline */}
      {config.hairstyle !== 'bald' ? (
        <View style={{
          position: 'absolute',
          top: faceTop - faceSize * 0.16,
          left: faceLeft - (config.hairstyle === 'long' ? faceSize * 0.04 : 0),
          width: faceSize * (config.hairstyle === 'long' ? 1.08 : 1),
          height: faceSize * 0.4,
          borderRadius: faceSize * 0.5,
          backgroundColor: hairColor
        }}
        />
      ) : null}
      {config.hairstyle === 'bun' ? (
        <View style={{ position: 'absolute', top: faceTop - faceSize * 0.3, left: size / 2 - size * 0.07, width: size * 0.14, height: size * 0.14, borderRadius: size * 0.07, backgroundColor: hairColor }} />
      ) : null}
      {config.hairstyle === 'curly' ? (
        <View style={{ position: 'absolute', top: faceTop - faceSize * 0.24, left: faceLeft + faceSize * 0.08, flexDirection: 'row', gap: size * 0.02 }}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={{ width: size * 0.13, height: size * 0.13, borderRadius: size * 0.065, backgroundColor: hairColor }} />
          ))}
        </View>
      ) : null}

      {/* Shoulders/clothing */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: size * 0.36,
        backgroundColor: TOP_COLORS[config.top],
        borderTopLeftRadius: size * 0.32,
        borderTopRightRadius: size * 0.32
      }}
      />
    </View>
  );
}

function Eye({ size, closed }: { size: number; closed: boolean }) {
  return <View style={{ width: closed ? size * 1.6 : size, height: closed ? size * 0.5 : size, borderRadius: size, backgroundColor: DARK }} />;
}

function Accessory({ size, left, top, filled }: { size: number; left: number; top: number; filled: boolean }) {
  const lensSize = size * 0.13;
  const lensStyle: ViewStyle = {
    width: lensSize,
    height: lensSize,
    borderRadius: lensSize / 2,
    borderWidth: filled ? 0 : Math.max(1, size * 0.015),
    borderColor: DARK,
    backgroundColor: filled ? DARK : 'transparent'
  };
  return (
    <View style={{ position: 'absolute', top, left, flexDirection: 'row', alignItems: 'center', gap: size * 0.06 }}>
      <View style={lensStyle} />
      <View style={lensStyle} />
    </View>
  );
}
