# JNI resolves these by class and method name.
-keep class expo.modules.jssandbox.JsSandboxNative { native <methods>; }
# The sink is a lambda and only JNI calls it, so the interface method itself must survive:
# a rule on implementing classes does not reach a lambda class R8 synthesizes.
-keepclassmembers interface expo.modules.jssandbox.JsSandboxMessageSink {
    void post(byte[]);
}
