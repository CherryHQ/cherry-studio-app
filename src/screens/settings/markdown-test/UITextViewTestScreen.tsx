import React from 'react'
import { Alert, ScrollView, StyleSheet, Text as RNText, View } from 'react-native'
import { UITextView } from 'react-native-uitextview'

import { Container, HeaderBar, SafeAreaContainer } from '@/componentsV2'

export default function UITextViewTestScreen() {
  const onPress = React.useCallback((part?: number) => {
    Alert.alert('Pressed', `You pressed the text! Part: ${part}`)
  }, [])

  const onLongPress = React.useCallback((part?: number) => {
    Alert.alert('Long Pressed', `You long pressed the text! Part: ${part}`)
  }, [])

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title="UITextView Test" showBackButton />
      <ScrollView className="flex-1">
        <Container>
          <View style={styles.box}>
            <RNText style={styles.header}>React Native UITextView Test</RNText>

            <View>
              <RNText style={styles.subheader}>Base RN-Text, not selectable:</RNText>
              <RNText style={styles.text}>Hello world!</RNText>
            </View>

            <View>
              <RNText style={styles.subheader}>Base RN-Text, selectable:</RNText>
              <RNText selectable style={styles.text}>
                Hello world!
              </RNText>
            </View>

            <View>
              <RNText style={styles.subheader}>UITextView, selectable:</RNText>
              <UITextView selectable uiTextView style={styles.text}>
                Hello world! This text should be selectable with cursor on iOS.
              </UITextView>
            </View>

            <RNText style={styles.header}>Styles Test</RNText>

            <View>
              <RNText style={styles.subheader}>UITextView, colored:</RNText>
              <UITextView selectable uiTextView style={[styles.text, styles.coloredBlue]}>
                Blue text
              </UITextView>
              <UITextView selectable uiTextView style={[styles.text, styles.coloredHex]}>
                Hex color #804102
              </UITextView>
            </View>

            <View>
              <RNText style={styles.subheader}>UITextView, nested styles:</RNText>
              <UITextView selectable uiTextView style={styles.text}>
                Root{' '}
                <UITextView style={styles.coloredHex}>Child </UITextView>
                <UITextView style={styles.coloredBlue}>
                  Child <UITextView style={styles.coloredHsl}>Subchild</UITextView>
                </UITextView>
              </UITextView>
            </View>

            <View>
              <RNText style={styles.subheader}>UITextView, bold & italic:</RNText>
              <UITextView selectable uiTextView style={[styles.text, styles.fontBold]}>
                Bold text
              </UITextView>
              <UITextView selectable uiTextView style={[styles.text, styles.fontItalic]}>
                Italic text
              </UITextView>
            </View>

            <RNText style={styles.header}>Long Text</RNText>

            <View>
              <RNText style={styles.subheader}>UITextView, long text:</RNText>
              <UITextView selectable uiTextView style={styles.text}>
                This is a long piece of text that should wrap across multiple lines. You should be able to select any
                portion of this text by long pressing and dragging the selection handles. This is useful for copying
                specific parts of the text rather than the entire block.
              </UITextView>
            </View>

            <RNText style={styles.header}>Pressable</RNText>

            <View>
              <RNText style={styles.subheader}>UITextView with onPress:</RNText>
              <UITextView
                style={styles.text}
                selectable
                uiTextView
                onPress={() => onPress(1)}
                onLongPress={() => onLongPress(1)}>
                Press or Long Press Me
              </UITextView>
            </View>

            <View>
              <RNText style={styles.subheader}>UITextView with nested press:</RNText>
              <UITextView style={styles.text} selectable uiTextView>
                Portions of text:{' '}
                <UITextView style={[styles.text, styles.coloredBlue, styles.underlined]} onPress={() => onPress(1)}>
                  Part One
                </UITextView>{' '}
                <UITextView style={[styles.text, styles.coloredHsl, styles.underlined]} onPress={() => onPress(2)}>
                  Part Two
                </UITextView>
              </UITextView>
            </View>

            <RNText style={styles.header}>numberOfLines</RNText>

            <View>
              <RNText style={styles.subheader}>UITextView, numberOfLines=2:</RNText>
              <UITextView selectable uiTextView numberOfLines={2} ellipsizeMode="tail" style={styles.text}>
                This is a very long string that should be truncated after two lines. The text will show an ellipsis at
                the end to indicate there is more content that is not visible.
              </UITextView>
            </View>
          </View>
        </Container>
      </ScrollView>
    </SafeAreaContainer>
  )
}

const styles = StyleSheet.create({
  box: {
    gap: 20,
    paddingBottom: 100
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20
  },
  subheader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8
  },
  text: {
    fontSize: 16
  },
  coloredBlue: {
    color: 'blue'
  },
  coloredHex: {
    color: '#804102'
  },
  coloredHsl: {
    color: 'hsl(0, 100%, 50%)'
  },
  fontBold: {
    fontWeight: 'bold'
  },
  fontItalic: {
    fontStyle: 'italic'
  },
  underlined: {
    textDecorationLine: 'underline'
  }
})
