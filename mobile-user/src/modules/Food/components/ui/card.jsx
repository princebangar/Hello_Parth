// Web: modules/Food/components/ui/card.tsx. Same exports. `style` = the block, `textStyle` = its text.
// Card also accepts onPress / onClick (the web's clickable cards).
import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/native/ui';
import { shadow, useTheme } from '@/theme';
import { isAllText, pressHandler, renderTextChildren, tokensFor, uiRadius } from './tokens';

function Box({ base, style, textStyle, textBase, children, ...props }) {
  const onPress = pressHandler(props);
  const { onPress: _p, onClick: _c, ...rest } = props;
  const body = renderTextChildren(children, [textBase, textStyle]);
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[base, style]} {...rest}>
        {body}
      </Pressable>
    );
  }
  return (
    <View style={[base, style]} {...rest}>
      {body}
    </View>
  );
}

function TextBlock({ base, style, textStyle, children, numberOfLines, ...rest }) {
  if (isAllText(children)) {
    return (
      <Text style={[base, style, textStyle]} numberOfLines={numberOfLines} {...rest}>
        {children}
      </Text>
    );
  }
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }, style]} {...rest}>
      {renderTextChildren(children, [base, textStyle])}
    </View>
  );
}

function Card({ style, textStyle, children, ...props }) {
  const t = useTheme();
  const k = tokensFor(t);
  return (
    <Box
      base={{
        backgroundColor: k.card,
        flexDirection: 'column',
        gap: 24,
        borderRadius: uiRadius.xl,
        borderWidth: 1,
        borderColor: k.border,
        paddingVertical: 24,
        ...shadow.sm,
      }}
      textBase={{ color: k.cardForeground }}
      style={style}
      textStyle={textStyle}
      {...props}
    >
      {children}
    </Box>
  );
}

function CardHeader({ style, ...props }) {
  return <Box base={{ gap: 8, paddingHorizontal: 24, alignItems: 'flex-start' }} style={style} {...props} />;
}

function CardTitle({ style, ...props }) {
  const k = tokensFor(useTheme());
  return <TextBlock base={{ color: k.cardForeground, fontWeight: '600', fontSize: 16, lineHeight: 16 }} style={style} {...props} />;
}

function CardDescription({ style, ...props }) {
  const k = tokensFor(useTheme());
  return <TextBlock base={{ color: k.mutedForeground, fontSize: 14, lineHeight: 20 }} style={style} {...props} />;
}

function CardAction({ style, ...props }) {
  return <Box base={{ alignSelf: 'flex-start', marginLeft: 'auto' }} style={style} {...props} />;
}

function CardContent({ style, ...props }) {
  return <Box base={{ paddingHorizontal: 24 }} style={style} {...props} />;
}

function CardFooter({ style, ...props }) {
  return <Box base={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24 }} style={style} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
