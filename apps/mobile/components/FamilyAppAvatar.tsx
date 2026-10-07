import { View, type ViewStyle } from 'react-native';

import type { AvatarConfig } from '../lib/profile';

// Exported so customization UI (the avatar editor) can render genuine color swatches
// from the exact same palette the renderer draws with, instead of a second, hand-copied
// set of hex values that could silently drift out of sync with how the avatar actually looks.
export const BACKGROUND_COLORS: Record<AvatarConfig['background'], string> = {
  peach: '#FFE0C2',
  sky: '#CFE8FF',
  mint: '#D3F5E4',
  lilac: '#E6D9FF',
  sun: '#FFF3B0'
};

export const SKIN_COLORS: Record<AvatarConfig['skinTone'], string> = {
  light: '#FCE0C2',
  medium: '#E8B98C',
  tan: '#C98A5B',
  deep: '#8B5A3C'
};

export const HAIR_COLORS: Record<AvatarConfig['hairColor'], string> = {
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
 * Kinzae's own illustrated avatar system — built entirely from plain View primitives
 * (circles/rects via borderRadius, rotation, and the zero-size/colored-border "CSS
 * triangle" trick, never an image or SVG), so it renders identically on web and native
 * with zero extra dependencies and no external assets. Deterministic: the same
 * AvatarConfig always produces the same picture.
 *
 * Composition is a head-and-shoulders bust, not a head-only disc: every measurement is a
 * fraction of `size` computed once below (never a hardcoded pixel), so the same proportions
 * hold at any render size — a small chat avatar and a large editor preview are the same
 * picture, just scaled. The outer frame stays a circle (matching the photo/initials
 * avatars this component stands in for elsewhere in the app); the head sits in its upper,
 * naturally-narrower region while the shoulders flare to fill the circle's wider lower
 * region, the same way most apps draw a default "person" avatar.
 *
 * Render order (back to front): background → back hair (long hair's strands, which pass
 * behind the shoulders) → neck → torso/clothing → head → front hair → eyebrows → eyes →
 * mouth → accessories. Hairstyles share one "crown" shape as their base (short, long, and
 * bun all start from it) so hair reads as one wrapped silhouette instead of a disconnected
 * block, and the crown/neck/torso all key off the same head measurements so nothing can
 * drift out of alignment independently.
 */
export function FamilyAppAvatar({ config, size }: { config: AvatarConfig; size: number }) {
  const isTiny = size < 32;
  const hairColor = HAIR_COLORS[config.hairColor];
  const skinColor = SKIN_COLORS[config.skinTone];
  const topColor = TOP_COLORS[config.top];

  // Head
  const headSize = size * 0.5;
  const headCenterY = size * 0.38;
  const headTop = headCenterY - headSize / 2;
  const headLeft = (size - headSize) / 2;
  const headBottom = headTop + headSize;

  // Neck + shoulders/torso — the torso is a full-width, rounded-top "dome" that the
  // circular frame naturally clips into a shoulder curve, so it never needs its own
  // special-cased corner math per option.
  const neckWidth = size * 0.24;
  const neckTop = headBottom - size * 0.05;
  const neckLeft = (size - neckWidth) / 2;
  const torsoTop = neckTop + size * 0.11;
  const torsoRadius = size * 0.3;

  // Crown (shared hair base for short/long/bun). Its height is deliberately capped well
  // short of the eyebrow line (computed below) — this is the single fix for hair clipping
  // through eyebrows/eyes/glasses on every hairstyle that uses it, rather than a per-style
  // patch: short hair, long hair's crown, and bun's crown all stop above the face instead
  // of each needing their own clipping fix.
  const crownWidth = headSize * 1.1;
  const crownHeight = headSize * 0.38;
  const crownTop = headTop - headSize * 0.08;
  const crownLeft = (size - crownWidth) / 2;

  // Face features
  const eyeSize = Math.max(1.5, size * 0.044);
  const eyeGap = eyeSize * 3.0;
  const eyesTop = headTop + headSize * 0.47;
  const browWidth = eyeSize * 2.0;
  const browTop = eyesTop - eyeSize * 1.5;
  const mouthWidth = size * 0.15;
  const mouthTop = headTop + headSize * 0.68;

  // Grin is a small filled open-mouth shape (plus a hint of teeth) rather than the old wide,
  // deeply-curved stroke — that old version got wide and curved enough to read as a
  // villain-mask grin and could reach toward the glasses. A filled shape also guarantees
  // grin reads as visibly different from smile (a thin line) at a glance, not just "a bit
  // bigger", while staying compact and low in the face.
  const grinWidth = mouthWidth * 1.12;
  const grinHeight = size * 0.062;
  const toothWidth = grinWidth * 0.62;
  const toothHeight = grinHeight * 0.4;

  const mouthStyle: ViewStyle = config.expression === 'neutral'
    ? { width: mouthWidth, height: Math.max(1, size * 0.02), backgroundColor: DARK, borderRadius: 2 }
    : config.expression === 'grin'
      ? {
        width: grinWidth,
        height: grinHeight,
        backgroundColor: DARK,
        borderTopLeftRadius: grinHeight * 0.35,
        borderTopRightRadius: grinHeight * 0.35,
        borderBottomLeftRadius: grinHeight * 0.9,
        borderBottomRightRadius: grinHeight * 0.9
      }
      : {
        width: mouthWidth,
        height: size * 0.06,
        borderBottomWidth: Math.max(1.5, size * 0.03),
        borderColor: DARK,
        borderBottomLeftRadius: mouthWidth,
        borderBottomRightRadius: mouthWidth
      };

  return (
    <View
      accessibilityLabel="Kinzae Avatar"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: BACKGROUND_COLORS[config.background], overflow: 'hidden' }}
    >
      {config.hairstyle === 'long' ? (
        <LongHairBack size={size} headTop={headTop} headLeft={headLeft} headSize={headSize} hairColor={hairColor} />
      ) : null}

      <View style={{ position: 'absolute', top: neckTop, left: neckLeft, width: neckWidth, height: size - neckTop, backgroundColor: skinColor }} />

      <View
        style={{
          position: 'absolute',
          top: torsoTop,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: topColor,
          borderTopLeftRadius: torsoRadius,
          borderTopRightRadius: torsoRadius
        }}
      />
      <ClothingDetail top={config.top} size={size} torsoTop={torsoTop} neckWidth={neckWidth} skinColor={skinColor} topColor={topColor} />

      <View style={{ position: 'absolute', top: headTop, left: headLeft, width: headSize, height: headSize, borderRadius: headSize / 2, backgroundColor: skinColor }} />

      <HairFront
        hairstyle={config.hairstyle}
        hairColor={hairColor}
        size={size}
        headTop={headTop}
        headLeft={headLeft}
        headSize={headSize}
        crownTop={crownTop}
        crownLeft={crownLeft}
        crownWidth={crownWidth}
        crownHeight={crownHeight}
      />

      <Eyebrow size={eyeSize} width={browWidth} color={hairColor} style={{ position: 'absolute', top: browTop, left: size / 2 - eyeGap / 2 - browWidth / 2 }} />
      <Eyebrow size={eyeSize} width={browWidth} color={hairColor} style={{ position: 'absolute', top: browTop, left: size / 2 + eyeGap / 2 - browWidth / 2 }} />

      <View style={{ position: 'absolute', top: eyesTop, left: size / 2 - eyeGap / 2 - eyeSize / 2, flexDirection: 'row', gap: eyeGap - eyeSize }}>
        <Eye size={eyeSize} closed={config.expression === 'wink'} compact={config.expression === 'wink' && config.accessory !== 'none'} />
        <Eye size={eyeSize} closed={false} />
      </View>

      <View style={[{ position: 'absolute', top: mouthTop, left: size / 2 - (config.expression === 'grin' ? grinWidth : mouthWidth) / 2 }, mouthStyle]}>
        {config.expression === 'grin' ? (
          <View style={{ position: 'absolute', top: grinHeight * 0.16, left: (grinWidth - toothWidth) / 2, width: toothWidth, height: toothHeight, borderRadius: toothHeight * 0.4, backgroundColor: '#FFFFFF' }} />
        ) : null}
      </View>

      {!isTiny && config.accessory !== 'none' ? (
        <Accessory size={size} eyesTop={eyesTop} eyeSize={eyeSize} eyeGap={eyeGap} filled={config.accessory === 'sunglasses'} />
      ) : null}
    </View>
  );
}

