import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

// 由于 Oauth 完成会自动跳转到callback界面，所以这里使用router back处理
export default function OAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    router.back();
  }, [router]);

  return <View />;
}
