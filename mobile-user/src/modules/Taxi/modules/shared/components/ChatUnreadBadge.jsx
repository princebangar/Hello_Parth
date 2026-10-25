import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/native/ui';

// Red unread-count dot for a chat button (the button must be position: 'relative', which every RN view is).
// The web's `className` placed it ("-right-1.5 -top-1.5" by default); here pass the same offsets as `style`
// minus the 2 px ring (e.g. className="right-2 top-2" -> style={{ right: 6, top: 6 }}).
const ChatUnreadBadge = ({ count = 0, style }) => {
  if (!count) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={`${count} unread message${count === 1 ? '' : 's'}`}
      style={[styles.badge, style]}
    >
      <Text style={styles.text}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    // 18 px dot + the 2 px white ring around it (drawn as a border, so the box is 22 px and sits 2 px further out)
    right: -8,
    top: -8,
    height: 22,
    minWidth: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    // ring-2 ring-white
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  text: { fontSize: 10, lineHeight: 12, fontWeight: '900', color: '#ffffff' },
});

export default ChatUnreadBadge;