// `compact` is a small, local-only adjustment used when a wink lands under active glasses/
// sunglasses: a narrower, thinner line lifted slightly up keeps it clearly inside the lens
// with room to spare, instead of risking a visual merge with the lens's lower frame edge.
// It never changes anything when there's no accessory, and never touches the open eye.
function Eye({ size, closed, compact = false }: { size: number; closed: boolean; compact?: boolean }) {
  if (!closed) return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: DARK }} />;
  const width = compact ? size * 1.35 : size * 1.6;
  const height = compact ? size * 0.36 : size * 0.5;
  return <View style={{ width, height, borderRadius: size, backgroundColor: DARK, marginTop: compact ? -size * 0.14 : 0 }} />;
}

function Eyebrow({ size, width, color, style }: { size: number; width: number; color: string; style: ViewStyle }) {
  const height = Math.max(1, size * 0.4);
  return <View style={[style, { width, height, borderRadius: height, backgroundColor: color }]} />;
}

/** The zero-size/colored-border trick: a transparent box whose one solid border edge
 * renders as a flat-bottomed triangle. Used for shirt-collar points and the dress V-neck,
 * so clothing detail never needs real vector/path support. */
function Triangle({ size, color, style }: { size: number; color: string; style: ViewStyle }) {
  return (
    <View
      style={[
        style,
        {
          width: 0,
          height: 0,
          borderLeftWidth: size / 2,
          borderRightWidth: size / 2,
          borderTopWidth: size,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color
        }
      ]}
    />
  );
}

