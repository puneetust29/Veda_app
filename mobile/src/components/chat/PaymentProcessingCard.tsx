import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors, fonts } from '../../theme';
import HeaderBackground from '../icons/HeaderBackground';

const DOT_DELAY_MS = 120;
const CYCLE_DURATION = 1200;

export default function PaymentProcessingCard() {
    const animationValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.timing(animationValue, {
                toValue: 1,
                duration: CYCLE_DURATION,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        );
        animation.start();
        return () => animation.stop();
    }, [animationValue]);

    return (
        <View style={styles.card}>
            <View style={styles.pattern}>
                <HeaderBackground width={226} height={64} />
            </View>
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <View style={styles.dotsBox}>
                        {[0, 1, 2].map((index) => {
                            const delay = index * DOT_DELAY_MS;
                            const inputRange = [
                                (delay - 200) / CYCLE_DURATION,
                                delay / CYCLE_DURATION,
                                (delay + 400) / CYCLE_DURATION,
                                (delay + 600) / CYCLE_DURATION,
                            ].map((v) => Math.max(0, Math.min(1, v)));

                            return (
                                <Animated.View
                                    key={index}
                                    style={[
                                        styles.dot,
                                        { left: index * 8 },
                                        {
                                            opacity: animationValue.interpolate({
                                                inputRange,
                                                outputRange: [0.3, 1, 1, 0.3],
                                            }),
                                            transform: [
                                                {
                                                    scale: animationValue.interpolate({
                                                        inputRange,
                                                        outputRange: [0.8, 1.2, 1.2, 0.8],
                                                    }),
                                                },
                                            ],
                                        },
                                    ]}
                                />
                            );
                        })}
                    </View>
                </View>
                <Text style={styles.text}>Payment processing...</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        alignSelf: 'center',
        backgroundColor: colors.white,
        borderRadius: 24,
        shadowColor: '#FF0000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 4,
    },
    pattern: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 16,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 9.6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dotsBox: {
        width: 24,
        height: 8,
        position: 'relative',
    },
    dot: {
        position: 'absolute',
        width: 5,
        height: 5,
        borderRadius: 2.5,
        top: 1.5,
        backgroundColor: '#FF0000',
    },
    text: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        lineHeight: 19,
        fontWeight: '600',
        color: '#000000',
    },
});
