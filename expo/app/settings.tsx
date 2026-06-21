import { Check, Minus, Plus, RotateCcw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appTheme } from '@/constants/colors';
import { useDocuments } from '@/contexts/DocumentContext';
import { useSettings } from '@/contexts/SettingsContext';
import { BackgroundTheme, PatternType } from '@/types/document';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, resetSettings } = useSettings();
  const { restoreSampleDocument } = useDocuments();
  const [showSaved, setShowSaved] = useState<boolean>(false);

  const THEME_OPTIONS: { value: BackgroundTheme; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'sepia', label: 'Sepia' },
    { value: 'highContrast', label: 'High Contrast' },
  ];

  const FONT_OPTIONS: { value: 'sans' | 'serif' | 'mono'; label: string }[] = [
    { value: 'sans', label: 'Sans Serif' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Monospace' },
  ];

  useEffect(() => {
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [settings]);

  return (
    <ScrollView 
      style={[styles.container, { paddingBottom: insets.bottom }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reading Speed</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Words Per Minute</Text>
          <View style={styles.controls}>
            <Pressable 
              onPress={() => updateSettings({ wpm: Math.max(50, settings.wpm - 50) })}
              style={styles.controlButton}
            >
              <Minus size={20} color="#007AFF" />
            </Pressable>
            <Text style={styles.settingValue}>{settings.wpm}</Text>
            <Pressable 
              onPress={() => updateSettings({ wpm: Math.min(1200, settings.wpm + 50) })}
              style={styles.controlButton}
            >
              <Plus size={20} color="#007AFF" />
            </Pressable>
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Chunk Size (words)</Text>
          <View style={styles.controls}>
            <Pressable 
              onPress={() => updateSettings({ chunkSize: Math.max(1, settings.chunkSize - 1) })}
              style={styles.controlButton}
            >
              <Minus size={20} color="#007AFF" />
            </Pressable>
            <Text style={styles.settingValue}>{settings.chunkSize}</Text>
            <Pressable 
              onPress={() => updateSettings({ chunkSize: Math.min(5, settings.chunkSize + 1) })}
              style={styles.controlButton}
            >
              <Plus size={20} color="#007AFF" />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display</Text>
        
        <View style={styles.settingColumn}>
          <Text style={styles.settingLabel}>Background Theme</Text>
          <View style={styles.themeGrid}>
            {THEME_OPTIONS.map((theme) => (
              <Pressable
                key={theme.value}
                onPress={() => updateSettings({ backgroundTheme: theme.value })}
                style={[
                  styles.themeButton,
                  settings.backgroundTheme === theme.value && styles.themeButtonActive
                ]}
              >
                <Text style={[
                  styles.themeButtonText,
                  settings.backgroundTheme === theme.value && styles.themeButtonTextActive
                ]}>
                  {theme.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.settingColumn}>
          <Text style={styles.settingLabel}>Font Family</Text>
          <View style={styles.themeGrid}>
            {FONT_OPTIONS.map((font) => (
              <Pressable
                key={font.value}
                onPress={() => updateSettings({ fontFamily: font.value })}
                style={[
                  styles.themeButton,
                  settings.fontFamily === font.value && styles.themeButtonActive
                ]}
              >
                <Text style={[
                  styles.themeButtonText,
                  settings.fontFamily === font.value && styles.themeButtonTextActive
                ]}>
                  {font.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Font Size</Text>
          <View style={styles.controls}>
            <Pressable 
              onPress={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })}
              style={styles.controlButton}
            >
              <Minus size={20} color="#007AFF" />
            </Pressable>
            <Text style={styles.settingValue}>{settings.fontSize}sp</Text>
            <Pressable 
              onPress={() => updateSettings({ fontSize: Math.min(48, settings.fontSize + 2) })}
              style={styles.controlButton}
            >
              <Plus size={20} color="#007AFF" />
            </Pressable>
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>ORP Highlight Strength</Text>
          <View style={styles.controls}>
            <Pressable 
              onPress={() => updateSettings({ orpStrength: Math.max(0, settings.orpStrength - 0.1) })}
              style={styles.controlButton}
            >
              <Minus size={20} color="#007AFF" />
            </Pressable>
            <Text style={styles.settingValue}>{(settings.orpStrength * 100).toFixed(0)}%</Text>
            <Pressable 
              onPress={() => updateSettings({ orpStrength: Math.min(1, settings.orpStrength + 0.1) })}
              style={styles.controlButton}
            >
              <Plus size={20} color="#007AFF" />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Background</Text>
        
        <View style={styles.settingColumn}>
          <Text style={styles.settingLabel}>Background Type</Text>
          <View style={styles.themeGrid}>
            <Pressable
              onPress={() => updateSettings({ 
                background: { ...settings.background, type: 'solid' }
              })}
              style={[
                styles.themeButton,
                settings.background.type === 'solid' && styles.themeButtonActive
              ]}
            >
              <Text style={[
                styles.themeButtonText,
                settings.background.type === 'solid' && styles.themeButtonTextActive
              ]}>
                Solid
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateSettings({ 
                background: { ...settings.background, type: 'gradient' },
                backgroundTheme: 'custom'
              })}
              style={[
                styles.themeButton,
                settings.background.type === 'gradient' && styles.themeButtonActive
              ]}
            >
              <Text style={[
                styles.themeButtonText,
                settings.background.type === 'gradient' && styles.themeButtonTextActive
              ]}>
                Gradient
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateSettings({ 
                background: { ...settings.background, type: 'pattern' },
                backgroundTheme: 'custom'
              })}
              style={[
                styles.themeButton,
                settings.background.type === 'pattern' && styles.themeButtonActive
              ]}
            >
              <Text style={[
                styles.themeButtonText,
                settings.background.type === 'pattern' && styles.themeButtonTextActive
              ]}>
                Pattern
              </Text>
            </Pressable>
          </View>
        </View>

        {settings.background.type === 'gradient' && (
          <>
            <View style={styles.settingColumn}>
              <Text style={styles.settingLabel}>Gradient Type</Text>
              <View style={styles.themeGrid}>
                <Pressable
                  onPress={() => updateSettings({ 
                    background: { ...settings.background, gradientType: 'linear' }
                  })}
                  style={[
                    styles.themeButton,
                    settings.background.gradientType === 'linear' && styles.themeButtonActive
                  ]}
                >
                  <Text style={[
                    styles.themeButtonText,
                    settings.background.gradientType === 'linear' && styles.themeButtonTextActive
                  ]}>
                    Linear
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => updateSettings({ 
                    background: { ...settings.background, gradientType: 'radial' }
                  })}
                  style={[
                    styles.themeButton,
                    settings.background.gradientType === 'radial' && styles.themeButtonActive
                  ]}
                >
                  <Text style={[
                    styles.themeButtonText,
                    settings.background.gradientType === 'radial' && styles.themeButtonTextActive
                  ]}>
                    Radial
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Gradient Angle</Text>
              <View style={styles.controls}>
                <Pressable 
                  onPress={() => updateSettings({ 
                    background: { ...settings.background, gradientAngle: (settings.background.gradientAngle - 15 + 360) % 360 }
                  })}
                  style={styles.controlButton}
                >
                  <Minus size={20} color="#007AFF" />
                </Pressable>
                <Text style={styles.settingValue}>{settings.background.gradientAngle}°</Text>
                <Pressable 
                  onPress={() => updateSettings({ 
                    background: { ...settings.background, gradientAngle: (settings.background.gradientAngle + 15) % 360 }
                  })}
                  style={styles.controlButton}
                >
                  <Plus size={20} color="#007AFF" />
                </Pressable>
              </View>
            </View>

            <View style={styles.settingColumn}>
              <Text style={styles.settingLabel}>Gradient Start Color</Text>
              <View style={styles.colorGrid}>
                {[
                  { color: '#1a1a2e', label: 'Dark Blue' },
                  { color: '#0f0e17', label: 'Dark Purple' },
                  { color: '#16213e', label: 'Navy' },
                  { color: '#1F1D36', label: 'Deep Purple' },
                  { color: '#2C3E50', label: 'Slate' },
                  { color: '#1A1A1D', label: 'Charcoal' },
                  { color: '#2E3A4A', label: 'Steel' },
                  { color: '#1B262C', label: 'Midnight' },
                  { color: '#2D4654', label: 'Ocean' },
                  { color: '#3E2C41', label: 'Plum' },
                  { color: '#2A2D34', label: 'Graphite' },
                  { color: '#483C32', label: 'Brown' },
                ].map((item) => (
                  <Pressable
                    key={item.color}
                    onPress={() => {
                      const newColors = [...settings.background.gradientColors];
                      newColors[0] = item.color;
                      updateSettings({ 
                        background: { ...settings.background, gradientColors: newColors }
                      });
                    }}
                    style={[
                      styles.colorButton,
                      { backgroundColor: item.color },
                      settings.background.gradientColors[0] === item.color && styles.colorButtonActive
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.settingColumn}>
              <Text style={styles.settingLabel}>Gradient End Color</Text>
              <View style={styles.colorGrid}>
                {[
                  { color: '#16213e', label: 'Navy' },
                  { color: '#1a1a40', label: 'Dark Blue' },
                  { color: '#2C3E50', label: 'Slate' },
                  { color: '#34495E', label: 'Wet Asphalt' },
                  { color: '#1F3A93', label: 'Royal Blue' },
                  { color: '#2A3D4E', label: 'Dark Cyan' },
                  { color: '#243447', label: 'Dark Gray' },
                  { color: '#3F4E4F', label: 'Dusk' },
                  { color: '#27496D', label: 'Blue Gray' },
                  { color: '#5F4B8B', label: 'Purple' },
                  { color: '#3D3C42', label: 'Charcoal Gray' },
                  { color: '#5C4742', label: 'Coffee' },
                ].map((item) => (
                  <Pressable
                    key={item.color}
                    onPress={() => {
                      const newColors = [...settings.background.gradientColors];
                      newColors[1] = item.color;
                      updateSettings({ 
                        background: { ...settings.background, gradientColors: newColors }
                      });
                    }}
                    style={[
                      styles.colorButton,
                      { backgroundColor: item.color },
                      settings.background.gradientColors[1] === item.color && styles.colorButtonActive
                    ]}
                  />
                ))}
              </View>
            </View>
          </>
        )}

        {settings.background.type === 'pattern' && (
          <>
            <View style={styles.settingColumn}>
              <Text style={styles.settingLabel}>Pattern</Text>
              <View style={styles.themeGrid}>
                {(['dots', 'stripes', 'hex', 'triangles', 'paper', 'noise', 'cloud'] as PatternType[]).map((pattern) => (
                  <Pressable
                    key={pattern}
                    onPress={() => updateSettings({ 
                      background: { ...settings.background, patternType: pattern }
                    })}
                    style={[
                      styles.themeButton,
                      settings.background.patternType === pattern && styles.themeButtonActive
                    ]}
                  >
                    <Text style={[
                      styles.themeButtonText,
                      settings.background.patternType === pattern && styles.themeButtonTextActive
                    ]}>
                      {pattern.charAt(0).toUpperCase() + pattern.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Pattern Scale</Text>
              <View style={styles.controls}>
                <Pressable 
                  onPress={() => updateSettings({ 
                    background: { ...settings.background, patternScale: Math.max(50, settings.background.patternScale - 10) }
                  })}
                  style={styles.controlButton}
                >
                  <Minus size={20} color="#007AFF" />
                </Pressable>
                <Text style={styles.settingValue}>{settings.background.patternScale}%</Text>
                <Pressable 
                  onPress={() => updateSettings({ 
                    background: { ...settings.background, patternScale: Math.min(200, settings.background.patternScale + 10) }
                  })}
                  style={styles.controlButton}
                >
                  <Plus size={20} color="#007AFF" />
                </Pressable>
              </View>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Pattern Opacity</Text>
              <View style={styles.controls}>
                <Pressable 
                  onPress={() => updateSettings({ 
                    background: { ...settings.background, patternOpacity: Math.max(0, settings.background.patternOpacity - 10) }
                  })}
                  style={styles.controlButton}
                >
                  <Minus size={20} color="#007AFF" />
                </Pressable>
                <Text style={styles.settingValue}>{settings.background.patternOpacity}%</Text>
                <Pressable 
                  onPress={() => updateSettings({ 
                    background: { ...settings.background, patternOpacity: Math.min(100, settings.background.patternOpacity + 10) }
                  })}
                  style={styles.controlButton}
                >
                  <Plus size={20} color="#007AFF" />
                </Pressable>
              </View>
            </View>

            <View style={styles.settingColumn}>
              <Text style={styles.settingLabel}>Base Background Color</Text>
              <View style={styles.colorGrid}>
                {[
                  { color: '#000000', label: 'Black' },
                  { color: '#1a1a2e', label: 'Dark Blue' },
                  { color: '#0f0e17', label: 'Dark Purple' },
                  { color: '#16213e', label: 'Navy' },
                  { color: '#1F1D36', label: 'Deep Purple' },
                  { color: '#2C3E50', label: 'Slate' },
                  { color: '#1A1A1D', label: 'Charcoal' },
                  { color: '#2E3A4A', label: 'Steel' },
                  { color: '#1B262C', label: 'Midnight' },
                  { color: '#2D4654', label: 'Ocean' },
                  { color: '#3E2C41', label: 'Plum' },
                  { color: '#2A2D34', label: 'Graphite' },
                ].map((item) => (
                  <Pressable
                    key={item.color}
                    onPress={() => updateSettings({ 
                      customBackgroundColor: item.color,
                      backgroundTheme: 'custom'
                    })}
                    style={[
                      styles.colorButton,
                      { backgroundColor: item.color },
                      settings.customBackgroundColor === item.color && styles.colorButtonActive
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.settingColumn}>
              <Text style={styles.settingLabel}>Pattern Color</Text>
              <View style={styles.colorGrid}>
                {[
                  { color: '#4A9EFF', label: 'Sky Blue' },
                  { color: '#FF6B9D', label: 'Pink' },
                  { color: '#50C878', label: 'Emerald' },
                  { color: '#FFB347', label: 'Orange' },
                  { color: '#B19CD9', label: 'Lavender' },
                  { color: '#FF6B6B', label: 'Coral' },
                  { color: '#4ECDC4', label: 'Turquoise' },
                  { color: '#FFE66D', label: 'Yellow' },
                  { color: '#95E1D3', label: 'Mint' },
                  { color: '#F38181', label: 'Rose' },
                  { color: '#AA96DA', label: 'Purple' },
                  { color: '#FCBAD3', label: 'Light Pink' },
                ].map((item) => (
                  <Pressable
                    key={item.color}
                    onPress={() => updateSettings({ 
                      background: { ...settings.background, patternColor: item.color }
                    })}
                    style={[
                      styles.colorButton,
                      { backgroundColor: item.color },
                      settings.background.patternColor === item.color && styles.colorButtonActive
                    ]}
                  />
                ))}
              </View>
            </View>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3D Mode</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Default Depth</Text>
          <View style={styles.controls}>
            <Pressable 
              onPress={() => updateSettings({ 
                threeD: { ...settings.threeD, depth: Math.max(20, settings.threeD.depth - 10) }
              })}
              style={styles.controlButton}
            >
              <Minus size={20} color="#007AFF" />
            </Pressable>
            <Text style={styles.settingValue}>{settings.threeD.depth}px</Text>
            <Pressable 
              onPress={() => updateSettings({ 
                threeD: { ...settings.threeD, depth: Math.min(200, settings.threeD.depth + 10) }
              })}
              style={styles.controlButton}
            >
              <Plus size={20} color="#007AFF" />
            </Pressable>
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Ghost Opacity</Text>
          <View style={styles.controls}>
            <Pressable 
              onPress={() => updateSettings({ 
                threeD: { ...settings.threeD, ghostAlpha: Math.max(0, settings.threeD.ghostAlpha - 0.1) }
              })}
              style={styles.controlButton}
            >
              <Minus size={20} color="#007AFF" />
            </Pressable>
            <Text style={styles.settingValue}>{(settings.threeD.ghostAlpha * 100).toFixed(0)}%</Text>
            <Pressable 
              onPress={() => updateSettings({ 
                threeD: { ...settings.threeD, ghostAlpha: Math.min(1, settings.threeD.ghostAlpha + 0.1) }
              })}
              style={styles.controlButton}
            >
              <Plus size={20} color="#007AFF" />
            </Pressable>
          </View>
        </View>

        <View style={styles.settingColumn}>
          <Text style={styles.settingLabel}>Default Viewing Style</Text>
          <View style={styles.themeGrid}>
            <Pressable
              onPress={() => updateSettings({ 
                threeD: { ...settings.threeD, defaultStyle: 'cross' }
              })}
              style={[
                styles.themeButton,
                settings.threeD.defaultStyle === 'cross' && styles.themeButtonActive
              ]}
            >
              <Text style={[
                styles.themeButtonText,
                settings.threeD.defaultStyle === 'cross' && styles.themeButtonTextActive
              ]}>
                Cross-Eye
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateSettings({ 
                threeD: { ...settings.threeD, defaultStyle: 'parallel' }
              })}
              style={[
                styles.themeButton,
                settings.threeD.defaultStyle === 'parallel' && styles.themeButtonActive
              ]}
            >
              <Text style={[
                styles.themeButtonText,
                settings.threeD.defaultStyle === 'parallel' && styles.themeButtonTextActive
              ]}>
                Parallel-Eye
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        
        {showSaved && (
          <View style={styles.savedIndicator}>
            <Check size={16} color="#34C759" />
            <Text style={styles.savedText}>Settings saved automatically</Text>
          </View>
        )}

        <Pressable
          onPress={restoreSampleDocument}
          style={styles.actionButton}
        >
          <Text style={styles.actionButtonText}>Restore Sample Document</Text>
        </Pressable>

        <Pressable
          onPress={resetSettings}
          style={[styles.actionButton, styles.actionButtonDanger]}
        >
          <RotateCcw size={18} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>Reset All Settings</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>
        FluxRead 3D · Version 1.0.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appTheme.colors.ink,
  },
  content: {
    padding: 18,
    paddingBottom: 48,
    gap: 18,
  },
  section: {
    borderRadius: 26,
    padding: 18,
    backgroundColor: 'rgba(18, 24, 38, 0.86)',
    borderWidth: 1,
    borderColor: appTheme.colors.stroke,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900' as const,
    color: appTheme.colors.text,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.07)',
  },
  settingColumn: {
    paddingVertical: 13,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.07)',
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: appTheme.colors.text,
    marginBottom: 6,
    flex: 1,
  },
  settingValue: {
    fontSize: 17,
    fontWeight: '900' as const,
    color: appTheme.colors.text,
    minWidth: 76,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(84, 168, 255, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(84, 168, 255, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: appTheme.colors.stroke,
  },
  themeButtonActive: {
    backgroundColor: 'rgba(94, 234, 212, 0.14)',
    borderColor: 'rgba(94, 234, 212, 0.38)',
  },
  themeButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: appTheme.colors.muted,
  },
  themeButtonTextActive: {
    color: appTheme.colors.cyan,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  colorButtonActive: {
    borderColor: appTheme.colors.cyan,
    transform: [{ scale: 1.08 }],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 18,
    backgroundColor: appTheme.colors.blueDeep,
    marginTop: 12,
  },
  actionButtonDanger: {
    backgroundColor: appTheme.colors.danger,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: '#FFFFFF',
  },
  footer: {
    fontSize: 12,
    color: appTheme.colors.muted,
    textAlign: 'center',
    marginTop: 4,
  },
  savedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(105, 225, 143, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(105, 225, 143, 0.26)',
    marginBottom: 12,
  },
  savedText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: appTheme.colors.green,
  },
});
