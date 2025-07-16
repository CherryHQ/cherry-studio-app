// metro.config.js

const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// [保留] 这是你自己的特殊配置，用于支持 .sql 文件
config.resolver.sourceExts.push('sql')

// [新增] 这是我们为了支持文件夹遍历而添加的配置
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
}

module.exports = config