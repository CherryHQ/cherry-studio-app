import java.util.Properties

plugins {
    kotlin("multiplatform") version "2.1.21"
    kotlin("native.cocoapods") version "2.1.21"
}

version = "1.0.0"

val mermaidVersion = Properties().apply {
    file("../gradle.properties").inputStream().use { load(it) }
}.getProperty("mermaidVersion")

kotlin {
    iosArm64()
    iosSimulatorArm64()
    iosX64()

    cocoapods {
        summary = "CherryUI Mermaid rendering bridge"
        homepage = "https://github.com/CherryHQ/cherry-studio-app"
        ios.deploymentTarget = "17.0"
        framework {
            baseName = "CherryMermaid"
            isStatic = true
        }
    }

    sourceSets.commonMain.dependencies {
        implementation("build.raft.mermaid:mermaid-layout-simple:$mermaidVersion")
        implementation("build.raft.mermaid:mermaid-render-svg:$mermaidVersion")
    }
}
