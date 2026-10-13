# JNI resolves these by class and method name.
-keep class expo.modules.jssandbox.JsSandboxNative { native <methods>; }
-keepclassmembers class * implements expo.modules.jssandbox.JsSandboxMessageSink {
    public void post(byte[]);
}