function Accessory({ size, eyesTop, eyeSize, eyeGap, filled }: { size: number; eyesTop: number; eyeSize: number; eyeGap: number; filled: boolean }) {
  // Sized from eyeGap (not a raw fraction of `size`) and capped well below it, so the two
  // lenses can never meet or overlap into a single solid shape — the previous geometry had
  // lensSize > eyeGap, which merged both lenses (plus the bridge) into one dark blob
  // covering the upper face. A lens at 62% of eyeGap always leaves a clear bridge gap.
  const lensSize = eyeGap * 0.62;
  const eyeCenterY = eyesTop + eyeSize / 2;
  const lensTop = eyeCenterY - lensSize / 2;
  const leftCenterX = size / 2 - eyeGap / 2;
  const rightCenterX = size / 2 + eyeGap / 2;
  const bridgeWidth = eyeGap - lensSize;
  const armWidth = size * 0.07;
  const armHeight = Math.max(1, size * 0.015);
  const lensStyle: ViewStyle = {
    position: 'absolute',
    top: lensTop,
    width: lensSize,
    height: lensSize,
    borderRadius: lensSize / 2,
    borderWidth: filled ? 0 : Math.max(1, size * 0.016),
    borderColor: DARK,
    backgroundColor: filled ? DARK : 'transparent'
  };
  return (
    <>
      {/* Bridge, connecting the two lenses across the nose */}
      <View style={{ position: 'absolute', top: eyeCenterY - armHeight / 2, left: leftCenterX + lensSize / 2, width: Math.max(0, bridgeWidth), height: armHeight, backgroundColor: DARK }} />
      {/* Temple arms, so the glasses read as attached to the head rather than floating */}
      <View style={{ position: 'absolute', top: eyeCenterY - armHeight / 2, left: leftCenterX - lensSize / 2 - armWidth, width: armWidth, height: armHeight, backgroundColor: DARK }} />
      <View style={{ position: 'absolute', top: eyeCenterY - armHeight / 2, left: rightCenterX + lensSize / 2, width: armWidth, height: armHeight, backgroundColor: DARK }} />
      <View style={[lensStyle, { left: leftCenterX - lensSize / 2 }]} />
      <View style={[lensStyle, { left: rightCenterX - lensSize / 2 }]} />
    </>
  );
}

