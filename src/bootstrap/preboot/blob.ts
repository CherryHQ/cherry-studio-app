import { Blob as ExpoBlob } from 'expo-blob';

globalThis.Blob = ExpoBlob as unknown as typeof globalThis.Blob;
