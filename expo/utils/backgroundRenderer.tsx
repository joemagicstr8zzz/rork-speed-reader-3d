import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient as SVGLinearGradient, RadialGradient, Stop, Rect, Pattern, Circle, Path, Polygon } from 'react-native-svg';
import { GradientType, PatternType, Settings } from '@/types/document';

export const getBackgroundComponent = (settings: Settings) => {
  const { background, backgroundTheme, customBackgroundColor } = settings;

  if (background.type === 'solid' || backgroundTheme !== 'custom') {
    return null;
  }

  if (background.type === 'gradient') {
    return (
      <GradientBackground
        gradientType={background.gradientType}
        colors={background.gradientColors}
        angle={background.gradientAngle}
      />
    );
  }

  if (background.type === 'pattern') {
    return (
      <PatternBackground
        patternType={background.patternType}
        scale={background.patternScale}
        opacity={background.patternOpacity}
        patternColor={background.patternColor}
        customUrl={background.customPatternUrl}
        baseColor={customBackgroundColor}
      />
    );
  }

  return null;
};

type GradientBackgroundProps = {
  gradientType: GradientType;
  colors: string[];
  angle: number;
};

const GradientBackground: React.FC<GradientBackgroundProps> = ({ gradientType, colors, angle }) => {
  const radians = (angle * Math.PI) / 180;
  const x1 = 50 + 50 * Math.cos(radians + Math.PI);
  const y1 = 50 + 50 * Math.sin(radians + Math.PI);
  const x2 = 50 + 50 * Math.cos(radians);
  const y2 = 50 + 50 * Math.sin(radians);
  const { width, height } = useWindowDimensions();

  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          {gradientType === 'linear' ? (
            <SVGLinearGradient
              id="grad"
              x1={`${x1}%`}
              y1={`${y1}%`}
              x2={`${x2}%`}
              y2={`${y2}%`}
            >
              {colors.map((color, index) => (
                <Stop
                  key={index}
                  offset={`${(index / (colors.length - 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </SVGLinearGradient>
          ) : (
            <RadialGradient
              id="grad"
              cx="50%"
              cy="50%"
              r="50%"
            >
              {colors.map((color, index) => (
                <Stop
                  key={index}
                  offset={`${(index / (colors.length - 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </RadialGradient>
          )}
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grad)" />
      </Svg>
    </View>
  );
};

type PatternBackgroundProps = {
  patternType: PatternType;
  scale: number;
  opacity: number;
  patternColor: string;
  customUrl: string;
  baseColor: string;
};

const PatternBackground: React.FC<PatternBackgroundProps> = ({
  patternType,
  scale,
  opacity,
  patternColor,
  customUrl,
  baseColor,
}) => {
  const patternSize = (100 * scale) / 100;
  const { width, height } = useWindowDimensions();

  const renderPattern = () => {
    switch (patternType) {
      case 'hex':
        return <HexPattern size={patternSize} color={patternColor} width={width} height={height} />;
      case 'triangles':
        return <TrianglesPattern size={patternSize} color={patternColor} width={width} height={height} />;
      case 'stripes':
        return <StripesPattern size={patternSize} color={patternColor} width={width} height={height} />;
      case 'dots':
        return <DotsPattern size={patternSize} color={patternColor} width={width} height={height} />;
      case 'paper':
        return <PaperPattern size={patternSize} color={patternColor} width={width} height={height} />;
      case 'noise':
        return <NoisePattern size={patternSize} color={patternColor} width={width} height={height} />;
      case 'cloud':
        return <CloudPattern size={patternSize} color={patternColor} width={width} height={height} />;
      default:
        return null;
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: baseColor }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: opacity / 100 }]}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {renderPattern()}
        </Svg>
      </View>
    </View>
  );
};

const HexPattern: React.FC<{ size: number; color: string; width: number; height: number }> = ({ size, color, width, height }) => {
  const baseSize = 40;
  const scaledSize = (baseSize * size) / 100;

  return (
    <>
      <Defs>
        <Pattern
          id="hex"
          patternUnits="userSpaceOnUse"
          width={scaledSize * 1.5}
          height={scaledSize * Math.sqrt(3)}
        >
          <Polygon
            points={`${scaledSize * 0.5},0 ${scaledSize},${scaledSize * 0.289} ${scaledSize},${scaledSize * 0.866} ${scaledSize * 0.5},${scaledSize * 1.155} 0,${scaledSize * 0.866} 0,${scaledSize * 0.289}`}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#hex)" />
    </>
  );
};

const TrianglesPattern: React.FC<{ size: number; color: string; width: number; height: number }> = ({ size, color, width, height }) => {
  const baseSize = 40;
  const scaledSize = (baseSize * size) / 100;
  const fillOpacity = 0.15;

  return (
    <>
      <Defs>
        <Pattern
          id="triangles"
          patternUnits="userSpaceOnUse"
          width={scaledSize}
          height={scaledSize}
        >
          <Path
            d={`M0,0 L${scaledSize / 2},${scaledSize} L${scaledSize},0 Z`}
            fill={`${color}${Math.round(fillOpacity * 255).toString(16).padStart(2, '0')}`}
            stroke={color}
            strokeWidth="1.5"
          />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#triangles)" />
    </>
  );
};

const StripesPattern: React.FC<{ size: number; color: string; width: number; height: number }> = ({ size, color, width, height }) => {
  const baseSize = 20;
  const scaledSize = (baseSize * size) / 100;
  const fillOpacity = 0.2;

  return (
    <>
      <Defs>
        <Pattern
          id="stripes"
          patternUnits="userSpaceOnUse"
          width={scaledSize}
          height={scaledSize}
          patternTransform="rotate(45)"
        >
          <Rect x="0" y="0" width={scaledSize / 2} height={scaledSize} fill={`${color}${Math.round(fillOpacity * 255).toString(16).padStart(2, '0')}`} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#stripes)" />
    </>
  );
};

const DotsPattern: React.FC<{ size: number; color: string; width: number; height: number }> = ({ size, color, width, height }) => {
  const baseSize = 30;
  const scaledSize = (baseSize * size) / 100;
  const dotRadius = scaledSize / 8;

  return (
    <>
      <Defs>
        <Pattern
          id="dots"
          patternUnits="userSpaceOnUse"
          width={scaledSize}
          height={scaledSize}
        >
          <Circle cx={scaledSize / 2} cy={scaledSize / 2} r={dotRadius} fill={color} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#dots)" />
    </>
  );
};

const PaperPattern: React.FC<{ size: number; color: string; width: number; height: number }> = ({ size, color, width, height }) => {
  const baseSize = 8;
  const scaledSize = (baseSize * size) / 100;
  const opacity1 = 0.12;
  const opacity2 = 0.08;
  const opacity3 = 0.15;

  return (
    <>
      <Defs>
        <Pattern
          id="paper"
          patternUnits="userSpaceOnUse"
          width={scaledSize}
          height={scaledSize}
        >
          <Circle cx={scaledSize * 0.2} cy={scaledSize * 0.3} r="0.8" fill={`${color}${Math.round(opacity1 * 255).toString(16).padStart(2, '0')}`} />
          <Circle cx={scaledSize * 0.7} cy={scaledSize * 0.6} r="0.7" fill={`${color}${Math.round(opacity2 * 255).toString(16).padStart(2, '0')}`} />
          <Circle cx={scaledSize * 0.5} cy={scaledSize * 0.8} r="0.6" fill={`${color}${Math.round(opacity3 * 255).toString(16).padStart(2, '0')}`} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#paper)" />
    </>
  );
};

const NoisePattern: React.FC<{ size: number; color: string; width: number; height: number }> = ({ size, color, width, height }) => {
  const baseSize = 8;
  const scaledSize = (baseSize * size) / 100;

  return (
    <>
      <Defs>
        <Pattern
          id="noise"
          patternUnits="userSpaceOnUse"
          width={scaledSize}
          height={scaledSize}
        >
          {Array.from({ length: 25 }).map((_, i) => {
            const seed = i * 0.12345;
            const cx = ((Math.sin(seed) + 1) / 2) * scaledSize;
            const cy = ((Math.cos(seed * 1.3) + 1) / 2) * scaledSize;
            const r = ((Math.sin(seed * 2.1) + 1) / 2) * 0.6 + 0.4;
            const opacity = ((Math.cos(seed * 3.7) + 1) / 2) * 0.15 + 0.05;
            return (
              <Circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill={`${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`}
              />
            );
          })}
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#noise)" />
    </>
  );
};

const CloudPattern: React.FC<{ size: number; color: string; width: number; height: number }> = ({ size, color, width, height }) => {
  const baseSize = 80;
  const scaledSize = (baseSize * size) / 100;
  const opacity1 = 0.12;
  const opacity2 = 0.18;
  const opacity3 = 0.12;

  return (
    <>
      <Defs>
        <Pattern
          id="cloud"
          patternUnits="userSpaceOnUse"
          width={scaledSize}
          height={scaledSize}
        >
          <Circle cx={scaledSize * 0.3} cy={scaledSize * 0.5} r={scaledSize * 0.2} fill={`${color}${Math.round(opacity1 * 255).toString(16).padStart(2, '0')}`} />
          <Circle cx={scaledSize * 0.5} cy={scaledSize * 0.4} r={scaledSize * 0.25} fill={`${color}${Math.round(opacity2 * 255).toString(16).padStart(2, '0')}`} />
          <Circle cx={scaledSize * 0.7} cy={scaledSize * 0.5} r={scaledSize * 0.2} fill={`${color}${Math.round(opacity3 * 255).toString(16).padStart(2, '0')}`} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#cloud)" />
    </>
  );
};