function LongHairBack({ size, headTop, headLeft, headSize, hairColor }: { size: number; headTop: number; headLeft: number; headSize: number; hairColor: string }) {
  // Two-segment strands (a wider upper piece near the temple, a narrower lower piece
  // trailing toward the shoulder) so each side tapers instead of reading as a straight bar.
  const upperWidth = headSize * 0.3;
  const upperHeight = headSize * 0.6;
  const upperTop = headTop + headSize * 0.22;
  const lowerWidth = headSize * 0.2;
  const lowerHeight = size * 0.26;
  const lowerTop = upperTop + upperHeight - headSize * 0.08;

  const side = (fromLeftEdge: boolean) => {
    const upperLeft = fromLeftEdge ? headLeft - upperWidth * 0.32 : headLeft + headSize - upperWidth * 0.68;
    const lowerLeft = fromLeftEdge ? headLeft - lowerWidth * 0.1 : headLeft + headSize - lowerWidth * 0.9;
    return [
      <View key={`${fromLeftEdge ? 'left' : 'right'}-upper`} style={{ position: 'absolute', top: upperTop, left: upperLeft, width: upperWidth, height: upperHeight, borderRadius: upperWidth / 2, backgroundColor: hairColor }} />,
      <View key={`${fromLeftEdge ? 'left' : 'right'}-lower`} style={{ position: 'absolute', top: lowerTop, left: lowerLeft, width: lowerWidth, height: lowerHeight, borderRadius: lowerWidth / 2, backgroundColor: hairColor }} />
    ];
  };

  return <>{side(true)}{side(false)}</>;
}

