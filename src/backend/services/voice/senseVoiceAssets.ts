/** SenseVoiceSmall INT8; immutable revision and byte hashes, shared by iOS and Android. */
const MODEL_ORIGIN =
  'https://www.modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/73eca47697f980daa3d16112404174b6b950b514';

export const SENSE_VOICE_DIRECTORY = 'sensevoice-int8-2024-07-17';
export const SENSE_VOICE_ASSETS = [
  {
    name: 'model.int8.onnx',
    bytes: 239_233_841,
    sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51',
    url: `${MODEL_ORIGIN}/model.int8.onnx`,
  },
  {
    name: 'tokens.txt',
    bytes: 315_894,
    sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc',
    url: `${MODEL_ORIGIN}/tokens.txt`,
  },
] as const;

export const SENSE_VOICE_BYTES = SENSE_VOICE_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0);
