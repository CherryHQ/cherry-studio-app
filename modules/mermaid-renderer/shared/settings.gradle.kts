pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        maven("https://maven.artifacts.botiverse.dev") {
            content { includeGroup("build.raft.mermaid") }
        }
    }
}

rootProject.name = "CherryMermaid"