function HairFront({ hairstyle, hairColor, size, headTop, headLeft, headSize, crownTop, crownLeft, crownWidth, crownHeight }: {
  hairstyle: AvatarConfig['hairstyle'];
  hairColor: string;
  size: number;
  headTop: number;
  headLeft: number;
  headSize: number;
  crownTop: number;
  crownLeft: number;
  crownWidth: number;
  crownHeight: number;
}) {
  if (hairstyle === 'bald') return null;

  // Every non-bald style shares this crown: it wraps the top of the head with a domed top
  // edge and a gently flared bottom edge (a little wider at the "sideburns" than at the
  // ears), which is what fixes the old floating-rectangle look — hair now has a silhouette
  // that actually follows the head instead of sitting arbitrarily above it.
  const crown = (
    <View
      style={{
        position: 'absolute',
        top: crownTop,
        left: crownLeft,
        width: crownWidth,
        height: crownHeight,
        borderTopLeftRadius: crownWidth / 2,
        borderTopRightRadius: crownWidth / 2,
        borderBottomLeftRadius: crownWidth * 0.16,
        borderBottomRightRadius: crownWidth * 0.16,
        backgroundColor: hairColor
      }}
    />
  );

  if (hairstyle === 'short') return crown;

  if (hairstyle === 'long') {
    // The crown alone, without the back strands (those are drawn earlier, behind the
    // torso) — this is just the top-of-head coverage long hair still needs.
    return crown;
  }

  if (hairstyle === 'bun') {
    const bunSize = size * 0.15;
    return (
      <>
        {crown}
        <View
          style={{
            position: 'absolute',
            top: crownTop - bunSize * 0.42,
            left: size / 2 - bunSize / 2,
            width: bunSize,
            height: bunSize,
            borderRadius: bunSize / 2,
            backgroundColor: hairColor
          }}
        />
      </>
    );
  }

  // Curly: a cluster of circles arranged around the head's upper arc (not stacked above
  // it), so curls read as hair wrapping the head rather than three balls floating on top.
  // The angle range and vertical compression are both tuned to keep every curl's lowest
  // edge above the eyebrow line (same margin the crown-based styles keep), even the
  // side-most curls nearest the temples.
  const curlSize = headSize * 0.32;
  const curlRadius = headSize / 2 + curlSize * 0.22;
  const centerX = headLeft + headSize / 2;
  const centerY = headTop + headSize * 0.34;
  const angles = [215, 243, 270, 297, 325];
  return (
    <>
      {angles.map((angleDeg) => {
        const angle = (angleDeg * Math.PI) / 180;
        const cx = centerX + curlRadius * Math.cos(angle);
        const cy = centerY + curlRadius * Math.sin(angle) * 0.68;
        return (
          <View
            key={angleDeg}
            style={{
              position: 'absolute',
              top: cy - curlSize / 2,
              left: cx - curlSize / 2,
              width: curlSize,
              height: curlSize,
              borderRadius: curlSize / 2,
              backgroundColor: hairColor
            }}
          />
        );
      })}
    </>
  );
}

function ClothingDetail({ top, size, torsoTop, neckWidth, skinColor, topColor }: {
  top: AvatarConfig['top'];
  size: number;
  torsoTop: number;
  neckWidth: number;
  skinColor: string;
  topColor: string;
}) {
  const centerX = size / 2;

  if (top === 'hoodie') {
    const collarWidth = neckWidth * 2.1;
    const collarHeight = size * 0.07;
    const stringWidth = Math.max(1, size * 0.013);
    const stringHeight = size * 0.07;
    return (
      <>
        <View
          style={{
            position: 'absolute',
            top: torsoTop - collarHeight * 0.4,
            left: centerX - collarWidth / 2,
            width: collarWidth,
            height: collarHeight,
            borderRadius: collarHeight / 2,
            backgroundColor: topColor
          }}
        />
        <View style={{ position: 'absolute', top: torsoTop + collarHeight * 0.3, left: centerX - stringWidth * 2.5, width: stringWidth, height: stringHeight, borderRadius: stringWidth, backgroundColor: DARK }} />
        <View style={{ position: 'absolute', top: torsoTop + collarHeight * 0.3, left: centerX + stringWidth * 1.5, width: stringWidth, height: stringHeight, borderRadius: stringWidth, backgroundColor: DARK }} />
      </>
    );
  }

  if (top === 'dress') {
    // A V-neckline notch, cut from the same skin tone as the face/neck so it reads as
    // visible skin at the collarbone rather than a background-colored hole.
    const notchSize = neckWidth * 0.95;
    return <Triangle size={notchSize} color={skinColor} style={{ position: 'absolute', top: torsoTop - notchSize * 0.08, left: centerX - notchSize / 2 }} />;
  }

  if (top === 'buttonup') {
    const pointSize = neckWidth * 0.62;
    return (
      <>
        <Triangle
          size={pointSize}
          color={topColor}
          style={{ position: 'absolute', top: torsoTop - pointSize * 0.12, left: centerX - neckWidth * 0.62, transform: [{ rotate: '34deg' }] }}
        />
        <Triangle
          size={pointSize}
          color={topColor}
          style={{ position: 'absolute', top: torsoTop - pointSize * 0.12, left: centerX + neckWidth * 0.02, transform: [{ rotate: '-34deg' }] }}
        />
      </>
    );
  }

  return null;
}
